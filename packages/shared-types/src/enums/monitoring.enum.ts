export enum AlertSeverity {
  info = 'info',
  warning = 'warning',
  critical = 'critical',
}

export enum AlertStatus {
  active = 'active',
  acknowledged = 'acknowledged',
  resolved = 'resolved',
}

export enum AdaptiveActionType {
  credit_freeze = 'credit_freeze',
  schedule_adjustment = 'schedule_adjustment',
  early_warning = 'early_warning',
  recovery_escalation = 'recovery_escalation',
}
