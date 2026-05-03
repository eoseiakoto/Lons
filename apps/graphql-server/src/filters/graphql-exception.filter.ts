import { Catch, ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import { GqlExceptionFilter } from '@nestjs/graphql';
import { LonsBaseError } from '@lons/common';
import { GraphQLError } from 'graphql';

/** Map Prisma error codes to user-friendly messages */
function parsePrismaError(exception: any): GraphQLError | null {
  // PrismaClientKnownRequestError has a `code` property (e.g. P2002, P2025)
  const code = exception?.code;
  const meta = exception?.meta;

  if (code === 'P2002') {
    // Unique constraint violation
    const target = meta?.target;
    if (Array.isArray(target) && target.includes('code')) {
      return new GraphQLError('A product with this code already exists. Please use a different code.', {
        extensions: { code: 'DUPLICATE_CODE', field: 'code' },
      });
    }
    const fields = Array.isArray(target) ? target.join(', ') : String(target || 'unknown');
    return new GraphQLError(`A record with this ${fields} already exists.`, {
      extensions: { code: 'DUPLICATE_ENTRY', fields: target },
    });
  }

  if (code === 'P2025') {
    // Record not found
    return new GraphQLError('The requested record was not found.', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  if (code === 'P2003') {
    // Foreign key constraint
    return new GraphQLError('Referenced record does not exist.', {
      extensions: { code: 'INVALID_REFERENCE' },
    });
  }

  // PrismaClientValidationError — invalid field values (e.g. wrong enum value)
  if (exception?.constructor?.name === 'PrismaClientValidationError' ||
      exception?.constructor?.name === 'PrismaClientKnownRequestError') {
    const message = exception.message || '';
    // Extract the useful part from Prisma validation errors
    const enumMatch = message.match(/Invalid value for argument `(\w+)`\. Expected (\w+)\./);
    if (enumMatch) {
      return new GraphQLError(`Invalid value for field '${enumMatch[1]}'. Expected a valid ${enumMatch[2]} value.`, {
        extensions: { code: 'VALIDATION_ERROR', field: enumMatch[1] },
      });
    }
  }

  return null;
}

@Catch()
export class GraphqlExceptionFilter implements GqlExceptionFilter {
  private readonly logger = new Logger(GraphqlExceptionFilter.name);

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

    // Handle Prisma errors with user-friendly messages
    const prismaError = parsePrismaError(exception);
    if (prismaError) {
      this.logger.warn(
        `Prisma error handled: ${(exception as any)?.code || 'unknown'}`,
        exception instanceof Error ? exception.message : String(exception),
      );
      return prismaError;
    }

    // Log the actual error so we can diagnose "Internal server error" responses
    this.logger.error(
      'Unhandled exception in GraphQL resolver',
      exception instanceof Error ? exception.stack : String(exception),
    );

    return new GraphQLError('Internal server error', {
      extensions: { code: 'INTERNAL_ERROR' },
    });
  }
}
