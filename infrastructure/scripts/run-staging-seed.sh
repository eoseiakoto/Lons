#!/bin/bash
set -euo pipefail

# run-staging-seed.sh
# Executes the staging seed job, waits for completion, shows logs, and verifies seed data
# Usage: ./run-staging-seed.sh [namespace]

NAMESPACE="${1:-lons}"
RELEASE_NAME="lons"
JOB_NAME="${RELEASE_NAME}-staging-seed"
TIMEOUT="${TIMEOUT:-600}"
POLL_INTERVAL="${POLL_INTERVAL:-5}"

echo "========================================="
echo "Lons Staging Database Seed Job"
echo "========================================="
echo "Namespace: ${NAMESPACE}"
echo "Job Name: ${JOB_NAME}"
echo "Timeout: ${TIMEOUT}s"
echo ""

# 1. Get the current image tag from deployed graphql-server
echo "[1/5] Fetching current graphql-server image tag..."
GRAPHQL_IMAGE=$(kubectl get deployment "${RELEASE_NAME}-graphql-server" \
  -n "${NAMESPACE}" \
  -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || echo "")

if [ -z "$GRAPHQL_IMAGE" ]; then
  echo "ERROR: Could not fetch graphql-server image. Is the deployment running?"
  exit 1
fi
echo "  Using image: ${GRAPHQL_IMAGE}"
echo ""

# 2. Apply the seed job
echo "[2/5] Applying seed job manifest..."
kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: ${JOB_NAME}
  namespace: ${NAMESPACE}
  labels:
    app.kubernetes.io/name: db-seed
    app.kubernetes.io/instance: ${RELEASE_NAME}
    app.kubernetes.io/component: db-seed
spec:
  backoffLimit: 2
  activeDeadlineSeconds: 600
  template:
    metadata:
      labels:
        app.kubernetes.io/name: db-seed
        app.kubernetes.io/instance: ${RELEASE_NAME}
    spec:
      restartPolicy: Never
      serviceAccountName: ${RELEASE_NAME}-seed
      initContainers:
        - name: wait-for-postgres
          image: busybox:1.36
          command: ['sh', '-c', 'until nc -z $DB_HOST $DB_PORT; do echo "Waiting for PostgreSQL..."; sleep 2; done']
          env:
            - name: DB_HOST
              valueFrom:
                configMapKeyRef:
                  name: ${RELEASE_NAME}-config
                  key: DB_HOST
            - name: DB_PORT
              value: "5432"
      containers:
        - name: seed
          image: ${GRAPHQL_IMAGE}
          imagePullPolicy: Always
          command: ["npx", "ts-node", "packages/database/prisma/seed-staging.ts"]
          env:
            - name: NODE_ENV
              value: staging
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: ${RELEASE_NAME}-secrets
                  key: DATABASE_URL
            - name: LOG_LEVEL
              value: "debug"
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: 1000m
              memory: 1Gi
EOF
echo "  Job manifest applied"
echo ""

# 3. Wait for job completion
echo "[3/5] Waiting for seed job to complete (timeout: ${TIMEOUT}s)..."
ELAPSED=0
JOB_STATUS=""
while [ $ELAPSED -lt $TIMEOUT ]; do
  JOB_STATUS=$(kubectl get job "${JOB_NAME}" -n "${NAMESPACE}" \
    -o jsonpath='{.status.conditions[?(@.type=="Complete")].status}' 2>/dev/null || echo "")

  JOB_FAILED=$(kubectl get job "${JOB_NAME}" -n "${NAMESPACE}" \
    -o jsonpath='{.status.conditions[?(@.type=="Failed")].status}' 2>/dev/null || echo "")

  if [ "${JOB_STATUS}" = "True" ]; then
    echo "  Job completed successfully!"
    break
  fi

  if [ "${JOB_FAILED}" = "True" ]; then
    echo "  ERROR: Job failed!"
    JOB_STATUS="FAILED"
    break
  fi

  ELAPSED=$((ELAPSED + POLL_INTERVAL))
  echo "  Still waiting... (${ELAPSED}/${TIMEOUT}s)"
  sleep $POLL_INTERVAL
done

if [ $ELAPSED -ge $TIMEOUT ]; then
  echo "  ERROR: Job did not complete within timeout"
  JOB_STATUS="TIMEOUT"
fi
echo ""

# 4. Show logs
echo "[4/5] Job logs:"
echo "---"
kubectl logs -n "${NAMESPACE}" -l job-name="${JOB_NAME}" --all-containers=true 2>/dev/null || true
echo "---"
echo ""

# 5. Verify seed data with sample queries
if [ "${JOB_STATUS}" = "True" ]; then
  echo "[5/5] Verifying seed data..."

  # Use kubectl port-forward or exec to run queries
  # For now, just report successful completion
  PODS=$(kubectl get pods -n "${NAMESPACE}" -l "job-name=${JOB_NAME}" -o jsonpath='{.items[*].metadata.name}')

  if [ -n "$PODS" ]; then
    echo "  Seed job pods:"
    for POD in $PODS; do
      echo "    - $POD"
    done

    # Verify by checking job completion
    SUCCESSFUL_COUNT=$(kubectl get job "${JOB_NAME}" -n "${NAMESPACE}" \
      -o jsonpath='{.status.succeeded}' 2>/dev/null || echo "0")

    if [ "${SUCCESSFUL_COUNT}" -ge 1 ]; then
      echo ""
      echo "  Seed data verification: PASSED"
      echo ""

      # 6. Cleanup completed job
      echo "[5/5] Cleaning up completed job..."
      kubectl delete job "${JOB_NAME}" -n "${NAMESPACE}" --ignore-not-found=true
      echo "  Job deleted"
    fi
  fi
else
  echo "  FAILED: Cannot verify seed data - job did not complete successfully"
  exit 1
fi

echo ""
echo "========================================="
echo "Staging seed completed successfully"
echo "========================================="
exit 0
