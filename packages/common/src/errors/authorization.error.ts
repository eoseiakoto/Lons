import { LonsBaseError } from './base.error';

export class AuthorizationError extends LonsBaseError {
  constructor(message: string = 'Insufficient permissions') {
    super('AUTHORIZATION_ERROR', message);
  }
}
