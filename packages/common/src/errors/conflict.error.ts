import { LonsBaseError } from './base.error';

export class ConflictError extends LonsBaseError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('CONFLICT', message, details);
  }
}
