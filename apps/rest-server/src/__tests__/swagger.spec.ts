/**
 * S19-10 — OpenAPI/Swagger decorator coverage smoke test.
 *
 * Booting the full `AppModule` (or even a stripped-down NestJS testing
 * module) in this app pulls in Prisma + Redis + BullMQ workers via the
 * `@lons/process-engine` package, which is unsuitable for unit tests
 * (we time out at module-init). Instead, we inspect the controller class
 * metadata directly via `Reflect.getMetadata` — the same store
 * `SwaggerModule.createDocument` reads from. This validates that the
 * @nestjs/swagger decorators are correctly attached without any DI cost.
 *
 * The assertions mirror what an OpenAPI consumer would see:
 *   - Every controller class has an `@ApiTags` group.
 *   - Every handler has an `@ApiOperation` summary.
 *   - Every handler declares at least one `@ApiResponse` code.
 *   - The five canonical resource controllers expose routes under the
 *     expected REST path prefixes.
 *
 * A separate test asserts the `X-API-Version` response header is set by
 * the envelope interceptor (added in S19-10).
 */

import 'reflect-metadata';
import { DECORATORS } from '@nestjs/swagger/dist/constants';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { of } from 'rxjs';

import { CustomerController } from '../customer/customer.controller';
import { ProductController } from '../product/product.controller';
import { LoanRequestController } from '../loan-request/loan-request.controller';
import { ContractController } from '../contract/contract.controller';
import { RepaymentController } from '../repayment/repayment.controller';
import { WebhookController } from '../webhook/webhook.controller';
import { ApiKeyController } from '../api-key/api-key.controller';
import { BnplController } from '../bnpl/bnpl.controller';
import { FactoringController } from '../factoring/factoring.controller';
import { PublicController } from '../public/public.controller';
import { WalletWebhookController } from '../wallet-webhook/wallet-webhook.controller';
import { DebtorPaymentWebhookController } from '../debtor-payment-webhook/debtor-payment-webhook.controller';
import { UsageController } from '../usage/usage.controller';
import { ResponseEnvelopeInterceptor } from '../interceptors/response-envelope.interceptor';

interface ControllerFixture {
  name: string;
  cls: any;
  expectedTag: string;
  expectedPath: string; // controller-level @Controller(...) path
}

const CONTROLLERS: ControllerFixture[] = [
  { name: 'CustomerController', cls: CustomerController, expectedTag: 'Customers', expectedPath: 'customers' },
  { name: 'ProductController', cls: ProductController, expectedTag: 'Products', expectedPath: 'products' },
  { name: 'LoanRequestController', cls: LoanRequestController, expectedTag: 'Loan Requests', expectedPath: 'loan-requests' },
  { name: 'ContractController', cls: ContractController, expectedTag: 'Contracts', expectedPath: 'contracts' },
  { name: 'RepaymentController', cls: RepaymentController, expectedTag: 'Repayments', expectedPath: 'repayments' },
  { name: 'WebhookController', cls: WebhookController, expectedTag: 'Webhooks', expectedPath: 'webhooks' },
  { name: 'ApiKeyController', cls: ApiKeyController, expectedTag: 'API Keys', expectedPath: 'api-keys' },
  { name: 'BnplController', cls: BnplController, expectedTag: 'BNPL', expectedPath: 'bnpl' },
  // FactoringController uses `@Controller()` with no arg — Nest reports
  // the path as "/". Its routes are rooted directly under /v1 (the global
  // prefix in main.ts), e.g. /v1/invoices/submit.
  { name: 'FactoringController', cls: FactoringController, expectedTag: 'Invoice Factoring', expectedPath: '/' },
  { name: 'PublicController', cls: PublicController, expectedTag: 'Public', expectedPath: 'public' },
  { name: 'WalletWebhookController', cls: WalletWebhookController, expectedTag: 'Wallet Webhooks', expectedPath: 'webhooks' },
  { name: 'DebtorPaymentWebhookController', cls: DebtorPaymentWebhookController, expectedTag: 'Debtor Payment Webhooks', expectedPath: 'webhooks' },
  { name: 'UsageController', cls: UsageController, expectedTag: 'Usage', expectedPath: 'usage' },
];

/**
 * Walks a controller prototype, picking out every method decorated with
 * an HTTP verb (POST, GET, etc.). Returns the method names.
 */
function getHttpHandlerNames(cls: any): string[] {
  const proto = cls.prototype;
  return Object.getOwnPropertyNames(proto).filter((name) => {
    if (name === 'constructor') return false;
    const method = Reflect.getMetadata(METHOD_METADATA, proto[name]);
    return typeof method === 'number'; // RequestMethod enum
  });
}

describe('OpenAPI / Swagger decorator coverage', () => {
  describe.each(CONTROLLERS)('$name', ({ cls, expectedTag, expectedPath }) => {
    it('has @ApiTags with the expected human-readable group', () => {
      const tags = Reflect.getMetadata(DECORATORS.API_TAGS, cls) as string[] | undefined;
      expect(tags).toBeDefined();
      expect(tags).toContain(expectedTag);
    });

    it('is bound to the expected controller path', () => {
      const path = Reflect.getMetadata(PATH_METADATA, cls);
      expect(path).toBe(expectedPath);
    });

    it('every HTTP handler has @ApiOperation', () => {
      const handlers = getHttpHandlerNames(cls);
      expect(handlers.length).toBeGreaterThan(0);
      const missing: string[] = [];
      for (const name of handlers) {
        const op = Reflect.getMetadata(DECORATORS.API_OPERATION, cls.prototype[name]);
        if (!op || !op.summary) missing.push(name);
      }
      expect(missing).toEqual([]);
    });

    it('every HTTP handler declares at least one @ApiResponse', () => {
      const handlers = getHttpHandlerNames(cls);
      const missing: string[] = [];
      for (const name of handlers) {
        const responses = Reflect.getMetadata(DECORATORS.API_RESPONSE, cls.prototype[name]);
        if (!responses || Object.keys(responses).length === 0) {
          missing.push(name);
        }
      }
      expect(missing).toEqual([]);
    });
  });

  it('covers all 13 controllers required by S19-10', () => {
    expect(CONTROLLERS).toHaveLength(13);
  });

  it('canonical REST resource controllers are present', () => {
    const tags = CONTROLLERS.map((c) => c.expectedTag);
    for (const t of ['Customers', 'Products', 'Loan Requests', 'Contracts', 'Repayments']) {
      expect(tags).toContain(t);
    }
  });
});

describe('X-API-Version response header', () => {
  it('is set to "1.0" on every response by ResponseEnvelopeInterceptor', (done) => {
    const interceptor = new ResponseEnvelopeInterceptor();
    const headers: Record<string, string> = {};
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
        getResponse: () => ({
          setHeader: (name: string, value: string) => {
            headers[name] = value;
          },
        }),
      }),
    } as any;
    const handler = { handle: () => of({ status: 'ok' }) };

    interceptor.intercept(context, handler).subscribe(() => {
      expect(headers['X-API-Version']).toBe('1.0');
      done();
    });
  });
});
