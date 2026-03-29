# Tenant Onboarding Script

Automated provisioning of new Service Provider (SP) tenants on the Lōns platform.

## Overview

The `onboard-tenant.sh` script automates the entire tenant onboarding workflow:

1. **Tenant Creation** — Creates tenant record with organization details and configuration
2. **Admin User Setup** — Provisions SP Admin user account
3. **API Credentials** — Generates Client ID and Secret for integration
4. **Default Products** — Creates one of each product type (Overdraft, Micro-Loan, BNPL, Invoice Factoring) with country-specific defaults
5. **Verification** — Validates all resources were created successfully
6. **Summary Output** — Generates onboarding summary and credentials file

## Requirements

- Bash 4.0+
- `curl` — for GraphQL API calls
- `jq` — for JSON parsing
- `uuidgen` — for UUID generation
- `openssl` — for random password generation
- Running Lōns GraphQL server (`pnpm dev` or deployed instance)

## Usage

### Basic Usage

```bash
./onboard-tenant.sh \
  --name "Ghana Microfinance Ltd" \
  --code "GMF_001" \
  --country "GH"
```

### Full Example with All Options

```bash
./onboard-tenant.sh \
  --name "Ghana Microfinance Ltd" \
  --code "GMF_001" \
  --country "GH" \
  --env staging \
  --admin-email ops@ghanamic.com \
  --contact-phone "+233201234567"
```

### Arguments

#### Required Arguments

| Argument | Description | Format |
|----------|-------------|--------|
| `--name` | Organization name | String, e.g., "Acme Lenders" |
| `--code` | Unique tenant code | 3-10 alphanumeric chars, e.g., "ACME_001" |
| `--country` | Country of operation | GH (Ghana), KE (Kenya), NG (Nigeria) |

#### Optional Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `--env` | Environment (staging/production) | staging |
| `--admin-email` | Admin user email | admin+{TENANT_CODE}@lons.io |
| `--contact-phone` | Primary contact phone | (not set) |

## What Gets Created

### Tenant Configuration

- **Isolated tenant schema** with RLS policies
- **Default settings**: currency, timezone, business hours
- **Configuration**: based on country (GH → GHS, KE → KES, NG → NGN)

### Admin User Account

- **Email**: specified or auto-generated
- **Role**: SP_ADMIN (full tenant access)
- **Status**: ACTIVE
- **Temporary Password**: auto-generated (must change on first login)

### API Credentials

- **Client ID**: unique identifier for API authentication
- **Client Secret**: kept secure, never shown again after creation
- **Scope**: full tenant access

### Default Products

One of each product type, pre-configured with country-specific defaults:

#### 1. Overdraft
- Amount range tailored to country
- Grace period: 3 days
- Penalty: 5.00 units
- Interest rate by country:
  - Ghana (GH): 5.00%
  - Kenya (KE): 6.00%
  - Nigeria (NG): 7.50%

#### 2. Micro-Loan
- Amount range: country-specific
- Tenor options: 7, 14, 30, 60, 90 days
- Origination fee: 2.5%
- Interest rate by country:
  - Ghana (GH): 10.00%
  - Kenya (KE): 12.00%
  - Nigeria (NG): 14.00%
- Repayment: Equal installments

#### 3. Buy Now Pay Later (BNPL)
- Amount range: country-specific
- Tenor: 14, 30, 60 days
- No interest
- Origination fee: 3.0%
- Grace period: 3 days

#### 4. Invoice Factoring
- Amount range: country-specific
- Tenor: 30, 60, 90 days
- Interest rate by country:
  - Ghana (GH): 3.50%
  - Kenya (KE): (3.50%)
  - Nigeria (NG): (3.50%)
- Origination fee: 1.5%
- Grace period: 7 days

## Output

The script produces two files:

### 1. Onboarding Summary (`onboarding-summary-{TENANT_CODE}.txt`)

Human-readable summary containing:
- Tenant details (ID, name, code, country, currency)
- Admin user credentials (email, temporary password)
- API credentials (Client ID, Client Secret)
- Created products with configurations
- Next steps checklist
- Support contacts
- Important security warnings

### 2. Credentials File (`.credentials-{TENANT_CODE}.env`)

Secure environment variable file containing all credentials:
- `LONS_TENANT_ID`
- `LONS_CLIENT_ID`
- `LONS_CLIENT_SECRET`
- `LONS_ADMIN_EMAIL` / `LONS_ADMIN_PASSWORD`
- `LONS_API_ENDPOINT`

**IMPORTANT**: This file has mode `600` (read/write owner only). Do NOT commit to version control.

### 3. Log File (`onboarding-{TIMESTAMP}.log`)

Complete execution log for audit/troubleshooting.

## Workflow

### Pre-Onboarding Checklist

Before running the script, ensure:

- [ ] SP agreement signed (legal approved)
- [ ] KYC/KYB documentation collected
- [ ] Jurisdiction confirmed (Ghana DPA, Kenya DPA, Nigeria NDPR)
- [ ] Products selected and terms agreed
- [ ] Integration approach confirmed (API or portal)
- [ ] GraphQL server is running and accessible

### Running the Script

```bash
# Make script executable (first time only)
chmod +x onboard-tenant.sh

# Execute
./onboard-tenant.sh --name "..." --code "..." --country "GH"
```

