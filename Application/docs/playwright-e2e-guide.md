# Playwright End-to-End Tests: the complete guide

This guide explains **Playwright** from zero and then walks through the project's end-to-end (E2E) test suite:
every file, what each one does, and how they work together. It uses **real journeys** (sign in, register, submit
and review KYC, place an order, deposit funds, manage a watchlist, refresh a token…) to show where each file comes into play.

- **Code location:** [Application/Frontend/frontend-app/e2e/](../Frontend/frontend-app/e2e/) and
  [playwright.config.ts](../Frontend/frontend-app/playwright.config.ts)
- **Companion guides:** [frontend-app-guide.md](frontend-app-guide.md) (the Angular UI these tests drive),
  [auth-service-guide.md](auth-service-guide.md) (sign-in, tokens, KYC),
  [order-service-guide.md](order-service-guide.md) (Trade REST API: orders, accounts, watchlists),
  [executor-service-guide.md](executor-service-guide.md) (fills or rejects the orders the tests place)

Paths shown in code blocks and tables are relative to `Application/Frontend/frontend-app/` unless they say
otherwise.

---

## Table of contents

- [Part 0: The 60-second mental model](#part-0-the-60-second-mental-model)
- [Part 1: Playwright crash course (from zero)](#part-1-playwright-crash-course-from-zero)
- [Part 2: Folder and file map](#part-2-folder-and-file-map)
- [Part 3: Configuration and environment variables](#part-3-configuration-and-environment-variables)
- [Part 4: The shared support files](#part-4-the-shared-support-files)
- [Part 5: Every spec at a glance](#part-5-every-spec-at-a-glance)
- [Part 6: The specs, file by file](#part-6-the-specs-file-by-file)
- [Part 7: Journeys end to end](#part-7-journeys-end-to-end)
- [Part 8: Design principles](#part-8-design-principles)
- [Part 9: Security coverage](#part-9-security-coverage)
- [Part 10: Commands cheat sheet](#part-10-commands-cheat-sheet)
- [Part 11: Known issues, risks and technical debt](#part-11-known-issues-risks-and-technical-debt)
- [Part 12: Review questions and answers](#part-12-review-questions-and-answers)
- [Part 13: Glossary](#part-13-glossary)

---

## Part 0: The 60-second mental model

Unit tests (`src/**/*.spec.ts`, run by Karma + Jasmine) check **one class at a time** with fake dependencies.
They cannot tell you whether a real person can open the site, sign in, place an order and see it on the blotter.

The Playwright suite does exactly that. It launches a **real Chromium browser**, types and clicks like a user, and
checks what appears on screen and what goes over the network, **against the real running system**. Nothing is
mocked.

```
 npx playwright test
   │
   ▼
┌─────────────── Playwright test runner (Node.js) ───────────────┐
│  playwright.config.ts  ── loads .env.local (E2E_* variables)    │
│  e2e/*.spec.ts         ── one file per user journey             │
│     │                                                           │
│     ├── page (real Chromium tab) ──► Angular UI  :4200          │
│     │                                   │                       │
│     └── request (HTTP, no browser) ─────┼──► auth-service :3000 │
│           used for setup + API checks   └──► Trade REST API     │
└─────────────────────────────────────────────────────────────────┘
                                                    │
                                    Postgres, Kafka, executor-service
```

Three things to remember:

1. **Real stack, no mocks.** Everything must already be running before you start the tests.
2. **Every test is independent.** It gets a fresh browser, signs in on its own and creates its own data.
3. **One test at a time** (`workers: 1`), because of a known order-ID race in the Trade REST API.

---

## Part 1: Playwright crash course (from zero)

### 1.1 What is Playwright?

Playwright is a free, open-source **browser automation and testing framework** from Microsoft. Code (TypeScript
here) controls Chromium (Chrome/Edge), Firefox or WebKit (Safari): it opens pages, fills forms, clicks buttons,
reads text and inspects network traffic. The `@playwright/test` package adds a **test runner**, **assertions**,
**fixtures**, **reports** and **traces** on top.

### 1.2 Where E2E fits: the testing pyramid

```
        /\        E2E (Playwright)       few, slow, most realistic: the whole system
       /  \       Integration            services talking to each other
      /____\      Unit (Karma/Jasmine)   many, fast, isolated: one class, fakes for the rest
```

| | Unit test | E2E test |
|---|---|---|
| Scope | one component/service | a whole user journey across UI + services + DB |
| Dependencies | mocked | real |
| Speed | milliseconds | seconds |
| Catches | logic bugs in one class | wiring, config, contract and integration bugs |
| In this project | `src/**/*.spec.ts` (Karma) | `e2e/*.spec.ts` (Playwright) |

### 1.3 Core building blocks

| Concept | Meaning |
|---|---|
| **Browser** | one real browser process (Chromium here) |
| **BrowserContext** | an isolated, incognito-like profile with its own cookies and `localStorage`. **Each test gets a new one**, so no session leaks between tests |
| **Page** | one tab inside a context; most actions go through `page` |
| **Fixture** | an object Playwright creates and hands to your test by name: `{ page }`, `{ request }`, `{ browser }`, `{ baseURL }` |
| **Locator** | a description of how to find an element, e.g. `page.getByTestId('login-submit')`. Lazy: it is resolved again every time you use it |
| **Action** | `goto`, `click`, `fill`, `selectOption`, `reload`… |
| **Assertion** | `expect(...)`; the web-first ones retry until they pass or time out |
| **Auto-waiting** | before an action, Playwright waits until the element is attached, visible, stable and enabled, so there is no need for `sleep()` |
| **`request` fixture** | an HTTP client (`APIRequestContext`) with no browser, used for setup and API-only tests |
| **Reporter** | how results are shown; this project uses the HTML report |
| **Trace** | a recording of a run (DOM snapshots, network, console) you can replay step by step |

### 1.4 Anatomy of a test

```ts
import { test, expect } from '@playwright/test';

test.describe('Sign-in journey', () => {          // groups related tests
  test.beforeEach(async ({ page }) => {           // runs before each test in the group
    await page.goto('/login');                    // relative to baseURL
  });

  test('a successful sign-in opens the dashboard', async ({ page }) => {
    await page.getByTestId('login-username').fill('ann');     // action
    await page.getByTestId('login-password').fill('secret');  // action
    await page.getByTestId('login-submit').click();           // action (auto-waits)
    await expect(page).toHaveURL(/\/dashboard$/);             // web-first assertion (retries)
  });
});
```

Every browser operation is asynchronous, so almost every line starts with `await`.

### 1.5 Test-structure keywords used in this project

| Keyword | Effect |
|---|---|
| `test.describe(name, fn)` | groups tests; can be nested |
| `test.beforeEach` / `test.afterEach` | setup / clean-up around every test in the group |
| `test.skip(condition, reason)` | skips the test at runtime when the condition is true (used when the executor is too slow) |
| `test.fixme(name, fn)` | marks a **known bug**: listed in the report, **not run** |
| `test.only` | runs only this test; **forbidden on CI** by `forbidOnly` |
| `for (...) { test(...) }` | **data-driven tests**: one generated test per row of data |

### 1.6 Two kinds of `expect`

```ts
await expect(page.getByTestId('kyc-status')).toHaveText('Pending'); // web-first: retries ~5 s, needs await
expect(response.status()).toBe(401);                                // plain value: checked once
```

Web-first matchers used in the suite: `toHaveURL`, `toHaveText`, `toContainText`, `toBeVisible`, `toHaveCount`,
`toHaveValue`, `toHaveAttribute`, `toBeFocused`. Plain matchers: `toBe`, `toEqual`, `toContain`, `toBeNull`,
`toBeTruthy`, `toBeUndefined`, `toBeGreaterThan`, `toMatch`.

`expect.poll(fn, { timeout, intervals })` repeatedly calls a function until its result passes, which is useful
for waiting on something asynchronous like the executor settling an order.

### 1.7 Locators: best to worst

1. `getByRole('button', { name: 'Keep' })`: how a user or screen reader sees the element
2. `getByLabel(...)`, `getByText(...)`
3. **`getByTestId('...')`**: matches `data-testid="..."`. **This project's main strategy**, because it survives
   changes to CSS classes and wording
4. `page.locator('css or xpath')`: most fragile

Narrowing and chaining:

```ts
page.getByTestId('search-row').filter({ hasText: 'AAPL' }).getByTestId('add-stock');
page.locator('[data-testid="order-row"][data-order-id="123"]');
rows.first();
```

### 1.8 Watching and controlling the network

| API | Used for |
|---|---|
| `page.waitForResponse(urlOrPredicate)` | wait for a specific API reply, then inspect its status and JSON |
| `page.waitForRequest(predicate)` | wait until a request goes out (e.g. a polling call) |
| `page.on('request', handler)` | listen to **every** request the page sends |
| `page.evaluate(() => ...)` | run JavaScript inside the page, e.g. read or write `localStorage` |
| `request.get/post/patch/delete/fetch` | call an API directly, without the browser |

**Race-free pattern** (used everywhere in this suite): start waiting **before** you click, then await afterwards.

```ts
const responsePromise = page.waitForResponse(`${env.authApi}/auth/login`); // 1. start listening
await page.getByTestId('login-submit').click();                            // 2. trigger
const response = await responsePromise;                                    // 3. read the reply
```

If you clicked first, a fast server could answer before you started listening and the test would hang.

### 1.9 Playwright vs Selenium vs Cypress (short)

| | Playwright | Selenium | Cypress |
|---|---|---|---|
| Waiting | automatic | mostly manual | automatic |
| Browsers | Chromium, Firefox, WebKit | all, via drivers | Chromium-family, Firefox |
| Test runner + assertions | built in | external | built in |
| Multiple tabs / users in one test | yes | yes | limited |
| Network inspection | built in | limited | built in |
| API testing without a browser | `request` fixture | no | `cy.request` |

---

## Part 2: Folder and file map

```
Frontend/frontend-app/
├── package.json             "e2e": "playwright test"; devDependency @playwright/test ^1.40.0
├── playwright.config.ts     runner settings (Part 3)
├── .env.local               (gitignored) E2E_* URLs and test credentials
├── prompts/
│   └── e2e-playwright-tests-prompt.md   AI prompt used while writing the suite. Not test code.
├── e2e/
│   ├── env.ts               reads E2E_* variables; expected messages, statuses and routes
│   ├── helpers.ts           UI helpers: signIn, signInAsAdmin, fillTicket, submitTicket, recordRequests…
│   ├── api.ts               API helpers that build test data: createUser, submitKyc, reviewKyc, placeOrderViaApi…
│   ├── login.spec.ts        sign-in journey (assessed)                    7 tests
│   ├── place-order.spec.ts  order ticket journey (assessed)               8 tests
│   ├── blotter.spec.ts      order history, status badges, NEW polling     4 tests
│   ├── session.spec.ts      route guards, sign-out, bearer token          3 tests
│   ├── admin.spec.ts        admin KYC review and admin/customer guards    7 tests
│   ├── kyc.spec.ts          customer KYC journey                          4 tests
│   ├── token-refresh.spec.ts  in-memory token + HttpOnly refresh cookie   5 tests
│   ├── api-security.spec.ts   Trade API checks without a browser          2 tests
│   ├── register.spec.ts     registration journey                          2 tests
│   ├── funds.spec.ts        deposit and withdraw                          2 tests
│   └── watchlist.spec.ts    watchlists                                    2 tests
└── playwright-report/, test-results/   generated output (gitignored)
```

---

## Part 3: Configuration and environment variables

### 3.1 [playwright.config.ts](../Frontend/frontend-app/playwright.config.ts)

```ts
try {
  process.loadEnvFile(path.join(__dirname, '.env.local'));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: process.env['E2E_BASE_URL'] || 'http://localhost:4200',
    trace: 'on-first-retry'
  },
  webServer: undefined,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
```

| Setting | Value | Why |
|---|---|---|
| `process.loadEnvFile('.env.local')` | | loads the `E2E_*` variables so the tests work from any terminal and from the VS Code Testing panel. Existing environment variables are **not** overwritten. A missing file (`ENOENT`, e.g. on CI) is ignored; any other error is re-thrown |
| `testDir` | `./e2e` | where the spec files are |
| `fullyParallel` | `false` | tests in a file do not run in parallel |
| `workers` | `1` | **one test at a time across the whole suite**. The Trade REST API allocates order IDs with `MAX(order_id) + 1`, so two orders placed at the same moment can collide on the primary key and one returns `ERR-500` |
| `forbidOnly` | `true` on CI | a forgotten `test.only` fails the CI build instead of silently skipping everything else |
| `retries` | `2` on CI, `0` locally | absorbs rare flakiness on CI; locally a failure shows at once |
| `reporter` | `html` | writes `playwright-report/`; open with `npx playwright show-report` |
| `baseURL` | `E2E_BASE_URL` or `http://localhost:4200` | lets tests write `page.goto('/login')` |
| `trace` | `on-first-retry` | records a trace only when a test is retried, to debug failures cheaply |
| `webServer` | `undefined` | Playwright **starts nothing**. The UI, auth service, Trade REST API, executor, Postgres and Kafka must already be running |
| `projects` | Chromium only | one browser: Desktop Chrome |

### 3.2 Environment variables (`.env.local`, gitignored)

| Variable | Meaning |
|---|---|
| `E2E_BASE_URL` | Angular UI origin (default `http://localhost:4200`) |
| `E2E_AUTH_API` | auth-service base URL |
| `E2E_TRADE_API` | Trade REST API base URL |
| `E2E_USERNAME` / `E2E_PASSWORD` | shared, KYC-approved customer used by most journeys |
| `E2E_ACCOUNT_ID` | that customer's trading account ID |
| `E2E_SYMBOL` | a tradable instrument symbol |
| `E2E_ADMIN_USERNAME` / `E2E_ADMIN_PASSWORD` | administrator used for KYC review |

The file is gitignored because it contains credentials.

---

## Part 4: The shared support files

### 4.1 [e2e/env.ts](../Frontend/frontend-app/e2e/env.ts): settings and expected values

- **`requireEnv(name)`** returns the variable or throws
  `"E2E_USERNAME is not set. Export the E2E_* variables first…"`. Without it, a missing value would surface
  later as a confusing timeout.
- **`env`** is an object of **getters** (`env.authApi`, `env.username`…), so a variable is only read, and only
  required, when a test actually uses it.
- **`PLACED_ORDER_STATUSES`** = `['NEW', 'FILLED', 'REJECTED']` and **`PLACED_ORDER_LABELS`** =
  `['New', 'Filled', 'Rejected']`. A freshly placed order may be in any of these states depending on how fast the
  executor is, so any of them counts as a pass. A spec that asserted `FILLED` would fail the week the executor
  is switched off.
- **`MESSAGES`** holds the exact text from the UI's `ErrorMappingService`:

  | Key | Text the user reads |
  |---|---|
  | `INS-404` | The instrument cannot be traded. |
  | `ORD-400` | There is not enough cash to place this order. |
  | `ORD-409` | There are not enough holdings to sell, or this order has already been placed. |
  | `AUTH-409` | This username is already taken. Please choose another. |
  | `badLogin` | Incorrect username or password. Check your details and try again. |

  Tests assert **what the user sees**, not only status codes.
- **`TRADING_ROUTES`** = `/dashboard`, `/orders/new`, `/orders/history`, `/funds`, `/watchlist`: every route
  behind `mockAuthGuard` + `kycApprovalGuard`. The guard tests in `session`, `kyc` and `admin` loop over it.

### 4.2 [e2e/helpers.ts](../Frontend/frontend-app/e2e/helpers.ts): driving the UI

| Helper | What it does |
|---|---|
| `signIn(page, path = '/login', credentials)` | goes to `path` (skipped when `path` is `''`, i.e. already on a sign-in page), fills the real form, clicks submit, then `waitForURL` until the path is no longer `/login` or `/admin-login`. **Every test calls it itself**, so no test relies on another's session |
| `signInAsAdmin(page)` | `signIn` via `/admin-login` with the admin credentials |
| `isOrderPost(url, method)` | true for `POST {tradeApi}/api/v1/orders` |
| `isOrderHistoryGet(url, method)` | true for `GET {tradeApi}/api/v1/accounts/me/orders…` |
| `recordRequests(page, match)` | pushes every matching request URL into an array. Used to prove **nothing was sent** when validation should block a form: `expect(posts).toEqual([])` |
| `fillTicket(page, ticket)` | clicks Buy/Sell and fills symbol, quantity and price on `/orders/new` |
| `submitTicket(page, ticket)` | fills a ticket (default: valid BUY 1 × 100.00 of `E2E_SYMBOL`), starts `waitForResponse` for the order POST, clicks submit, returns the response |
| `placeValidBuyOrder(page)` | `submitTicket` + asserts `response.ok()`, returns `{ orderId, status }` |

### 4.3 [e2e/api.ts](../Frontend/frontend-app/e2e/api.ts): building test data through the real APIs

These use the `request` fixture (no browser), so setup is fast and reliable. Nothing here is a mock.

| Helper | What it does |
|---|---|
| `bearer(token)` | `{ Authorization: 'Bearer <token>' }` |
| `apiLogin(request, username, password, admin?)` | `POST /auth/login` or `/auth/admin/login`, expects 200, returns `{ accessToken, refreshToken }` |
| `loginTestUser`, `loginAdmin` | `apiLogin` with the shared customer / admin |
| `uniqueUsername(prefix)` | `e2e_<timestamp>_<random>`, so every run makes new, non-clashing users |
| `registrationFor(username)` | a valid registration body (`@example.com` email, which is never delivered) |
| `waitUntilCanSignIn(request, user)` | retries login after 0.5 s, 1 s, 2 s and 4 s (see below) |
| `createUser(request)` | `POST /auth/register` (expects 201), then `waitUntilCanSignIn`; returns user + tokens |
| `submitKyc(request, token)` | `POST /kyc` with a passport (expects 201) |
| `reviewKyc(request, userId, approve, reason?)` | signs in as admin and `PATCH /kyc` with `APPROVED` or `REJECTED` |
| `rejectIfPending(request, userId)` | clean-up: rejects the user's submission if it is still in `GET /kyc/pending` |
| `getOrderStatus(request, token, orderId)` | reads `/api/v1/accounts/me/orders` and returns the order's status (or `MISSING`) |
| `placeOrderViaApi(request, token, order)` | `POST /api/v1/orders`; the `idempotencyKey` is random unless the caller passes one (the idempotency test passes the same key twice) |
| `deleteTestWatchlists(request, token)` | deletes every watchlist named `E2E …` |

**Why `waitUntilCanSignIn` exists:** after registration, the trading account is created **asynchronously** (the
auth service publishes `USER_REGISTERED` to Kafka and the Trade REST API provisions the account). Sign-in is refused
until that account exists. The helper backs off and tries only **four** times, staying under the auth service's
**five-failed-attempt lockout**.

**Pattern:** *arrange through the API, act and assert through the UI.* The browser is used only for the behaviour
under test.

---

## Part 5: Every spec at a glance

**46 tests in 11 files.** The suite was cut down to the journeys a user actually takes and the controls a
reviewer will probe; each test checks one behaviour that would matter if it broke. The two journeys the Sprint 9
brief assesses are `login.spec.ts` and `place-order.spec.ts`.

| Spec | Tests | Fixtures | Data it creates | What it proves |
|---|---:|---|---|---|
| `login.spec.ts` | 7 | `page` | none | guard redirect, refused sign-in, no username enumeration, customer/admin sign-in kept apart, success, return URL, open-redirect protection |
| `place-order.spec.ts` | 8 | `page`, `request` | orders | read-only account, validation before submit, a placed order, `INS-404`/`ORD-400`/`ORD-409` rendered, resubmit after refusal, SELL |
| `blotter.spec.ts` | 4 | `page`, `request` | orders | badges in words, an order at NEW brought up to date, rejected orders kept, server-side status filter |
| `session.spec.ts` | 3 | `page`, `baseURL` | none | every protected screen redirects when signed out, sign-out really ends access, bearer token only on platform APIs |
| `admin.spec.ts` | 7 | `page`, `request`, `browser` | an applicant per review test | admin sign-in, admin/customer screens kept apart both ways, queue + count, approve/reject seen by the customer |
| `kyc.spec.ts` | 4 | `page`, `request` | a new user per test | KYC gate on every trading screen, submit, reject + resubmit, approve |
| `token-refresh.spec.ts` | 5 | `page` | none | reload refresh, silent refresh on 401, one refresh for many 401s, no cookie → login, sign-out removes the cookie |
| `api-security.spec.ts` | 2 | `request` | orders | the Trade API refuses a missing token; a reused idempotency key places no second order |
| `register.spec.ts` | 2 | `page` | new users | successful registration, duplicate username |
| `funds.spec.ts` | 2 | `page` | +$1.00 per run | deposit persists, over-balance withdrawal blocked |
| `watchlist.spec.ts` | 2 | `page`, `request` | `E2E …` watchlists | create + add/remove, link to the ticket |

---

## Part 6: The specs, file by file

### 6.1 [login.spec.ts](../Frontend/frontend-app/e2e/login.spec.ts): sign-in journey (assessed)

| Test | Checks |
|---|---|
| guard redirects a signed-out visitor | `/orders/new` → `/login?returnUrl=%2Forders%2Fnew`, username field visible |
| a refused sign-in | 401 + `errorCode: AUTH-401`, the `badLogin` message, stays on `/login` |
| unknown username = wrong password | same 401, same code, same message (**no username enumeration**) |
| customer and admin credentials only work on their own screen | admin credentials on `/login` → `badLogin`, stays put; customer credentials on `/admin-login` → `/auth/admin/login` 401, `badLogin`, stays put |
| successful sign-in | `/dashboard`, **no** `auth_token` in `localStorage`, sign-out button visible |
| arrives where they were going | after the redirect, `signIn(page, '')` lands on `/orders/new` with the "Place order" heading |
| off-site return address ignored | `returnUrl=https://evil.example/phish` lands on `/dashboard`, never on the other host (**open-redirect protection**; the other hostile shapes, `//evil.example`, `/\evil.example`, `javascript:`…, are covered by the `safe-return-url` unit test) |

### 6.2 [place-order.spec.ts](../Frontend/frontend-app/e2e/place-order.spec.ts): order ticket (assessed)

`beforeEach` signs in with `returnUrl=/orders/new`.

| Test | Checks |
|---|---|
| account from the session, read-only | `order-account` shows `E2E_ACCOUNT_ID`, is a `<DD>` (text, not an input), no labelled account field |
| invalid ticket rejected before anything is sent | quantity `0` and price `10.125` each show their exact message, no result panel, **no POST** (`recordRequests`) |
| valid order | status in `PLACED_ORDER_STATUSES`, result panel shows the same order ID and a valid label |
| a refusal renders as a readable message | unknown symbol → 404 `INS-404` + the `INS-404` sentence, no result panel |
| buy larger than cash | 400 `ORD-400` + message |
| selling more than held | 409 `ORD-409` + message |
| corrected ticket can be resubmitted | after an `INS-404`, a valid order succeeds |
| SELL within the holding | BUY 1 @ 5000 via API, `expect.poll` up to 30 s until not `NEW`; **skips** if the executor is too slow or the BUY was not filled; then SELL 1 via the UI succeeds |

### 6.3 [blotter.spec.ts](../Frontend/frontend-app/e2e/blotter.spec.ts): order history

Each test places its own orders.

| Test | Checks |
|---|---|
| a placed order appears, and NEW is brought up to date | place an order → "View orders" → its row shows a valid label and **no alert** (NEW is normal). If the row is still `New`, the blotter sends a history GET **by itself** within 10 s (it polls every 5 s) and the row stays valid. No refresh is pressed and nothing is re-posted |
| every order carries its status as a word | one label per row, each `New`, `Filled`, `Rejected` or `Cancelled` (colour alone is not enough) |
| rejected orders are kept | a BUY at $0.01 is rejected by the executor (`expect.poll`, **skips** if it doesn't settle) and the row shows `Rejected`. The API work happens **before** the browser signs in, because an API login revokes the user's other refresh tokens |
| the status filter | clicking "Filled" sends `GET …/orders?status=FILLED`, and every row then shown is `Filled` |

### 6.4 [session.spec.ts](../Frontend/frontend-app/e2e/session.spec.ts): guards and session

| Test | Checks |
|---|---|
| signed out, every protected screen redirects | loops over `TRADING_ROUTES` + `/kyc-submission`: each lands on `/login` with `returnUrl` equal to the route. A route added without a guard fails here |
| after signing out, the dashboard reroutes to sign-in | sign in → sign out → `/dashboard` → `/login?returnUrl=%2Fdashboard` |
| bearer token goes everywhere it should and nowhere else | records every request while visiting the dashboard, history, funds and watchlist: every Trade API call has a JWT-shaped `Authorization: Bearer <header.payload.signature>` (matched by regex, because the token is only in memory and each `page.goto` reload gets a fresh one); `/auth/login` has **none**; **no request leaves the platform's three origins**. This is acceptance criterion 2 checked in a real browser |

### 6.5 [admin.spec.ts](../Frontend/frontend-app/e2e/admin.spec.ts): admin KYC review

| Test | Checks |
|---|---|
| admin signs in | `/admin/dashboard`, "Admin overview" heading |
| signed-out visitor to an admin page | `/admin/kyc-review` → `/admin-login?returnUrl=%2Fadmin%2Fkyc-review` |
| customer cannot open admin pages | `/admin/dashboard` and `/admin/kyc-review` bounce to `/dashboard`; no admin nav link |
| admin opening a customer screen | every `TRADING_ROUTES` entry and `/kyc-submission` → `/admin/dashboard` (admins have no trading account or KYC) |

Nested group **reviewing an application** (`beforeEach`: create an applicant and submit KYC via API; `afterEach`:
`rejectIfPending`):

| Test | Checks |
|---|---|
| a new application appears | pending count ≥ 1; "Open KYC review" → the row for this `data-user-id` shows `PASSPORT` and `Pending` |
| approving lets the customer trade | admin approves → row disappears → **a second page** (`browser.newPage()`) signs in as the customer and reaches `/orders/new` |
| rejecting shows the reason | admin types a reason and rejects → the customer's page shows that reason on `/kyc-submission` |

### 6.6 [kyc.spec.ts](../Frontend/frontend-app/e2e/kyc.spec.ts): customer KYC journey

`beforeEach` creates a brand-new user with `createUser`; `afterEach` calls `rejectIfPending` so the admin queue
does not fill up.

| Test | Checks |
|---|---|
| a new customer is asked to verify, and submitting puts it into review | sign-in lands on `/kyc-submission`; fill DOB, type, number → status `Pending` |
| every trading screen sends an unverified customer to verification | each `TRADING_ROUTES` entry → `/kyc-submission?returnUrl=<route>` |
| a rejected applicant sees the reason and can resubmit | (submitted + rejected via API) reason shown → resubmit → `Pending`, rejection banner gone |
| once approved, reaches the dashboard | (submitted + approved via API) sign-in → `/dashboard`, KYC `Approved` |

### 6.7 [token-refresh.spec.ts](../Frontend/frontend-app/e2e/token-refresh.spec.ts): in-memory token and refresh cookie

The app keeps the access token **in memory only** and the refresh token in an **HttpOnly `refresh_token`
cookie**. So a test can't plant an expired token in `localStorage`, and it can't read the refresh token either.
Instead the spec uses three local helpers:

- `countRefreshes(page)`: counts `POST {authApi}/auth/refresh` requests from that point on.
- `expireNextTradeCalls(page, n)`: uses `page.route` to answer the next `n` Trade API calls with the **401 an
  expired token would get**. It adds an `access-control-allow-origin` header, otherwise the browser hides the
  401 behind a CORS error. The real refresh path then does the rest.
- `refreshCookie(page)`: reads the `refresh_token` cookie from the browser context
  (`page.context().cookies(...)`), which Playwright can see even though page scripts can't.

**Every page load makes one bootstrap refresh** (`restoreSession()` in the app initializer), so the expected
refresh counts include it.

| Test | Checks |
|---|---|
| a reload keeps the user signed in through one silent refresh | `page.reload()` → still `/dashboard`, data loads, exactly **1** refresh |
| a 401 triggers a silent refresh and the request is retried | expire 1 Trade call, open `/orders/history`: **2** refreshes (bootstrap + the expired call), the URL stays, the page loads |
| concurrent 401s share a single refresh call | expire 2 calls, reload the dashboard (which loads in parallel): **2** refreshes in total (bootstrap + **one** shared), data loads |
| without a valid refresh cookie a reload ends at `/login` | `clearCookies()`, open `/orders/history` → `/login`, and `current_user` is removed |
| signing out revokes and removes the refresh cookie | sign out → `/auth/logout` returns **204** → the cookie is gone |

### 6.8 [api-security.spec.ts](../Frontend/frontend-app/e2e/api-security.spec.ts): the Trade API's own decisions

No browser: only the `request` fixture. The route guards are a usability control; these two tests show the
server enforcing the rules itself.

| Test | Checks |
|---|---|
| no token | `GET /api/v1/accounts/me` with no header → 401 `AUTH-401` |
| a reused idempotency key | the first POST succeeds; the same key again → 409 `ORD-409`; order history holds **exactly one** order with that key (business rule 8) |

A third test, "another account's orders cannot be read (`ACC-403`)", was removed because it failed. The
contract says a token whose `accountId` doesn't match the account in the URL gets `ACC-403`, but
`GET /api/v1/accounts/{id}/orders` ignores the `{id}` and returns the caller's own orders with 200. No other
account's data is exposed, but the service does not follow the contract. See Part 11.

### 6.9 [register.spec.ts](../Frontend/frontend-app/e2e/register.spec.ts): registration journey

A local `fillRegistration(page, overrides)` fills all seven fields from `registrationFor()`.

| Test | Checks |
|---|---|
| new user created | "Account created" with the username, continue → `/login` |
| taken username | the shared test user's name → the `AUTH-409` sentence on the username field |

### 6.10 [funds.spec.ts](../Frontend/frontend-app/e2e/funds.spec.ts): deposit and withdraw

`beforeEach` signs in to `/funds` and waits for the balance. A local `balance(page)` reads the number from
`funds-balance`.

| Test | Checks |
|---|---|
| a deposit increases the balance | deposit `1.00` → success message → balance is the old balance + 1, and still so after a reload (stored on the server) |
| an over-balance withdrawal is blocked | withdraw balance + 1000 → "Withdrawal amount exceeds your available cash balance.", balance unchanged |

The deposit leaves the shared account $1.00 richer per run, which is deliberately small.

### 6.11 [watchlist.spec.ts](../Frontend/frontend-app/e2e/watchlist.spec.ts): watchlists

`beforeEach` signs in to `/watchlist`; `afterEach` deletes every `E2E …` list via the API. Local helpers:
`listName()` → `E2E <timestamp>`, `createList(page, name)`.

| Test | Checks |
|---|---|
| create a list, add and remove a stock | new list → search "apple" → add AAPL → row shown → remove → row gone |
| watched stock links to the ticket | NVDA "trade" → `/orders/new?symbol=NVDA`, symbol pre-filled |

---

## Part 7: Journeys end to end

### 7.1 "A signed-out user tries to place an order" (login.spec.ts)

```
test: page.goto('/orders/new')
  └─► Angular router ─► mockAuthGuard: no token ─► redirect /login?returnUrl=%2Forders%2Fnew
test: expect(page).toHaveURL(/returnUrl=%2Forders%2Fnew/)                         ✔
test: signIn(page, '')  (fills the form already on screen)
  └─► POST {authApi}/auth/login ─► 200 { accessToken, … } + Set-Cookie refresh_token (HttpOnly)
      ─► access token kept in memory, cookie kept by the browser
  └─► router honours safe returnUrl ─► /orders/new
test: expect(page).toHaveURL(/\/orders\/new$/), heading "Place order" visible     ✔
```

### 7.2 "A new customer gets verified by an admin and can trade" (admin.spec.ts)

```
beforeEach (request fixture, no browser)
  createUser ─► POST /auth/register (201)
             ─► Kafka USER_REGISTERED ─► Trade API provisions account (async)
             ─► waitUntilCanSignIn: retry login 0.5s/1s/2s/4s until 200
  submitKyc  ─► POST /kyc (201)              → status PENDING
test (page = admin's tab)
  signInAsAdmin ─► /admin/dashboard ─► /admin/kyc-review
  row[data-user-id=<applicant>] ─► click Approve ─► PATCH /kyc APPROVED
  expect row gone                                                                  ✔
test (customer = browser.newPage(), a second tab)
  signIn as applicant with returnUrl=/orders/new ─► kycApprovalGuard passes
  expect /orders/new                                                               ✔
afterEach
  rejectIfPending ─► nothing pending (already approved), so no-op
```

### 7.3 "A placed order shows on the blotter and is brought up to date" (blotter.spec.ts)

```
signIn → /orders/new
placeValidBuyOrder
  fillTicket BUY, E2E_SYMBOL, 1, 100.00
  waitForResponse(POST /api/v1/orders)   ← started BEFORE the click
  click submit ─► Trade API inserts order NEW, publishes ORDER_PLACED to Kafka
  response.ok() ✔ → { orderId, status ∈ NEW|FILLED|REJECTED }
click "View orders" ─► /orders/history
  row[data-order-id=<orderId>] visible, label valid, no alert                       ✔
  if the label is "New":
    waitForRequest(GET …/accounts/me/orders)   ← the blotter's own 5 s poll        ✔
    label still valid
```

### 7.4 "An expired access token is refreshed silently" (token-refresh.spec.ts)

```
signIn → access token in memory, refresh_token in an HttpOnly cookie
countRefreshes(page)                     ← start counting POST /auth/refresh
expireNextTradeCalls(page, 1)            ← page.route answers the next Trade API call with 401
page.goto('/orders/history')             ← a full page load
  └─► app initializer: POST /auth/refresh (cookie) ─► new access token   (refresh #1, bootstrap)
  └─► GET /api/v1/accounts/me/orders  ─► 401 (faked by page.route)
      └─► interceptor: POST /auth/refresh (cookie) ─► new access token, cookie rotated (refresh #2)
      └─► retry GET ─► real Trade API ─► 200, page renders
expect refreshes.count === 2, URL unchanged, refresh button visible                ✔
```

---

## Part 8: Design principles

1. **Real stack, no mocks.** The suite proves the components work together. Mocks belong in unit tests. The one
   exception is `token-refresh.spec.ts`, which uses `page.route` to answer a few Trade API calls with the 401 an
   expired token gets. With the token in memory there's no other way to expire it on demand without waiting 15
   minutes. The refresh itself still hits the real auth service.
2. **Few tests, each one substantial.** One test per behaviour a user or reviewer cares about. Variations of the
   same rule (every hostile URL shape, every invalid quantity) live in the unit tests, which run in seconds.
3. **Test isolation.** A fresh `BrowserContext` per test, every test signs in itself, and no test reads data
   another test created. Run each file on its own before a review (Part 10) to prove it.
4. **Unique, self-cleaning data.** Timestamped usernames (`e2e_<ts>_<rand>`), `E2E <ts>` watchlists, and
   `afterEach` clean-up (`rejectIfPending`, `deleteTestWatchlists`).
5. **Never harm the shared user.** Tests that need a fresh state (KYC, admin review) create throw-away users; the
   funds deposit is $1.00. There is no lockout test, because it would need a throw-away user per run and the
   lockout is covered by the auth service's `ThrottleService` unit tests.
6. **Stable selectors.** `data-testid` first, roles second, rarely raw CSS.
7. **No fixed sleeps.** Auto-waiting, web-first assertions, `waitForResponse`/`waitForURL`/`waitForRequest`
   and `expect.poll`. (The only timed waits are the deliberate back-off in `waitUntilCanSignIn`.)
8. **Tolerate asynchrony honestly.** Accept any valid order status; `test.skip` with a reason when the executor
   has not settled in time, rather than failing or passing falsely.
9. **Assert at two levels.** The API response (status + `errorCode`) **and** the message the user actually reads.
10. **Prove negatives.** `recordRequests` + `toEqual([])` shows that invalid forms send nothing; `toHaveCount(0)`
    shows something is gone.
11. **Loop over routes inside one test.** The guard tests visit every protected route in one test, with the route
    as the assertion message, so a missing guard names itself.
12. **Serial execution** (`workers: 1`) because of the order-ID race.
13. **Secrets out of git.** Credentials live in `.env.local`; `requireEnv` fails fast with a clear message.

---

## Part 9: Security coverage

| Threat | Where tested | How |
|---|---|---|
| Unauthenticated access to pages | `session`, `login`, `admin` | every protected customer route redirects to `/login` with `returnUrl`; admin routes to `/admin-login` |
| Session not really ended by sign-out | `session`, `token-refresh` | after sign-out the dashboard redirects; `/auth/logout` 204 and the cookie is gone |
| Access before KYC approval | `kyc` | every trading route redirects to `/kyc-submission` |
| Customer reaching admin pages | `admin` | admin routes bounce to `/dashboard` |
| Admin landing in customer screens | `admin` | every customer route sends an admin to `/admin/dashboard` |
| Username enumeration | `login` | unknown user and wrong password give identical responses |
| Credential confusion | `login` | admin credentials refused on `/login`, customer credentials refused on `/admin-login` |
| Open redirect | `login` (+ `safe-return-url` unit test) | a hostile `returnUrl` is ignored |
| Token leakage | `session` (+ interceptor unit tests) | bearer only on platform APIs, never on `/auth/login`, no third-party hosts |
| Server trusting the client | `api-security` | no token → 401 `AUTH-401` |
| Duplicate orders | `api-security` | a reused idempotency key → `ORD-409`, exactly one order stored |
| Session expiry | `token-refresh` | silent refresh; one shared refresh for concurrent 401s; no valid cookie → `/login` |

Not covered by e2e any more (see Part 11): JWT forgery, CORS, internal endpoints, the `ACC-403` account check,
and the known backend holes. The secrets-in-the-bundle check is `npm run scan:bundle`, not a Playwright test.

---

## Part 10: Commands cheat sheet

Run from `Application/Frontend/frontend-app/`, **with the whole stack already running**.

| Command | What it does |
|---|---|
| `npm install` | installs dependencies, including `@playwright/test` |
| `npx playwright install chromium` | downloads the browser (first time only) |
| `npm run e2e` | runs the whole suite (`playwright test`) |
| `npx playwright test --list` | lists every test without running anything (should say 46 tests in 11 files) |
| `npx playwright test e2e/login.spec.ts` | runs one file |
| `npx playwright test -g "idempotency"` | runs tests whose title matches |
| `npx playwright test --headed` | shows the browser while running |
| `npx playwright test --ui` | interactive UI mode: pick, watch and time-travel tests |
| `npx playwright test --debug` | step through with the Playwright Inspector |
| `npx playwright test --trace on` | always record traces |
| `npx playwright show-report` | opens the HTML report |
| `npx playwright show-trace <trace.zip>` | replays a recorded trace |
| `npx playwright codegen http://localhost:4200` | records your clicks as test code (useful for learning) |

**Before a review, run each file in its own process.** A journey that only passes because its neighbour ran
first fails here instead of in front of the panel:

```bash
for f in e2e/*.spec.ts; do npx playwright test "$f" || echo "FAILED: $f"; done
```

Minimum `.env.local`:

```
E2E_BASE_URL=http://localhost:4200
E2E_AUTH_API=http://localhost:3000
E2E_TRADE_API=http://localhost:8080
E2E_USERNAME=...
E2E_PASSWORD=...
E2E_ACCOUNT_ID=...
E2E_SYMBOL=AAPL
E2E_ADMIN_USERNAME=...
E2E_ADMIN_PASSWORD=...
```

(These are the default local ports: UI 4200, auth service 3000, Trade REST API 8080. Change them if your
services run elsewhere.) The first seven names are the ones the Sprint 9 brief requires; the two `E2E_ADMIN_*`
variables are this project's addition for the admin, KYC and login journeys.

---

## Part 11: Known issues, risks and technical debt

| Issue | Detail |
|---|---|
| `ACC-403` not returned | `GET /api/v1/accounts/{id}/orders` (and the other `/{id}` account routes) read the account from the token and ignore the path, so another account's id returns **your own** data with 200. Nothing leaks, but the contract says `ACC-403`. The e2e test for it was removed; the fix belongs in the Trade REST API |
| Known backend holes, untested | another customer can cancel your order (`DELETE /orders/{id}` doesn't check ownership); a customer can set their own balance (`PATCH /accounts/me/balance` takes an absolute value, which the Funds screen uses); two simultaneous orders can collide on `MAX(order_id) + 1`; `POST /auth/admin/register` is unguarded. These used to be `test.fixme` entries and are now only documented here and in the service guides |
| `networkidle` | `token-refresh`, `session` and the blotter filter test use `waitForLoadState('networkidle')`, which Playwright's docs discourage as flaky; the blotter polls every 5 s, so "idle" may never come or come at the wrong moment |
| Token expiry is simulated | `expireNextTradeCalls` fakes the Trade API's 401 with `page.route`, so the backend never actually sees an expired, correctly signed token. The client-side refresh path is exercised for real; the server's expiry check is covered by the auth service's unit tests instead |
| Refresh counts depend on the bootstrap refresh | the expected counts (1 and 2) include the one refresh every page load makes. If the app stops refreshing on load, or starts doing it twice, these tests fail even though silent refresh still works |
| API logins revoke the browser's session | every login revokes the user's other refresh tokens. A spec that logs in through `api.ts` must do it **before** `signIn(page)` (as the blotter's rejected-order test does), or the browser's next refresh or reload ends at `/login` |
| The deposit test grows the balance | `funds.spec.ts` adds $1.00 to the shared account every run |
| Missing `e2e/README.md` | `env.ts` refers to it, but it is not in the repository |
| Chromium only | no Firefox/WebKit project, so no cross-browser coverage |
| Serial only | `workers: 1` makes the suite slow; a backend fix for order IDs (a sequence) would allow parallel runs |
| Depends on live market data | the SELL, rejected-order and NEW-polling checks rely on the executor and market prices; they `skip` (or, for polling, check less) when those are slow |
| Shared test user accumulates orders | orders are never cleaned up, so the blotter grows over time |

---

## Part 12: Review questions and answers

**Playwright basics**

1. **What is Playwright?**
   An open-source browser automation and testing framework from Microsoft. It drives Chromium, Firefox and WebKit
   from code and ships a test runner, assertions, fixtures, reports and traces (`@playwright/test`).

2. **What is the difference between an E2E test and a unit test?**
   A unit test checks one class with mocked dependencies and runs in milliseconds. An E2E test drives the real UI
   against real services and a real database to check a whole user journey.

3. **What is a fixture?**
   An object Playwright creates and passes into a test by name, e.g. `page`, `request`, `browser`, `baseURL`.
   Playwright also handles its setup and teardown.

4. **What is a BrowserContext and why does it matter?**
   An isolated incognito-like session with its own cookies and storage. Each test gets a new one, so every test
   starts signed out and cannot leak state into another.

5. **What is a locator?**
   A lazy description of how to find an element (`getByTestId`, `getByRole`…). It is re-resolved on every use, so
   it keeps working when the DOM re-renders.

6. **What is auto-waiting?**
   Before acting, Playwright waits until the element is attached, visible, stable and enabled. Web-first
   assertions retry until they pass or time out. Together they remove the need for `sleep()`.

7. **Web-first vs plain `expect`?**
   `await expect(locator).toHaveText(...)` retries against the live page. `expect(value).toBe(...)` checks a value
   once.

8. **Why call `waitForResponse` before `click`?**
   To avoid a race: if the response arrives before you start listening, the wait never resolves.

9. **What do `test.skip`, `test.fixme` and `test.only` do?**
   `skip` skips (here at runtime with a reason, when the executor is too slow); `fixme` marks a known bug and does
   not run it (this suite no longer uses it); `only` runs just that test and is blocked on CI by `forbidOnly`.

10. **What is `expect.poll`?**
    It repeatedly calls a function until the returned value passes the matcher, used here to wait for the executor
    to move an order out of `NEW` and for the funds balance to update.

**This project's setup**

11. **Why are there no mocks?**
    The suite's purpose is to prove the UI, auth service, Trade REST API, executor, Postgres and Kafka work
    together. Mocks would hide exactly the integration bugs it is meant to catch.

12. **Why `workers: 1` and `fullyParallel: false`?**
    The Trade REST API allocates order IDs with `MAX(order_id) + 1`; simultaneous orders can collide on the
    primary key and fail with `ERR-500`.

13. **Why is `webServer` undefined?**
    Playwright starts nothing; the whole stack must already be running.

14. **Where do URLs and credentials come from?**
    `E2E_*` variables, loaded from gitignored `.env.local` by `process.loadEnvFile`, or from the real environment
    on CI. `requireEnv` fails fast with the variable's name if one is missing.

15. **Why `data-testid`?**
    It is a stable hook that does not change when styling or wording changes.

16. **How is test data created and cleaned up?**
    Through the real APIs in `api.ts` (register, KYC, review, orders), with unique timestamped names. `afterEach`
    rejects leftover KYC submissions and deletes `E2E …` watchlists.

17. **Why does `createUser` retry sign-in?**
    The trading account is provisioned asynchronously over Kafka, and sign-in is refused until it exists. It
    retries four times with back-off to stay under the five-attempt lockout.

18. **How does the suite avoid flaky results?**
    Auto-waiting, web-first assertions, waiting on specific responses and URLs, `expect.poll`, accepting any valid
    order status, and skipping with a reason when the executor is too slow.

19. **How do you show that invalid input sends nothing?**
    `recordRequests` collects matching requests; the test asserts the array is empty.

20. **How does the admin test simulate two users?**
    The admin uses `page`; the customer uses a second tab from `browser.newPage()`.

21. **Why only 46 tests?**
    Each e2e test needs the whole stack and takes seconds, so the suite keeps one test per behaviour that matters
    to a user or a reviewer. Variations of a rule are unit-tested (62 Karma tests run in under a second).

**Guards and security**

22. **How do you show the guards work?**
    `session` visits every protected customer route signed out and expects `/login?returnUrl=<route>`; it also
    signs out and checks the dashboard redirects. `admin` checks signed-out visitors, customers and admins each
    land on their own side. `kyc` checks every trading route sends an unverified customer to verification.

23. **Are the guards a security control?**
    No. The bundle is public and every route in it is readable. `api-security` shows the server refusing a request
    with no token: authorisation is the Trade REST API's decision on every `/api/v1/**` call.

24. **How is username enumeration tested?**
    A non-existent username and a wrong password must get the same 401, `AUTH-401` and message.

25. **How is the open redirect tested?**
    `returnUrl=https://evil.example/phish` must land on `/dashboard`, never on the other host. The other hostile
    shapes are in the `safe-return-url` unit test.

26. **How is idempotency tested?**
    The same `idempotencyKey` is posted twice through the API: the second answer is `ORD-409`, and order history
    holds exactly one order with that key.

27. **Why was the `ACC-403` test removed?**
    The contract says a mismatched account id gets `ACC-403`, but the Trade REST API reads the account from the
    token and ignores the path, returning the caller's own orders. That's a contract deviation, not a leak, and it
    is tracked in Part 11 rather than as a failing test.

---

## Part 13: Glossary

| Term | Meaning |
|---|---|
| **E2E test** | end-to-end test: drives the real UI against the real system |
| **Playwright** | Microsoft's browser automation and testing framework |
| **`@playwright/test`** | Playwright's test runner, assertions and fixtures |
| **Chromium** | the open-source browser behind Chrome and Edge |
| **Browser** | one browser process |
| **BrowserContext** | isolated incognito-like session inside a browser |
| **Page** | one tab |
| **Fixture** | object injected into a test by name (`page`, `request`, `browser`, `baseURL`) |
| **Locator** | lazy, re-resolving element finder |
| **`data-testid`** | HTML attribute added purely as a stable test hook |
| **Web-first assertion** | `expect(locator)` matcher that retries until it passes or times out |
| **Auto-waiting** | Playwright waits for elements to be actionable before acting |
| **`expect.poll`** | retries a function until its value passes |
| **`APIRequestContext`** | the `request` fixture: HTTP calls without a browser |
| **Worker** | a process that runs tests; `workers: 1` means serial |
| **`baseURL`** | prefix for relative `page.goto` paths |
| **Trace** | recorded run (DOM, network, console) for debugging |
| **HTML reporter** | browsable report of a run |
| **`test.fixme`** | known-bug marker: listed, not run |
| **`forbidOnly`** | fails CI if `test.only` is left in the code |
| **Data-driven test** | one test generated per row of input data |
| **Flaky test** | a test that sometimes passes and sometimes fails without code changes |
| **Race condition** | outcome depends on timing (e.g. the `MAX + 1` order IDs) |
| **JWT** | signed token `header.payload.signature` carrying claims |
| **Bearer token** | `Authorization: Bearer <token>` header |
| **Refresh token** | long-lived token used to get a new access token; here an `HttpOnly` `refresh_token` cookie |
| **HttpOnly cookie** | cookie page scripts can't read; Playwright can still see it via `page.context().cookies()` |
| **`page.route`** | intercepts matching requests so a test can fulfil, modify or pass them through |
| **Interceptor** | Angular hook that edits every HTTP request/response (adds the token, handles 401) |
| **Route guard** | Angular check that allows or redirects navigation |
| **KYC** | Know Your Customer: identity verification before trading |
| **Idempotency key** | unique request ID so a retried order is not placed twice |
| **IDOR** | Insecure Direct Object Reference |
| **Open redirect** | a site redirecting users to an attacker-chosen URL |
| **Username enumeration** | discovering which usernames exist from different error responses |
| **CORS** | browser rule: the server lists which origins may call it |
| **Preflight** | the browser's `OPTIONS` request that checks CORS before the real call |
