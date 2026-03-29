# ElastiCache Redis Module

This module provisions an AWS ElastiCache Redis replication group for the Lōns platform. Redis is used as the primary data store for BullMQ message queues and application-level caching.

## Features

- **Replication Group** with automatic failover support (production-ready)
- **Redis 7.0** with encryption at rest (AES-256) and in transit (TLS)
- **Auth Token** stored securely in AWS Secrets Manager
- **Parameter Group** optimized for BullMQ workloads (allkeys-lru eviction policy)
- **Multi-AZ Deployment** when automatic failover is enabled
- **CloudWatch Logging** for slow-log and engine-log queries
- **CloudWatch Alarms** for CPU, memory, network, and eviction monitoring
- **Environment-Based Configuration** for dev, staging, and production
- **Snapshot Retention** that scales with environment (1 day for dev, 3 for staging, 7 for prod)

## Usage

Reference this module in `main.tf`:

```hcl
module "elasticache" {
  source = "./modules/elasticache"

  project_name           = var.project_name
  environment            = var.environment
  node_type              = local.env_config.redis_node_type
  num_cache_nodes        = local.env_config.redis_num_cache_nodes
  automatic_failover     = local.env_config.redis_auto_failover
  engine_version         = "7.0"
  vpc_id                 = module.vpc.vpc_id
  subnet_group_name      = module.vpc.elasticache_subnet_group_name
  redis_security_group_id = module.vpc.redis_security_group_id
  tags                   = local.common_tags
}
```

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| `project_name` | Name of the project (e.g., 'lons') | `string` | — | Yes |
| `environment` | Environment (dev, staging, prod) | `string` | — | Yes |
| `node_type` | ElastiCache node type | `string` | `cache.t3.micro` | No |
| `num_cache_nodes` | Number of cache nodes (min 1) | `number` | `2` | No |
| `automatic_failover` | Enable automatic failover | `bool` | `true` | No |
| `engine_version` | Redis engine version | `string` | `7.0` | No |
| `vpc_id` | VPC ID for deployment | `string` | — | Yes |
| `subnet_group_name` | ElastiCache subnet group name | `string` | — | Yes |
| `redis_security_group_id` | Security group ID for access control | `string` | — | Yes |
| `tags` | Common tags for all resources | `map(string)` | `{}` | No |

## Outputs

| Name | Description |
|------|-------------|
| `redis_endpoint` | Primary node endpoint address |
| `redis_port` | Redis port (6379) |
| `redis_auth_secret_arn` | ARN of the Secrets Manager auth token secret |
| `replication_group_id` | ElastiCache replication group ID |
| `replication_group_arn` | ARN of the replication group |
| `engine_version` | Redis engine version |
| `node_type` | ElastiCache node type |
| `num_cache_nodes` | Number of cache nodes |
| `parameter_group_name` | Name of the parameter group |
| `automatic_failover_enabled` | Whether automatic failover is enabled |
| `multi_az_enabled` | Whether Multi-AZ is enabled |
| `at_rest_encryption_enabled` | Whether encryption at rest is enabled |
| `transit_encryption_enabled` | Whether encryption in transit is enabled |
| `connection_string` | Full Redis connection string (sensitive output) |
| `slow_log_group_name` | CloudWatch log group for slow-log |
| `engine_log_group_name` | CloudWatch log group for engine-log |

## Environment-Specific Configuration

The module scales configuration based on the `environment` variable:

### Development
- Snapshot retention: 1 day
- CloudWatch log retention: 7 days
- Recommended: `cache.t3.micro`, 2 nodes, `automatic_failover = false`

### Staging
- Snapshot retention: 3 days
- CloudWatch log retention: 14 days
- Recommended: `cache.t3.small`, 2-3 nodes, `automatic_failover = true`

### Production
- Snapshot retention: 7 days
- CloudWatch log retention: 30 days
- Recommended: `cache.r7g.large`, 3+ nodes, `automatic_failover = true`

## Security Considerations

1. **Auth Token**: A 32-character random password is generated and stored in AWS Secrets Manager. Applications should retrieve it from Secrets Manager at runtime.
2. **Encryption at Rest**: All data is encrypted with AES-256.
3. **Encryption in Transit**: All connections must use TLS (enforced via `auth_token`).
4. **Network Access**: Access is controlled via the provided security group. Ensure inbound 6379/tcp is restricted to authorized subnets.
5. **Key Rotation**: The auth token uses the `ROTATE` update strategy to minimize impact of rotation.

## Monitoring & Alarms

The module creates CloudWatch alarms for:

- **CPU Utilization**: Alerts when > 75% for 2 periods
- **Memory Utilization**: Alerts when > 90% for 2 periods
- **Network Bytes In**: Alerts when > 100MB in 5 minutes
- **Evictions**: Alerts when any evictions occur (indicates memory pressure)

CloudWatch logs capture:

- **slow-log**: Queries exceeding the slowlog threshold (default 10ms)
- **engine-log**: General Redis operational logs

## Maintenance

### Maintenance Window
The module sets a fixed maintenance window on **Sunday 03:00-04:00 UTC** for AWS patch/upgrade operations.

### Snapshot Window
Snapshots are taken on **01:00-02:00 UTC** daily.

### Parameter Group Updates
To update Redis parameters (e.g., maxmemory-policy), modify the `aws_elasticache_parameter_group` resource and apply the changes. Most parameter changes require a reboot of the replication group.

## Gotchas & Troubleshooting

1. **Auth Token Format**: ElastiCache auth tokens are limited to 128 characters and cannot start with special characters. The module uses `random_password` which is compatible.

2. **Failover Behavior**: When `automatic_failover_enabled = true`, Multi-AZ is automatically enabled. Failover typically completes in 30-60 seconds.

3. **Capacity Planning**: Monitor the `DatabaseMemoryUsagePercentage` metric. When it approaches 90%, either increase node type or add cache nodes.

4. **Connection Pooling**: Applications (especially BullMQ workers) should use connection pooling to avoid exhausting available connections.

5. **Clock Skew**: Redis timestamps in logs are UTC. Ensure application servers are time-synchronized.

## Cost Optimization

- **Development**: Use `cache.t3.micro` (burstable, lowest cost)
- **Staging**: Use `cache.t3.small` or `cache.t3.medium`
- **Production**: Use `cache.r7g.large` or higher (memory-optimized with predictable performance)

Enable Reserved Instances for production and long-term staging deployments for 20-30% cost savings.

## Links

- [AWS ElastiCache for Redis Documentation](https://docs.aws.amazon.com/elasticache/latest/userguide/WhatIs.html)
- [Redis 7.0 Release Notes](https://raw.githubusercontent.com/redis/redis/7.0/00-RELEASENOTES)
- [Lōns Platform Architecture](../../Docs/00-overview.md)
