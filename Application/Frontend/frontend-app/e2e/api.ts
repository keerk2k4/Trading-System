import { APIRequestContext, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { env } from './env';

// Set-up helpers that talk to the real auth service and Trade REST API.
// Nothing here is a mock: they create the users, KYC submissions and
// reviews a journey needs, so every spec builds its own data.

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface TestUser {
  userId: string;
  username: string;
  password: string;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function apiLogin(
  request: APIRequestContext,
  username: string,
  password: string,
  admin = false
): Promise<Tokens> {
  const res = await request.post(`${env.authApi}/auth/${admin ? 'admin/login' : 'login'}`, {
    data: { username, password }
  });
  expect(res.status(), `login as ${username}`).toBe(200);
  return res.json();
}

export const loginTestUser = (request: APIRequestContext) => apiLogin(request, env.username, env.password);
export const loginAdmin = (request: APIRequestContext) =>
  apiLogin(request, env.adminUsername, env.adminPassword, true);

export function uniqueUsername(prefix = 'e2e'): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e4)}`;
}

export function registrationFor(username = uniqueUsername()) {
  return {
    username,
    email: `${username}@example.com`,
    firstName: 'E2e',
    lastName: 'Tester',
    phone: '+15550001234',
    password: 'E2e-Password-123'
  };
}

// The trading account is provisioned asynchronously (USER_REGISTERED over
// Kafka), and sign-in is refused until it exists. Every refused attempt
// counts towards the 5-attempt throttle, so this stops well short of it.
export async function waitUntilCanSignIn(request: APIRequestContext, user: TestUser): Promise<Tokens> {
  for (const delayMs of [500, 1000, 2000, 4000]) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    const res = await request.post(`${env.authApi}/auth/login`, {
      data: { username: user.username, password: user.password }
    });
    if (res.status() === 200) {
      return res.json();
    }
  }
  throw new Error(`Trading account for ${user.username} was not provisioned in time`);
}

/** Registers a brand-new customer and waits until they can sign in. */
export async function createUser(request: APIRequestContext): Promise<TestUser & { tokens: Tokens }> {
  const body = registrationFor();
  const res = await request.post(`${env.authApi}/auth/register`, { data: body });
  expect(res.status(), 'register test user').toBe(201);
  const user = { userId: (await res.json()).id as string, username: body.username, password: body.password };
  return { ...user, tokens: await waitUntilCanSignIn(request, user) };
}

export async function submitKyc(request: APIRequestContext, accessToken: string): Promise<void> {
  const res = await request.post(`${env.authApi}/kyc`, {
    headers: bearer(accessToken),
    data: { dateOfBirth: '1990-01-15', documentType: 'PASSPORT', documentNumber: `P${Date.now()}` }
  });
  expect(res.status(), 'submit KYC').toBe(201);
}

export async function reviewKyc(
  request: APIRequestContext,
  userId: string,
  approve: boolean,
  rejectionReason?: string
): Promise<void> {
  const admin = await loginAdmin(request);
  const res = await request.patch(`${env.authApi}/kyc`, {
    headers: bearer(admin.accessToken),
    data: { userId, status: approve ? 'APPROVED' : 'REJECTED', ...(approve ? {} : { rejectionReason }) }
  });
  expect(res.status(), `${approve ? 'approve' : 'reject'} KYC`).toBe(200);
}

/** Rejects a submission if it is still pending, so the admin queue does not fill up with test users. */
export async function rejectIfPending(request: APIRequestContext, userId: string): Promise<void> {
  const admin = await loginAdmin(request);
  const pending = await request.get(`${env.authApi}/kyc/pending`, { headers: bearer(admin.accessToken) });
  const rows: { userId: string }[] = pending.ok() ? await pending.json() : [];
  if (rows.some((row) => row.userId === userId)) {
    await request.patch(`${env.authApi}/kyc`, {
      headers: bearer(admin.accessToken),
      data: { userId, status: 'REJECTED', rejectionReason: 'E2E clean-up' }
    });
  }
}

export async function getOrderStatus(request: APIRequestContext, accessToken: string, orderId: string): Promise<string> {
  const res = await request.get(`${env.tradeApi}/api/v1/accounts/me/orders`, { headers: bearer(accessToken) });
  expect(res.ok()).toBe(true);
  const order = ((await res.json()) as { orderId: string; status: string }[]).find((o) => o.orderId === orderId);
  return order?.status ?? 'MISSING';
}

export async function placeOrderViaApi(
  request: APIRequestContext,
  accessToken: string,
  order: { side: 'BUY' | 'SELL'; quantity: number; price: number; symbol?: string }
) {
  return request.post(`${env.tradeApi}/api/v1/orders`, {
    headers: bearer(accessToken),
    data: {
      accountId: Number(env.accountId),
      symbol: order.symbol ?? env.symbol,
      side: order.side,
      quantity: order.quantity,
      price: order.price,
      idempotencyKey: randomUUID()
    }
  });
}

/** Deletes every watchlist whose name starts with the e2e prefix. */
export async function deleteTestWatchlists(request: APIRequestContext, accessToken: string): Promise<void> {
  const res = await request.get(`${env.tradeApi}/api/v1/watchlists`, { headers: bearer(accessToken) });
  if (!res.ok()) {
    return;
  }
  for (const list of (await res.json()) as { id: number; name: string }[]) {
    if (list.name.startsWith('E2E ')) {
      await request.delete(`${env.tradeApi}/api/v1/watchlists/${list.id}`, { headers: bearer(accessToken) });
    }
  }
}
