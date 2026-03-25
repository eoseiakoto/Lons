# 12 — Non-Functional Requirements

This document defines performance, scalability, availability, and operational requirements for the Lōns platform.

---

## 1. Performance

### 1.1 Response Time Requirements

| Operation Category | Target (p95) | Target (p99) | Maximum |
|---|---|---|---|
| Overdraft transaction (end-to-end) | < 5 seconds | < 10 seconds | 30 seconds |
| Micro-loan application (auto-approve) | < 10 seconds | < 30 seconds | 60 seconds |
| Credit scoring (single customer) | < 3 seconds | < 5 seconds | 10 seconds |
| Pre-qualification check | < 1 second | < 2 seconds | 5 seconds |
| GraphQL read queries | < 200ms | < 500ms | 2 seconds |
| GraphQL mutations | < 500ms | < 1 second | 5 seconds |
| REST API endpoints | < 200ms | < 500ms | 2 seconds |
| O&M Portal page load | < 2 seconds | < 3 seconds | 5 seconds |
| Report generation (standard) | < 10 seconds | < 30 seconds | 60 seconds |
| Batch reconciliation (daily) | < 15 minutes | < 30 minutes | 60 minutes |

### 1.2 Throughput Requirements

| Metric | Target |
|---|---|
| Concurrent API requests per tenant | 500 |
| Total platform concurrent requests | 5,000 |
| Loan applications processed per minute | 200 |
| Repayment transactions per minute | 500 |
| Notification sends per minute | 1,000 |
| Webhook deliveries per minute | 500 |

### 1.3 Database Performance

| ID | Requirement | Priority |
|---|---|---|
| NFR-DB-001 | Database queries SHALL be optimized to avoid full table scans on tables with > 100K rows. | Must |
| NFR-DB-002 | All frequently accessed queries SHALL use appropriate indexes. Index usage SHALL be monitored. | Must |
| NFR-DB-003 | Database connection pooling SHALL be implemented with configurable pool sizes per service. | Must |
| NFR-DB-004 | Slow queries (> 1 second) SHALL be logged and alerted. | Must |

---

## 2. Scalability

### 2.1 Requirements

| ID | Requirement | Priority |
|---|---|---|
| NFR-SC-001 | The platform SHALL support horizontal scaling — adding more service instances to handle increased load. | Must |
| NFR-SC-002 | Auto-scaling SHALL be triggered by CPU utilization (> 70%) and memory utilization (> 80%). | Must |
| NFR-SC-003 | The platform SHALL support at least 100 tenants concurrently without degradation. | Must |
| NFR-SC-004 | Individual tenant load SHALL be isolated — one tenant's traffic spike SHALL NOT affect other tenants. | Must |
| NFR-SC-005 | The database SHALL support read replicas for scaling read-heavy workloads (reporting, analytics). | Should |
| NFR-SC-006 | Large-scale batch operations (reconciliation, bulk notifications) SHALL be processed asynchronously via job queues. | Must |
| NFR-SC-007 | The system SHALL support partitioning of historical data (contracts, ledger entries) by date for performance. | Should |

### 2.2 Capacity Targets (Year 1)

| Metric | Target |
|---|---|
| Active tenants | 50 |
| Total customers across all tenants | 5 million |
| Active loan contracts | 1 million |
| Daily transactions (disbursements + repayments) | 500,000 |
| Monthly data growth | 50 GB |

---

## 3. Availability & Reliability

### 3.1 Requirements

| ID | Requirement | Priority |
|---|---|---|
| NFR-AV-001 | The platform SHALL target 99.9% uptime (< 8.76 hours downtime per year). | Must |
| NFR-AV-002 | Planned maintenance windows SHALL be scheduled during off-peak hours with 48-hour advance notice to affected tenants. | Must |
| NFR-AV-003 | The system SHALL implement health checks for all services, with automatic restart of unhealthy instances. | Must |
| NFR-AV-004 | Database SHALL use streaming replication with automatic failover (RTO < 5 minutes). | Must |
| NFR-AV-005 | The system SHALL gracefully degrade under load — shedding non-critical operations (analytics, reporting) before affecting core lending operations. | Must |
| NFR-AV-006 | All stateless services SHALL run a minimum of 2 replicas in production. | Must |

