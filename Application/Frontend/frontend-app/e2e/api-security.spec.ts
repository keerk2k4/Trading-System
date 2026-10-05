import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { env } from './env';
import { bearer, loginTestUser, placeOrderViaApi } from './api';

// The Trade REST API's own authorisation decisions, checked with Playwright's
// request fixture against the real service. The route guards in the UI are
// a usability control; these are the controls that actually protect data.
test.describe('Trade REST API authorisation', () => {
  test('a request with no token is refused with AUTH-401', async ({ request }) => {
    const res = await request.get(`${env.tradeApi}/api/v1/accounts/me`);

    expect(res.status()).toBe(401);
    expect((await res.json()).errorCode).toBe('AUTH-401');
  });

  test('re-sending the same idempotency key is refused and places no second order', async ({ request }) => {
    const { accessToken } = await loginTestUser(request);
    const idempotencyKey = randomUUID();
    const order = { side: 'BUY' as const, quantity: 1, price: 100, idempotencyKey };

    const first = await placeOrderViaApi(request, accessToken, order);
    expect(first.ok(), `first POST answered ${first.status()}`).toBe(true);
    const second = await placeOrderViaApi(request, accessToken, order);

    expect(second.status()).toBe(409);
    expect((await second.json()).errorCode).toBe('ORD-409');
    const history = await request.get(`${env.tradeApi}/api/v1/accounts/me/orders`, { headers: bearer(accessToken) });
    const withKey = ((await history.json()) as { idempotencyKey: string }[]).filter((o) => o.idempotencyKey === idempotencyKey);
    expect(withKey).toHaveLength(1);
  });
});
