import { Page, expect } from '@playwright/test';
import { env } from './env';

// Signs in through the real form and the real auth service. Every spec calls
// this itself, so no journey depends on a session another one created.
// Pass path '' when the page is already on a sign-in screen.
export async function signIn(
  page: Page,
  path = '/login',
  credentials = { username: env.username, password: env.password }
): Promise<void> {
  if (path) {
    await page.goto(path);
  }
  await page.getByTestId('login-username').fill(credentials.username);
  await page.getByTestId('login-password').fill(credentials.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => !/^\/(admin-)?login/.test(url.pathname));
}

export const signInAsAdmin = (page: Page) =>
  signIn(page, '/admin-login', { username: env.adminUsername, password: env.adminPassword });

export function isOrderPost(url: string, method: string): boolean {
  return method === 'POST' && url === `${env.tradeApi}/api/v1/orders`;
}

export function isOrderHistoryGet(url: string, method: string): boolean {
  return method === 'GET' && url.startsWith(`${env.tradeApi}/api/v1/accounts/me/orders`);
}

/** Records every request matching `match` from now on; read `.length` later. */
export function recordRequests(page: Page, match: (url: string, method: string) => boolean): string[] {
  const seen: string[] = [];
  page.on('request', (req) => {
    if (match(req.url(), req.method())) {
      seen.push(req.url());
    }
  });
  return seen;
}

export async function fillTicket(
  page: Page,
  ticket: { side?: 'BUY' | 'SELL'; symbol?: string; quantity?: string; price?: string }
): Promise<void> {
  if (ticket.side) {
    await page.getByTestId(ticket.side === 'BUY' ? 'order-side-buy' : 'order-side-sell').click();
  }
  if (ticket.symbol !== undefined) {
    await page.getByTestId('order-symbol').fill(ticket.symbol);
  }
  if (ticket.quantity !== undefined) {
    await page.getByTestId('order-quantity').fill(ticket.quantity);
  }
  if (ticket.price !== undefined) {
    await page.getByTestId('order-price').fill(ticket.price);
  }
}

// Fills and submits a ticket on /orders/new and returns the Trade REST API's
// answer. Defaults to a valid BUY of 1 x 100.00.
export async function submitTicket(
  page: Page,
  ticket: { side?: 'BUY' | 'SELL'; symbol?: string; quantity?: string; price?: string } = {}
) {
  await fillTicket(page, {
    side: ticket.side ?? 'BUY',
    symbol: ticket.symbol ?? env.symbol,
    quantity: ticket.quantity ?? '1',
    price: ticket.price ?? '100.00'
  });
  const responsePromise = page.waitForResponse((res) => isOrderPost(res.url(), res.request().method()));
  await page.getByTestId('order-submit').click();
  return responsePromise;
}

export async function placeValidBuyOrder(page: Page): Promise<{ orderId: string; status: string }> {
  const response = await submitTicket(page);
  expect(response.ok(), `POST /api/v1/orders answered ${response.status()}`).toBe(true);
  return response.json();
}
