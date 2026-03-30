import { BusinessExceptionFilter } from '../filters/business-exception.filter';
import { HttpException, HttpStatus, ArgumentsHost } from '@nestjs/common';

describe('BusinessExceptionFilter', () => {
  let filter: BusinessExceptionFilter;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new BusinessExceptionFilter();
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => ({ status: mockStatus }),
        getRequest: () => ({ headers: { 'x-correlation-id': 'corr-123' } }),
      }),
    } as unknown as ArgumentsHost;
  });

  it('should handle HttpException with correct status', () => {
    const exception = new HttpException('Not found', HttpStatus.NOT_FOUND);
    filter.catch(exception, mockHost);
    expect(mockStatus).toHaveBeenCalledWith(404);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        data: null,
        errors: expect.arrayContaining([
          expect.objectContaining({ code: 'NOT_FOUND' }),
        ]),
      }),
    );
  });

  it('should handle domain errors with code', () => {
    const exception = { code: 'INSUFFICIENT_CREDIT_LIMIT', message: 'Credit limit exceeded' };
    filter.catch(exception, mockHost);
    expect(mockStatus).toHaveBeenCalledWith(422);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({ code: 'INSUFFICIENT_CREDIT_LIMIT' }),
        ]),
      }),
    );
  });

  it('should handle unknown errors as 500', () => {
    filter.catch(new Error('Unexpected'), mockHost);
    expect(mockStatus).toHaveBeenCalledWith(500);
  });

  it('should include meta with requestId and timestamp', () => {
    filter.catch(new Error('test'), mockHost);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({
          requestId: 'corr-123',
          timestamp: expect.any(String),
        }),
      }),
    );
  });
});