### Monitoring Script Execution

The script logs all operations in real-time:
- `[INFO]` — Informational messages
- `[SUCCESS]` — Completed steps
- `[WARN]` — Non-fatal issues
- `[ERROR]` — Fatal errors (exits with code 1)

### Post-Onboarding Checklist

After the script completes:

1. **Secure the credentials file**
   ```bash
   # Move to secure location with restricted access
   mv .credentials-{TENANT_CODE}.env ~/secrets/
   chmod 600 ~/secrets/.credentials-{TENANT_CODE}.env
   ```

2. **Share summary with SP**
   - Send `onboarding-summary-{TENANT_CODE}.txt` to SP operations contact
   - Use secure channel for credentials

3. **Force password change**
   - Admin must change temporary password on first login
   - Send portal URL and temporary credentials securely

4. **Configure webhook endpoints**
   - Have SP provide webhook callback URLs
   - Update tenant configuration in O&M Portal

5. **Schedule integration testing**
   - Coordinate with SP technical team
   - Verify API authentication works
   - Test loan origination → disbursement flow

6. **Monitor first 7 days**
   - Watch transaction logs for errors
   - Check reconciliation reports
   - Be available for support questions

## Error Handling

### Common Issues

**API Endpoint Unreachable**
```
ERROR: Cannot reach API endpoint: http://localhost:3000/graphql
```
*Solution*: Ensure GraphQL server is running (`pnpm dev`) and accessible.

**Failed to Create Tenant**
```
ERROR: Failed to create tenant
Response: {...error...}
```
*Solution*: Check logs for specific error. Likely issues:
- Tenant code already exists (use unique code)
- Database connectivity issue
- Invalid input format

**Failed to Generate API Key**
```
ERROR: Failed to generate API key
Response: {...error...}
```
*Solution*: Tenant and user created successfully but API key generation failed. Try again:
```bash
# Manual API key generation (see GraphQL API docs)
```

### Rollback Guidance

If the script fails partway through, you may need to manually clean up:

1. **Database cleanup** (if tenant was created):
   ```sql
   -- Connect to lons database
   DELETE FROM tenants WHERE id = '<TENANT_ID>';
   -- This will cascade-delete all tenant data (users, products, etc.)
   ```

2. **Restart the script** with same or new tenant code.

## Security Considerations

### Credentials Management

- **Client Secret** is displayed only once. Store securely.
- **Credentials file** (`.credentials-{TENANT_CODE}.env`) has mode `600`. Never commit to git.
- **Temporary password** must be changed on first login.
- Use secrets manager (AWS Secrets Manager, HashiCorp Vault) for long-term storage.

### Audit Trail

All onboarding operations are logged in the platform audit trail:
- Tenant creation
- User creation
- API key generation
- Product creation

### API Endpoint Selection

- **Staging**: `http://localhost:3000/graphql` (development)
- **Production**: `https://api.lons.io/graphql` (requires valid credentials)

## Troubleshooting

### Enable Debug Mode

To see more detailed output, edit the script and remove `set -u`:

```bash
# Instead of:
set -euo pipefail

# Use:
set -euo pipefail
# Then add 'set -x' before the operation you're debugging
set -x
# Your operation here
set +x
```

### Check Logs

```bash
# View the onboarding log
tail -f onboarding-*.log

# Search for errors
grep ERROR onboarding-*.log
```

### Verify Tenant Manually

```bash
# Using curl and jq
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { tenant(id: \"<TENANT_ID>\") { id organizationName } }"
  }' | jq .
```

## Advanced Usage

### Batch Onboarding

To onboard multiple tenants from a CSV:

```bash
#!/bin/bash
# tenants.csv format:
# name,code,country,admin_email,phone
# "Ghana Mic Ltd","GMF_001","GH","ops@ghanamic.com","+233201234567"

while IFS=',' read -r name code country email phone; do
    ./onboard-tenant.sh \
        --name "$name" \
        --code "$code" \
        --country "$country" \
        --admin-email "$email" \
        --contact-phone "$phone"
done < tenants.csv
```

### Integration with Deployment Pipeline

The script can be invoked from CI/CD (e.g., GitHub Actions, GitLab CI):

```yaml
# .github/workflows/onboard-sp.yml
name: Onboard SP Tenant
on:
  workflow_dispatch:
    inputs:
      name:
        description: 'Organization name'
      code:
        description: 'Tenant code'
      country:
        description: 'Country (GH/KE/NG)'

jobs:
  onboard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run onboarding
        run: |
          ./scripts/tenant-onboarding/onboard-tenant.sh \
            --name "${{ github.event.inputs.name }}" \
            --code "${{ github.event.inputs.code }}" \
            --country "${{ github.event.inputs.country }}" \
            --env staging
```

## Support & Documentation

- **Onboarding Runbook**: `Docs/TENANT-ONBOARDING-RUNBOOK.md`
- **Compliance Checklist**: `Docs/COMPLIANCE-CHECKLIST.md`
- **API Documentation**: See GraphQL schema at endpoint `/graphql`
- **Tenant Management Spec**: `Docs/04-entity-management.md`

## License

Copyright © Lōns Platform. All rights reserved.
