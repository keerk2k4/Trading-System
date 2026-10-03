import { safeReturnUrl } from './safe-return-url';

describe('safeReturnUrl', () => {
  const origin = 'https://trading.example';
  const fallback = '/dashboard';
  const check = (candidate: unknown) => safeReturnUrl(candidate, fallback, origin);

  it('accepts a path on this origin, keeping its query and fragment', () => {
    expect(check('/orders/history')).toBe('/orders/history');
    expect(check('/orders/history?status=FILLED#top')).toBe('/orders/history?status=FILLED#top');
  });

  it('refuses an off-origin return address', () => {
    expect(check('https://evil.example/login')).toBe(fallback);
    expect(check('http://trading.example.evil.example/')).toBe(fallback);
    expect(check('//evil.example')).toBe(fallback);
    expect(check('/\\evil.example')).toBe(fallback);
    expect(check('\\\\evil.example')).toBe(fallback);
    expect(check('/\t/evil.example')).toBe(fallback);
    expect(check('/\n/evil.example')).toBe(fallback);
  });

  it('refuses anything that is not a path', () => {
    expect(check('javascript:alert(1)')).toBe(fallback);
    expect(check('data:text/html,hi')).toBe(fallback);
    expect(check('orders/history')).toBe(fallback);
    expect(check('')).toBe(fallback);
    expect(check(undefined)).toBe(fallback);
    expect(check(['/orders/history'])).toBe(fallback);
  });

  it('defaults to the current origin', () => {
    expect(safeReturnUrl('/orders/new', fallback)).toBe('/orders/new');
    expect(safeReturnUrl('https://evil.example/', fallback)).toBe(fallback);
  });
});
