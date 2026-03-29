import { CsrfMiddleware } from '../csrf.middleware';

describe('CsrfMiddleware', () => {
  let middleware: CsrfMiddleware;

  // Minimal response mock
  const makeMockRes = () => {
    const res: any = {
      _cookies: {} as Record<string, any>,
      _status: 200,
      _body: null as any,
    };
    res.cookie = jest.fn((name: string, value: string, _opts?: any) => {
      res._cookies[name] = value;
      return res;
    });
    res.status = jest.fn((code: number) => {
      res._status = code;
      return res;
    });
    res.json = jest.fn((body: any) => {
      res._body = body;
      return res;
    });
    return res;
  };

  beforeEach(() => {
    middleware = new CsrfMiddleware();
  });

  describe('GET requests', () => {
    it('sets the XSRF-TOKEN cookie and calls next', () => {
      const req = { method: 'GET', cookies: {} };
      const res = makeMockRes();
      const next = jest.fn();

      middleware.use(req, res, next);

      expect(res.cookie).toHaveBeenCalledWith(
        'XSRF-TOKEN',
        expect.stringMatching(/^[a-f0-9]{64}$/),
        expect.objectContaining({ httpOnly: false, sameSite: 'strict', path: '/' }),
      );
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('also calls next for HEAD and OPTIONS', () => {
      for (const method of ['HEAD', 'OPTIONS']) {
        const req = { method, cookies: {} };
        const res = makeMockRes();
        const next = jest.fn();
        middleware.use(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('POST requests — token validation', () => {
    it('returns 403 when both cookie and header are missing but cookies object is present', () => {
      const req = {
        method: 'POST',
        cookies: { someOtherCookie: 'value' },
        headers: {},
      };
      const res = makeMockRes();
      const next = jest.fn();

      middleware.use(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'CSRF_VALIDATION_FAILED' }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 when cookie is present but header is missing', () => {
      const token = 'a'.repeat(64);
      const req = {
        method: 'POST',
        cookies: { 'XSRF-TOKEN': token },
        headers: {},
      };
      const res = makeMockRes();
      const next = jest.fn();

      middleware.use(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 when cookie and header tokens do not match', () => {
      const req = {
        method: 'POST',
        cookies: { 'XSRF-TOKEN': 'a'.repeat(64) },
        headers: { 'x-xsrf-token': 'b'.repeat(64) },
      };
      const res = makeMockRes();
      const next = jest.fn();

      middleware.use(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('calls next when cookie and header tokens match', () => {
      const token = 'a'.repeat(64);
      const req = {
        method: 'POST',
        cookies: { 'XSRF-TOKEN': token },
        headers: { 'x-xsrf-token': token },
      };
      const res = makeMockRes();
      const next = jest.fn();

      middleware.use(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('also validates PUT, PATCH, DELETE', () => {
      const token = 'c'.repeat(64);
      for (const method of ['PUT', 'PATCH', 'DELETE']) {
        const req = {
          method,
          cookies: { 'XSRF-TOKEN': token },
          headers: { 'x-xsrf-token': token },
        };
        const res = makeMockRes();
        const next = jest.fn();
        middleware.use(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('API key auth (no cookies)', () => {
    it('skips CSRF check and calls next when no cookies are present', () => {
      const req = {
        method: 'POST',
        cookies: {},
        headers: { authorization: 'ApiKey secret-key' },
      };
      const res = makeMockRes();
      const next = jest.fn();

      middleware.use(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('skips when req.cookies is undefined', () => {
      const req = {
        method: 'POST',
        cookies: undefined,
        headers: {},
      };
      const res = makeMockRes();
      const next = jest.fn();

      middleware.use(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });
  });
});
