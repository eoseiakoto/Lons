import { LonsBaseError } from './base.error';

export class NotFoundError extends LonsBaseError {
  constructor(resourceType: string, resourceId: string) {
    super('NOT_FOUND', `${resourceType} with id ${resourceId} not found`, {
      resourceType,
      resourceId,
    });
  }
}
