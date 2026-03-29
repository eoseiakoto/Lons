#!/usr/bin/env bash
# Build script for AWS Secrets Manager rotation Lambda artifacts
# These are required by the secrets-rotation Terraform module
#
# Usage: ./build-rotation-lambda.sh [output-dir]
# Default output: infrastructure/terraform/modules/secrets-rotation/artifacts/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="${1:-$REPO_ROOT/infrastructure/terraform/modules/secrets-rotation/artifacts}"
PYTHON_VERSION="3.11"

echo "=== Building Secrets Manager Rotation Lambda Artifacts ==="
echo "Output directory: $OUTPUT_DIR"

mkdir -p "$OUTPUT_DIR"

# --- 1. Build psycopg2 Lambda Layer ---
echo ""
echo "--- Building psycopg2 Lambda layer ---"
LAYER_DIR=$(mktemp -d)
mkdir -p "$LAYER_DIR/python"

# Use Docker to build psycopg2 for Amazon Linux 2 (Lambda runtime)
docker run --rm \
  -v "$LAYER_DIR/python:/output" \
  public.ecr.aws/lambda/python:${PYTHON_VERSION} \
  pip install psycopg2-binary -t /output --no-cache-dir

cd "$LAYER_DIR"
zip -r9 "$OUTPUT_DIR/lambda-layer-psycopg2.zip" python/
rm -rf "$LAYER_DIR"
echo "✓ Created lambda-layer-psycopg2.zip"

# --- 2. Build DB Rotation Lambda ---
echo ""
echo "--- Building database rotation Lambda ---"
LAMBDA_DIR=$(mktemp -d)

cat > "$LAMBDA_DIR/lambda_function.py" << 'PYTHON'
"""
AWS Secrets Manager Rotation Lambda for PostgreSQL (RDS).
Based on the AWS SecretsManagerRDSPostgreSQLRotationSingleUser template.

Rotation steps:
1. createSecret  — Generate new password, store as AWSPENDING
2. setSecret     — ALTER ROLE in PostgreSQL with new password
3. testSecret    — Verify connection with AWSPENDING credentials
4. finishSecret  — Promote AWSPENDING to AWSCURRENT
"""
import json
import logging
import os
import string
import secrets as py_secrets

import boto3
import psycopg2

logger = logging.getLogger()
logger.setLevel(logging.INFO)

EXCLUDE_CHARS = os.environ.get('EXCLUDE_CHARACTERS', '/@"\\\'')
PASSWORD_LENGTH = int(os.environ.get('PASSWORD_LENGTH', '32'))


def lambda_handler(event, context):
    """Main handler — dispatches to the appropriate rotation step."""
    arn = event['SecretId']
    token = event['ClientRequestToken']
    step = event['Step']

    sm_client = boto3.client('secretsmanager')

    # Verify the secret exists and the version is staged correctly
    metadata = sm_client.describe_secret(SecretId=arn)
    if not metadata.get('RotationEnabled'):
        raise ValueError(f"Secret {arn} does not have rotation enabled.")

    versions = metadata.get('VersionIdsToStages', {})
    if token not in versions:
        raise ValueError(f"Secret version {token} has no stage for rotation of secret {arn}.")

    if 'AWSCURRENT' in versions[token]:
        logger.info(f"Secret version {token} already set as AWSCURRENT for secret {arn}.")
        return

    if 'AWSPENDING' not in versions[token]:
        raise ValueError(f"Secret version {token} not set as AWSPENDING for rotation of secret {arn}.")

    dispatch = {
        'createSecret': create_secret,
        'setSecret': set_secret,
        'testSecret': test_secret,
        'finishSecret': finish_secret,
    }

    if step not in dispatch:
        raise ValueError(f"Invalid step: {step}")

    dispatch[step](sm_client, arn, token)


