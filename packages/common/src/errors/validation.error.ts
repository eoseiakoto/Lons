import { LonsBaseError } from './base.error';

export class ValidationError extends LonsBaseError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, details);
  }
}
