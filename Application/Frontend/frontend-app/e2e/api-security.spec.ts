import { test, expect } from '@playwright/test';
import { createHmac, randomUUID } from 'node:crypto';
import { env } from './env';
import { bearer, createUser, getOrderStatus, loginTestUser, placeOrderViaApi } from './api';

// API-level security checks against the real services, using Playwright's
// request fixture. No browser and no mocks: these are the Trade REST API's
// and auth service's own answers. Checks for known, unfixed holes are
// test.fixme so they are listed in the report without running.

const b64url = (value: object | string) =>
  Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

/** A well-formed HS256 JWT signed with a secret the platform does not use. */
function forgedToken(claims: object): string {
  const unsigned = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(claims)}`;
  const signature = createHmac('sha256', 'not-the-platform-secret-not-the-platform-secret').update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

const now = () => Math.floor(Date.now() / 1000);

test.describe('Trade REST API authentication', () => {
  const protectedCall = () => `${env.tradeApi}/api/v1/accounts/me`;

  test('no token is refused with AUTH-401', async ({ request }) => {
    const res = await request.get(protectedCall());
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ errorCode: 'AUTH-401', message: 'Unauthorised' });
  });

  for (const [name, header] of [
    ['a non-Bearer scheme', 'Basic dGVzdDp0ZXN0'],
    ['an empty bearer token', 'Bearer '],
    ['a malformed token', 'Bearer not.a.jwt'],
    ['a token signed with the wrong secret', `Bearer ${forgedToken({ sub: 'x', accountId: 1, roles: ['CUSTOMER'], iat: now(), exp: now() + 600, iss: 'auth-service' })}`],
    ['an unsigned (alg: none) token', `Bearer ${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ sub: 'x', accountId: 1, exp: now() + 600 })}.`]
  ]) {
    test(`${name} is refused with AUTH-401`, async ({ request }) => {
      const res = await request.get(protectedCall(), { headers: { Authorization: header } });
      expect(res.status()).toBe(401);
      expect((await res.json()).errorCode).toBe('AUTH-401');
    });
  }

  test('the account comes from the token, not from the request body', async ({ request }) => {
    const { accessToken } = await loginTestUser(request);
    const res = await request.post(`${env.tradeApi}/api/v1/orders`, {
      headers: bearer(accessToken),
      data: { accountId: 1, symbol: env.symbol, side: 'BUY', quantity: 1, price: 100, idempotencyKey: randomUUID() }
    });
    expect(res.ok()).toBe(true);
    const { orderId } = await res.json();

    // The order landed on the token's account, whatever the body claimed.
    expect(await getOrderStatus(request, accessToken, orderId)).not.toBe('MISSING');
  });

  test('another account cannot be read through /accounts/{id}', async ({ request }) => {
    const { accessToken } = await loginTestUser(request);
    const otherId = Number(env.accountId) === 1 ? 2 : 1;
    const res = await request.get(`${env.tradeApi}/api/v1/accounts/${otherId}`, { headers: bearer(accessToken) });

    if (res.ok()) {
      expect((await res.json()).id).toBe(Number(env.accountId));
    } else {
      expect(res.status()).toBe(403);
    }
  });

  test('the internal account endpoints refuse a customer token', async ({ request }) => {
    const { accessToken } = await loginTestUser(request);
    const res = await request.get(`${env.tradeApi}/internal/accounts/by-user/${randomUUID()}`, { headers: bearer(accessToken) });
    expect(res.status()).toBe(401);
  });

  test('cross-origin calls are only allowed from the UI origin', async ({ request, baseURL }) => {
    const preflight = (origin: string) =>
      request.fetch(protectedCall(), {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' }
      });

    const ui = await preflight(new URL(baseURL!).origin);
    expect(ui.headers()['access-control-allow-origin']).toBe(new URL(baseURL!).origin);
    const evil = await preflight('https://evil.example');
    expect(evil.headers()['access-control-allow-origin']).toBeUndefined();
  });

  test.fixme('two orders placed at the same moment both succeed', async ({ request }) => {
    // Known bug (scan): order IDs come from MAX(order_id) + 1, so a pair of
    // simultaneous orders can collide on the primary key and one gets ERR-500.
    const { accessToken } = await loginTestUser(request);
    const [a, b] = await Promise.all([
      placeOrderViaApi(request, accessToken, { side: 'BUY', quantity: 1, price: 100 }),
      placeOrderViaApi(request, accessToken, { side: 'BUY', quantity: 1, price: 100 })
    ]);
    expect([a.status(), b.status()]).toEqual([200, 200]);
  });

  test.fixme('another customer cannot cancel my order', async ({ request }) => {
    // Known bug (scan): DELETE /api/v1/orders/{id} never checks that the
    // order belongs to the caller's account.
    const mine = await loginTestUser(request);
    const order = await (await placeOrderViaApi(request, mine.accessToken, { side: 'BUY', quantity: 1, price: 100 })).json();
    const stranger = await createUser(request);
    const res = await request.delete(`${env.tradeApi}/api/v1/orders/${order.orderId}`, { headers: bearer(stranger.tokens.accessToken) });
    expect([403, 404]).toContain(res.status());
  });

  test.fixme('a customer cannot set their own cash balance', async ({ request }) => {
    // Known bug (scan): PATCH /accounts/me/balance accepts any absolute
    // balance from the client. Money must move by amount, server-side.
    const { accessToken } = await loginTestUser(request);
    const res = await request.patch(`${env.tradeApi}/api/v1/accounts/me/balance`, {
      headers: bearer(accessToken),
      data: { cashBalance: 99999999 }
    });
    expect(res.ok()).toBe(false);
  });
});

test.describe('Auth service authorisation', () => {
  test('/auth/me needs a valid token', async ({ request }) => {
    expect((await request.get(`${env.authApi}/auth/me`)).status()).toBe(401);
    const forged = forgedToken({ sub: randomUUID(), accountId: 1, roles: ['ADMIN'], iat: now(), exp: now() + 600, iss: 'auth-service' });
    expect((await request.get(`${env.authApi}/auth/me`, { headers: bearer(forged) })).status()).toBe(401);
  });

  test('a customer cannot list or review KYC submissions', async ({ request }) => {
    const { accessToken } = await loginTestUser(request);

    const list = await request.get(`${env.authApi}/kyc/pending`, { headers: bearer(accessToken) });
    expect(list.status()).toBe(403);
    const review = await request.patch(`${env.authApi}/kyc`, {
      headers: bearer(accessToken),
      data: { userId: randomUUID(), status: 'APPROVED' }
    });
    expect(review.status()).toBe(403);
  });

  test('a forged ADMIN token cannot approve KYC', async ({ request }) => {
    const forged = forgedToken({ sub: randomUUID(), accountId: 0, roles: ['ADMIN'], iat: now(), exp: now() + 600, iss: 'auth-service' });
    const res = await request.patch(`${env.authApi}/kyc`, {
      headers: bearer(forged),
      data: { userId: randomUUID(), status: 'APPROVED' }
    });
    expect(res.status()).toBe(401);
  });

  test.fixme('admin accounts cannot be created without signing in', async ({ request }) => {
    // Known bug (scan): POST /auth/admin/register has no guard, so anyone can
    // create an administrator. Marked fixme so it does not create one.
    const res = await request.post(`${env.authApi}/auth/admin/register`, {
      data: { username: `e2e_admin_${Date.now()}`, email: 'x@example.com', firstName: 'X', lastName: 'Y', phone: '+15550001234', password: 'E2e-Password-123' }
    });
    expect(res.status()).toBe(401);
  });
});