def create_secret(sm_client, arn, token):
    """Create a new secret version with a generated password."""
    current = sm_client.get_secret_value(SecretId=arn, VersionStage='AWSCURRENT')
    current_dict = json.loads(current['SecretString'])

    # Generate a new password
    alphabet = string.ascii_letters + string.digits + '!#$%&()*+,-./:;<=>?@[]^_{|}~'
    alphabet = ''.join(c for c in alphabet if c not in EXCLUDE_CHARS)
    new_password = ''.join(py_secrets.choice(alphabet) for _ in range(PASSWORD_LENGTH))

    current_dict['password'] = new_password

    try:
        sm_client.get_secret_value(SecretId=arn, VersionId=token, VersionStage='AWSPENDING')
        logger.info(f"createSecret: AWSPENDING version {token} already exists.")
    except sm_client.exceptions.ResourceNotFoundException:
        sm_client.put_secret_value(
            SecretId=arn,
            ClientRequestToken=token,
            SecretString=json.dumps(current_dict),
            VersionStages=['AWSPENDING'],
        )
        logger.info(f"createSecret: Successfully created AWSPENDING version {token}.")


def set_secret(sm_client, arn, token):
    """Set the new password in the PostgreSQL database."""
    pending = json.loads(
        sm_client.get_secret_value(SecretId=arn, VersionId=token, VersionStage='AWSPENDING')['SecretString']
    )
    current = json.loads(
        sm_client.get_secret_value(SecretId=arn, VersionStage='AWSCURRENT')['SecretString']
    )

    # Connect with current credentials and ALTER the password
    conn = psycopg2.connect(
        host=current['host'],
        port=current.get('port', 5432),
        dbname=current.get('dbname', 'lons'),
        user=current['username'],
        password=current['password'],
        connect_timeout=5,
    )
    conn.autocommit = True
    with conn.cursor() as cur:
        # Use format to avoid SQL injection (username is trusted — from Secrets Manager)
        cur.execute(
            "ALTER ROLE %s WITH PASSWORD %%s" % pending['username'],
            (pending['password'],),
        )
    conn.close()
    logger.info(f"setSecret: Successfully set password for {pending['username']}.")


def test_secret(sm_client, arn, token):
    """Test the new credentials by connecting to PostgreSQL."""
    pending = json.loads(
        sm_client.get_secret_value(SecretId=arn, VersionId=token, VersionStage='AWSPENDING')['SecretString']
    )

    conn = psycopg2.connect(
        host=pending['host'],
        port=pending.get('port', 5432),
        dbname=pending.get('dbname', 'lons'),
        user=pending['username'],
        password=pending['password'],
        connect_timeout=5,
    )
    conn.close()
    logger.info(f"testSecret: Successfully connected with AWSPENDING credentials.")


def finish_secret(sm_client, arn, token):
    """Promote AWSPENDING to AWSCURRENT."""
    metadata = sm_client.describe_secret(SecretId=arn)
    versions = metadata.get('VersionIdsToStages', {})

    current_version = None
    for version_id, stages in versions.items():
        if 'AWSCURRENT' in stages:
            if version_id == token:
                logger.info(f"finishSecret: Version {token} is already AWSCURRENT.")
                return
            current_version = version_id
            break

    sm_client.update_secret_version_stage(
        SecretId=arn,
        VersionStage='AWSCURRENT',
        MoveToVersionId=token,
        RemoveFromVersionId=current_version,
    )
    logger.info(f"finishSecret: Successfully promoted {token} to AWSCURRENT (previous: {current_version}).")
PYTHON

cd "$LAMBDA_DIR"
zip -r9 "$OUTPUT_DIR/lambda-db-rotation.zip" lambda_function.py
rm -rf "$LAMBDA_DIR"
echo "✓ Created lambda-db-rotation.zip"

# --- 3. Add artifacts to .gitignore ---
GITIGNORE="$OUTPUT_DIR/.gitignore"
if [ ! -f "$GITIGNORE" ]; then
  echo "# Lambda build artifacts (generated by build-rotation-lambda.sh)" > "$GITIGNORE"
  echo "*.zip" >> "$GITIGNORE"
  echo "✓ Created .gitignore for artifacts directory"
fi

echo ""
echo "=== Build Complete ==="
echo "Artifacts:"
ls -lh "$OUTPUT_DIR"/*.zip
echo ""
echo "Next steps:"
echo "  1. Upload artifacts to S3 or reference locally in Terraform"
echo "  2. Run: terraform apply -target module.secrets_rotation"
