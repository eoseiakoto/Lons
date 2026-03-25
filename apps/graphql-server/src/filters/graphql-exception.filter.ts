import { Catch, ArgumentsHost, HttpException } from '@nestjs/common';
import { GqlExceptionFilter } from '@nestjs/graphql';
import { LonsBaseError } from '@lons/common';
import { GraphQLError } from 'graphql';

@Catch()
export class GraphqlExceptionFilter implements GqlExceptionFilter {
  catch(exception: unknown, _host: ArgumentsHost) {
    if (exception instanceof LonsBaseError) {
      return new GraphQLError(exception.message, {
        extensions: {
          code: exception.code,
          details: exception.details,
        },
      });
    }

    if (exception instanceof GraphQLError) {
      return exception;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message = typeof response === 'string' ? response : (response as { message: string }).message;
      return new GraphQLError(message, {
        extensions: {
          code: status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR',
        },
      });
    }

    return new GraphQLError('Internal server error', {
      extensions: { code: 'INTERNAL_ERROR' },
    });
  }
}