### 3.2 Disaster Recovery

| ID | Requirement | Priority |
|---|---|---|
| NFR-DR-001 | Database backups SHALL be performed: continuous WAL archiving for point-in-time recovery, daily full backups, and backups stored in a geographically separate location. | Must |
| NFR-DR-002 | Recovery Point Objective (RPO): < 1 hour (maximum data loss). | Must |
| NFR-DR-003 | Recovery Time Objective (RTO): < 4 hours (time to restore service). | Must |
| NFR-DR-004 | Disaster recovery procedures SHALL be documented and tested at least quarterly. | Should |

---

## 4. Observability

### 4.1 Monitoring

| ID | Requirement | Priority |
|---|---|---|
| NFR-MO-001 | All services SHALL expose Prometheus-compatible metrics: request rate, error rate, latency (histogram), and resource utilization. | Must |
| NFR-MO-002 | Business metrics SHALL be tracked: loan applications per hour, approval rate, disbursement volume, repayment collection rate, and default rate. | Must |
| NFR-MO-003 | Dashboards (Grafana) SHALL be available for: system health overview, per-service metrics, per-tenant metrics, and integration health. | Must |

### 4.2 Alerting

| ID | Requirement | Priority |
|---|---|---|
| NFR-AL-001 | Alerts SHALL be configured for: service downtime, error rate exceeding threshold (> 1% of requests), latency exceeding SLA, database replication lag, disk usage > 80%, failed disbursements, reconciliation exceptions, and integration outages. | Must |
| NFR-AL-002 | Alert channels: email, Slack/Teams webhook, PagerDuty (for critical). | Should |
| NFR-AL-003 | Alerts SHALL have severity levels: info, warning, critical, with escalation rules. | Must |

### 4.3 Logging

| ID | Requirement | Priority |
|---|---|---|
| NFR-LG-001 | All services SHALL emit structured logs (JSON format) with: timestamp, service name, log level, correlation ID (traces requests across services), tenant ID, and message. | Must |
| NFR-LG-002 | Logs SHALL be aggregated into a centralized logging system (ELK Stack, Loki, or equivalent). | Must |
| NFR-LG-003 | Log retention: 30 days hot (searchable), 90 days warm (archived), 1 year cold (compressed backup). | Should |
| NFR-LG-004 | PII SHALL never appear in logs — sensitive data SHALL be masked or omitted. | Must |

### 4.4 Distributed Tracing

| ID | Requirement | Priority |
|---|---|---|
| NFR-TR-001 | The system SHALL implement distributed tracing (OpenTelemetry) across all services. | Should |
| NFR-TR-002 | Every API request SHALL generate a trace ID that propagates through all downstream service calls. | Should |
| NFR-TR-003 | Traces SHALL be visualizable in a tracing UI (Jaeger, Tempo, or equivalent). | Should |

---

## 5. Maintainability

### 5.1 Requirements

| ID | Requirement | Priority |
|---|---|---|
| NFR-MT-001 | Code SHALL follow consistent style guidelines enforced by automated linters (ESLint, Prettier for TypeScript; Black, Ruff for Python). | Must |
| NFR-MT-002 | All services SHALL have unit test coverage of at least 80% for business logic. | Should |
| NFR-MT-003 | Integration tests SHALL cover all critical paths: loan origination, repayment, and settlement. | Must |
| NFR-MT-004 | Database migrations SHALL be version-controlled and reversible. | Must |
| NFR-MT-005 | API changes SHALL follow backward-compatible evolution (no breaking changes without a version bump and deprecation period). | Must |
| NFR-MT-006 | Documentation SHALL be maintained alongside code (README per service, API docs auto-generated). | Should |

---

## 6. Internationalization & Localization

| ID | Requirement | Priority |
|---|---|---|
| NFR-I18N-001 | The O&M Portal SHALL support internationalization (i18n) with English as the default language. | Must |
| NFR-I18N-002 | All user-facing strings SHALL be externalized into translation files. | Must |
| NFR-I18N-003 | Date, time, number, and currency formatting SHALL respect the tenant's configured locale. | Must |
| NFR-I18N-004 | The system SHALL support right-to-left (RTL) layouts for future Arabic language support. | Should |
