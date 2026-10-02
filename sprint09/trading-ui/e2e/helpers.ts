import { Page, expect } from '@playwright/test';
import { env } from './env';

// Signs in through the real form and the real auth service. Every spec calls
// this itself, so no journey depends on a session another one created.
export async function signIn(page: Page, path = '/login'): Promise<void> {
  if (path) {
    await page.goto(path);
  }
  await page.getByTestId('login-username').fill(env.username);
  await page.getByTestId('login-password').fill(env.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

export function isOrderPost(url: string, method: string): boolean {
  return method === 'POST' && url === `${env.tradeApi}/api/v1/orders`;
}

export function isOrderHistoryGet(url: string, method: string): boolean {
  return method === 'GET' && url.startsWith(`${env.tradeApi}/api/v1/accounts/me/orders`);
}

// Fills and submits a valid BUY ticket on /orders/new and returns the order
// the Trade REST API sent back.
export async function placeValidBuyOrder(page: Page): Promise<{ orderId: string; status: string }> {
  await page.getByTestId('order-side-buy').click();
  await page.getByTestId('order-symbol').fill(env.symbol);
  await page.getByTestId('order-quantity').fill('1');
  await page.getByTestId('order-price').fill('100.00');

  const responsePromise = page.waitForResponse((res) =>
    isOrderPost(res.url(), res.request().method())
  );
  await page.getByTestId('order-submit').click();
  const response = await responsePromise;

  expect(response.ok(), `POST /api/v1/orders answered ${response.status()}`).toBe(true);
  return response.json();
}
