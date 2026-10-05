import { safeReturnUrl } from './safe-return-url';

describe('safeReturnUrl', () => {
  const origin = 'https://trading.example';
  const fallback = '/dashboard';
  const check = (candidate: unknown) => safeReturnUrl(candidate, fallback, origin);

  it('accepts a path on this origin, keeping its query', () => {
    expect(check('/orders/history?status=FILLED')).toBe('/orders/history?status=FILLED');
  });

  it('refuses an off-origin or non-path return address', () => {
    for (const hostile of ['https://evil.example/login', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '', undefined]) {
      expect(check(hostile)).toBe(fallback);
    }
  });
});
