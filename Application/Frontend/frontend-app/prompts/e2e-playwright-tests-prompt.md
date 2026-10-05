# Sprint 9: E2E Playwright Tests for Trading UI

## Project Context

This is the **Angular 21+ Trading UI** for a multi-service trading platform built over Sprints 3-9. The frontend consumes real backend services:

- **Auth Service** (NestJS, Sprint 8): User registration, login, token generation/refresh
- **Trade REST API** (Spring Boot, Sprint 6): Order placement, account queries, instrument data
- **Trade Executor** (Spring Boot, Sprint 7): Async order execution via Kafka
- **PostgreSQL Database** (dual-schema: `auth` and `trading`, with migrations from Sprints 3-9)

**Critical platform property**: Execution is asynchronous. The Trade REST API responds with `POST /api/v1/orders` before the fill exists. An order placed returns status `NEW` and moves through the executor's settlement pipeline. The UI must handle polling and render `NEW` as a working state, not an error or stalled state.

## Assessed E2E Journeys

Two independent Playwright journeys, each running against the real stack:

1. **Sign-in** (`e2e/login.spec.ts`)
2. **Place an order** (`e2e/place-order.spec.ts`)

**DO NOT mock, stub, intercept, or fake backend APIs.** These tests verify real integration from Angular → Auth Service → Trade REST API → database → executor → UI.

---

# Phase 0: Codebase Inspection

Before writing tests, inspect the existing application and report:

## Routes & Guards
- [ ] List all Angular routes defined in the project (e.g., `/login`, `/dashboard`, `/order`, `/blotter`)
- [ ] Identify which routes require authentication
- [ ] Locate the route guard implementation and understand how it redirects unauthenticated users to `/login`
- [ ] Verify the guard passes/stores the return URL for post-login redirect

## Authentication & Token Handling
- [ ] Where does the login form live? (e.g., `src/app/auth/login/login.component.ts`)
- [ ] How does the application store the authentication token? (localStorage, sessionStorage, signal/state)
- [ ] How is the token attached to outbound API requests? (interceptor, service, manual)
- [ ] What does a successful login response contain? (token shape, user info)
- [ ] What does a failed login response look like? (error codes, messages)

## Auth API Integration
- [ ] Where is the auth client generated? (e.g., `src/app/generated/auth-api/...`)
- [ ] Are the generated types used throughout, or are they wrapped in a service?
- [ ] Locate the auth service that wraps the client (if one exists)
- [ ] What are the actual endpoint paths? (`/auth/login`, `/auth/register`, `/auth/refresh`, etc.)
- [ ] What status codes/error codes does the auth API return? (`AUTH-401`, `AUTH-409` per the README)

## Order & Account APIs
- [ ] Where is the trade API client generated? (e.g., `src/app/generated/trade-api/...`)
- [ ] Locate the order placement component (e.g., `src/app/order/order-ticket/order-ticket.component.ts`)
- [ ] What is the form's validation logic? (required fields, min quantity, max decimal places, etc.)
- [ ] Locate the account service and how it fetches account info
- [ ] What account fields are displayed in the UI? (account ID, cash balance, status, etc.)
- [ ] Is the account field in the order form read-only? (Yes, per README)
- [ ] How does the order submission work? (form validation → API call → response handling)

## Order Status Handling
- [ ] After `POST /api/v1/orders`, what status does the response contain? (e.g., `{ status: "NEW" }`)
- [ ] How does the blotter/order list fetch current order status? (list endpoint, polling interval)
- [ ] Are there any existing polling/polling mechanisms in the order service?
- [ ] What are the four possible status values? (`NEW`, `FILLED`, `REJECTED`, `CANCELLED`)

## Error Handling & Codes
- [ ] Locate the error code mapping. (Should map all 8 codes per README to readable messages)
- [ ] How does the application currently handle and display `ORD-409`, `ORD-400`, `AUTH-401`, `AUTH-409`, etc.?
- [ ] Where is this mapping implemented? (component, service, interceptor)

## Existing Data-testid Attributes
- [ ] Search the codebase for existing `data-testid` usage
- [ ] Does the login form have `data-testid` on username, password, submit button?
- [ ] Do the order form fields have `data-testid`?
- [ ] Do status badges in the blotter have `data-testid`?
- [ ] If not, which ones need to be added for test stability?

## Environment & Configuration
- [ ] Are there existing `environment.ts` files? (prod, dev, staging)
- [ ] Does the project use `.env` files or environment variables elsewhere?
- [ ] How are API base URLs currently configured?
- [ ] Is Playwright already installed/configured in `playwright.config.ts`?
- [ ] Is there already an `e2e/` or `playwright/` directory?

## Generated Clients
- [ ] Verify that `src/app/generated/` (or equivalent) contains committed generated code from contracts
- [ ] Check the generation command documented in the project (should be in README or generate script)
- [ ] Verify the structure: separate subdirs for `trade-api` and `auth-api`

---

# Phase 1: Playwright Setup

## 1.1 Install/Configure Playwright

If Playwright is not already configured:

```bash
npm install --save-dev @playwright/test
npx playwright install
```

Create or update `playwright.config.ts` at the project root:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:4200',
    trace: 'on-first-retry',
  },
  webServer: undefined, // Tests run against existing running services
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

**Key points:**
- `testDir: './e2e'`: Tests live in `e2e/`
- `baseURL` from `E2E_BASE_URL` environment variable
- `webServer: undefined`: Do NOT start a dev server. Tests assume services are already running.
- Do NOT use `webServer` to auto-start the Angular app. You must start it separately.

## 1.2 Create E2E Directory

```bash
mkdir -p e2e
```

## 1.3 Environment Variables

Create `.env.example` at the project root:

```
# E2E Test Configuration
E2E_BASE_URL=http://localhost:4200
E2E_TRADE_API=http://localhost:3001
E2E_AUTH_API=http://localhost:3002
E2E_USERNAME=testuser@example.com
E2E_PASSWORD=SecurePassword123!
E2E_ACCOUNT_ID=1
E2E_SYMBOL=META
```

Create `.env.local` (or `.env.test`) for local testing with real credentials:

```
E2E_BASE_URL=http://localhost:4200
E2E_TRADE_API=http://localhost:3001
E2E_AUTH_API=http://localhost:3002
E2E_USERNAME=<real-test-username>
E2E_PASSWORD=<real-test-password>
E2E_ACCOUNT_ID=<real-test-account-id>
E2E_SYMBOL=<real-test-symbol>
```

**CRITICAL**: Do NOT commit `.env.local` or real credentials. Add to `.gitignore`:

```
.env.local
.env.test
```

Load environment variables in tests using `process.env`:

```typescript
const baseUrl = process.env.E2E_BASE_URL;
if (!baseUrl) throw new Error('E2E_BASE_URL not set');
```

---

# Phase 2: Login Journey (`e2e/login.spec.ts`)

## 2.1 Test Scenarios

### Scenario A: Guard Redirect
Navigate to a protected route (e.g., `/order`) with no existing authenticated state.

**Verify:**
- The guard intercepts the navigation
- The user is redirected to `/login`
- The URL/pathname changes to the login route
- The return URL is captured (if your guard implements returnUrl logic)

**Implementation approach:**
```typescript
test('should redirect unauthenticated user to login', async ({ browser }) => {
  // Fresh browser context = no existing tokens
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto(`${baseUrl}/order`); // Try to access protected route
  
  // Verify redirected to login
  await expect(page).toHaveURL(/\/login/);
  
  await context.close();
});
```

### Scenario B: Refused Sign-In
Attempt login with invalid credentials using the actual login form and Auth API.

**Verify:**
- The login attempt is submitted to the real Auth API
- The response is rejected (`AUTH-401` or similar)
- The user remains on `/login`
- An appropriate error state/message is displayed
- The page does NOT redirect to a dashboard or protected route

**Implementation approach:**
```typescript
test('should display error and remain on login when credentials are invalid', async ({ page }) => {
  await page.goto(`${baseUrl}/login`);
  
  await page.fill('[data-testid="login-username"]', 'invalid@example.com');
  await page.fill('[data-testid="login-password"]', 'WrongPassword123!');
  await page.click('[data-testid="login-submit"]');
  
  // Wait for error to appear
  await expect(page.locator('[data-testid="login-error"]')).toBeVisible();
  
  // Verify still on login page
  await expect(page).toHaveURL(/\/login/);
});
```

### Scenario C: Successful Sign-In
Sign in with valid credentials from `E2E_USERNAME` and `E2E_PASSWORD`.

**Verify:**
- The login succeeds
- The user is redirected away from `/login`
- Authentication state is established (token in storage or state)
- The user arrives at the expected post-login route (dashboard, order page, etc.)

**Implementation approach:**
```typescript
test('should successfully sign in and redirect to dashboard', async ({ page }) => {
  await page.goto(`${baseUrl}/login`);
  
  await page.fill('[data-testid="login-username"]', process.env.E2E_USERNAME!);
  await page.fill('[data-testid="login-password"]', process.env.E2E_PASSWORD!);
  await page.click('[data-testid="login-submit"]');
  
  // Wait for redirect away from login
  await page.waitForNavigation();
  await expect(page).not.toHaveURL(/\/login/);
  
  // Verify authenticated state exists (check token in storage, DOM, etc.)
  // (Inspect how your app stores tokens)
});
```

### Scenario D: Arriving Where You Were Going
This scenario tests the guard's return-URL logic (if implemented).

1. Navigate to a protected route (e.g., `/order`)
2. Get redirected to `/login` with the original URL captured
3. Sign in successfully
4. Verify the user is redirected to the originally requested route

**Verify:**
- The return URL was captured by the guard
- After successful login, the user arrives back at `/order` (or whatever protected route was initially requested)

**Implementation approach:**
```typescript
test('should return to originally requested route after successful login', async ({ page }) => {
  // Try to access a protected route first
  await page.goto(`${baseUrl}/order`);
  
  // Should redirect to login and capture return URL
  await expect(page).toHaveURL(/\/login/);
  
  // Log in
  await page.fill('[data-testid="login-username"]', process.env.E2E_USERNAME!);
  await page.fill('[data-testid="login-password"]', process.env.E2E_PASSWORD!);
  await page.click('[data-testid="login-submit"]');
  
  // Should redirect back to the original route
  await page.waitForNavigation();
  await expect(page).toHaveURL(/\/order/);
});
```

**Note**: If your guard does not implement return-URL logic and always redirects to a dashboard or home page after login, follow the application's actual behaviour. The test should verify what actually happens, not what you think should happen.

## 2.2 Stable Selectors for Login Form

If the login form does not have `data-testid` attributes, add them now:

```typescript
// login.component.ts or login.component.html
<input 
  type="email" 
  formControlName="username" 
  data-testid="login-username"
  placeholder="Email" 
/>

<input 
  type="password" 
  formControlName="password" 
  data-testid="login-password"
  placeholder="Password" 
/>

<button type="submit" data-testid="login-submit">
  Sign In
</button>

<div *ngIf="(loginError$ | async) as error" data-testid="login-error">
  {{ error }}
</div>
```

The Playwright tests will use these stable selectors:

```typescript
await page.fill('[data-testid="login-username"]', username);
await page.fill('[data-testid="login-password"]', password);
await page.click('[data-testid="login-submit"]');
await expect(page.locator('[data-testid="login-error"]')).toBeVisible();
```

---

# Phase 3: Place-Order Journey (`e2e/place-order.spec.ts`)

## 3.1 Test Isolation

**CRITICAL**: This spec must be completely independent. It must NOT:
- Import state from `login.spec.ts`
- Rely on a shared token or browser context
- Depend on accounts or orders created by another test

Instead, **perform the login as part of this spec's setup**:

```typescript
import { test, expect } from '@playwright/test';

const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:4200';

async function loginAsTestUser(page) {
  await page.goto(`${baseUrl}/login`);
  await page.fill('[data-testid="login-username"]', process.env.E2E_USERNAME!);
  await page.fill('[data-testid="login-password"]', process.env.E2E_PASSWORD!);
  await page.click('[data-testid="login-submit"]');
  await page.waitForNavigation();
  // Assume we're now authenticated and on a dashboard or home page
}

test.describe('Place Order Journey', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
    // Now you're authenticated and can proceed with order placement
  });

  test('should reject invalid order before submission', async ({ page }) => {
    // ... test continues
  });

  test('should successfully place a valid order', async ({ page }) => {
    // ... test continues
  });
});
```

Each test method starts with a fresh `page` (and fresh browser context in isolated mode). Playwright's default isolation handles this.

## 3.2 Scenario A: Read-Only Account

Navigate to the order placement form and verify that the account is displayed and read-only.

**Expected behaviour** (from README):
- The account ID shown corresponds to `E2E_ACCOUNT_ID`
- The account field is read-only or disabled, preventing user edits
- Other account details (cash balance, status, etc.) are displayed

**Verify:**
- The correct account is displayed
- The account field cannot be edited
- The rendered account matches the authenticated user's account

**Implementation approach:**
```typescript
test('should display read-only account information', async ({ page }) => {
  await page.goto(`${baseUrl}/order`);
  
  // Verify account field is displayed with correct ID
  const accountInput = page.locator('[data-testid="order-account"]');
  await expect(accountInput).toHaveValue(process.env.E2E_ACCOUNT_ID!);
  
  // Verify it is read-only (disabled attribute or similar)
  await expect(accountInput).toBeDisabled();
  
  // Verify other account details are displayed (if applicable)
  // e.g., cash balance
});
```

## 3.3 Scenario B: Rejection Before Submission (Client-Side Validation)

Inspect the existing order form validation rules and pick one realistic scenario.

**Examples of validation that might exist:**
- Quantity is required and must be > 0
- Price must be > 0 with at most 2 decimal places
- Symbol must match the pattern the contract allows (e.g., alphabetic, 1-5 chars)
- Account is required (always pre-filled)
- Order type is required

**DO NOT invent validation.** Use an actual rule from the application's existing implementation.

**Verify:**
- The invalid input is entered into the form
- The form validation state shows an error or the submit button is disabled
- No API request is sent (or the request is not sent before validation passes)
- The user remains on the order form

**Implementation approach (example: invalid quantity):**
```typescript
test('should reject order with invalid quantity before submission', async ({ page }) => {
  await page.goto(`${baseUrl}/order`);
  
  // Fill valid fields
  await page.selectOption('[data-testid="order-symbol"]', process.env.E2E_SYMBOL!);
  await page.fill('[data-testid="order-quantity"]', '0'); // Invalid: must be > 0
  await page.fill('[data-testid="order-price"]', '100.50');
  
  // Verify error is shown
  await expect(page.locator('[data-testid="order-error-quantity"]')).toBeVisible();
  
  // Verify submit button is disabled
  await expect(page.locator('[data-testid="order-submit"]')).toBeDisabled();
  
  // Verify no request was made
  // (If inspecting network, verify POST /api/v1/orders was not called)
});
```

## 3.4 Scenario C: Successful Order Placement

Place a valid order using the UI.

**Use real data from environment:**
- Account: `E2E_ACCOUNT_ID` (pre-filled and read-only)
- Symbol: `E2E_SYMBOL`
- Quantity: Valid quantity (e.g., 1, 5, 10)
- Price: Valid price (e.g., 100.00)
- Order Type: Application default or select appropriate type (e.g., LIMIT, default to DELIVERY per server code)

**Verify:**
- All valid fields are filled
- The form is valid (no errors, submit button enabled)
- The order is submitted via the real Trade REST API
- The response contains an order with a status of `NEW`, `FILLED`, or `REJECTED`

**Do NOT assert that status must be `FILLED`.** The executor may be running or not, making the status variable.

**Implementation approach:**
```typescript
test('should successfully place a valid order', async ({ page }) => {
  await page.goto(`${baseUrl}/order`);
  
  // Fill form with valid data
  await page.selectOption('[data-testid="order-symbol"]', process.env.E2E_SYMBOL!);
  await page.fill('[data-testid="order-quantity"]', '1');
  await page.fill('[data-testid="order-price"]', '100.00');
  // Account is pre-filled and read-only
  
  // Verify form is valid
  await expect(page.locator('[data-testid="order-submit"]')).toBeEnabled();
  
  // Submit order
  await page.click('[data-testid="order-submit"]');
  
  // Wait for response and success state
  // The UI should show the placed order or redirect to blotter/confirmation
  await page.waitForNavigation(); // Or wait for success message/dialog
  
  // Verify the response/displayed status is one of the valid states
  const orderStatus = await page.locator('[data-testid="order-status"]').textContent();
  expect(['NEW', 'FILLED', 'REJECTED']).toContain(orderStatus);
});
```

## 3.5 Asynchronous Order Status

**Critical from README**: Orders come back as `NEW` and the executor resolves them asynchronously.

If your order form displays the order result immediately (e.g., a confirmation with status), verify that:
- Status can be `NEW` (most likely for tests)
- The UI renders `NEW` as a working/in-progress state, not an error

If the form redirects to a blotter/order list, verify:
- The new order appears in the list with status `NEW`
- The UI re-polls the order list to keep status current
- The blotter indicates the order is "working" when status is `NEW`

**Polling expectation** (from README):
- The app MAY poll order history while any order is at `NEW`
- Polling should stop when all orders are settled or after a max attempt count
- Polling should not spam the API (e.g., every 2 seconds max)
- The UI should indicate "order is still working" rather than "order failed"

**Implementation (if form redirects to blotter):**
```typescript
test('should successfully place a valid order and display in blotter', async ({ page }) => {
  await page.goto(`${baseUrl}/order`);
  
  // Fill and submit order
  await page.selectOption('[data-testid="order-symbol"]', process.env.E2E_SYMBOL!);
  await page.fill('[data-testid="order-quantity"]', '1');
  await page.fill('[data-testid="order-price"]', '100.00');
  await page.click('[data-testid="order-submit"]');
  
  // Wait for redirect to blotter
  await page.waitForNavigation();
  await expect(page).toHaveURL(/\/blotter/);
  
  // Wait for the new order to appear in the list
  // It should have status NEW, FILLED, or REJECTED
  const latestOrderRow = page.locator('[data-testid="order-row"]').first();
  await expect(latestOrderRow).toBeVisible();
  
  const status = await latestOrderRow.locator('[data-testid="order-status"]').textContent();
  expect(['NEW', 'FILLED', 'REJECTED']).toContain(status?.trim());
});
```

---

# Phase 4: Test Helpers (Optional but Recommended)

If login logic is duplicated, create a shared helper file: `e2e/auth-helper.ts`

```typescript
export async function loginAsTestUser(page) {
  const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:4200';
  await page.goto(`${baseUrl}/login`);
  await page.fill('[data-testid="login-username"]', process.env.E2E_USERNAME!);
  await page.fill('[data-testid="login-password"]', process.env.E2E_PASSWORD!);
  await page.click('[data-testid="login-submit"]');
  await page.waitForNavigation();
}
```

Then import in `place-order.spec.ts`:

```typescript
import { loginAsTestUser } from './auth-helper';

test.beforeEach(async ({ page }) => {
  await loginAsTestUser(page);
});
```

---

# Phase 5: Environment & Secret Validation

Before running tests:

## 5.1 Verify Environment Variables

```bash
# Create .env.local with real test credentials (DO NOT COMMIT)
E2E_BASE_URL=http://localhost:4200
E2E_TRADE_API=http://localhost:3001
E2E_AUTH_API=http://localhost:3002
E2E_USERNAME=realTestUser@example.com
E2E_PASSWORD=RealPassword123!
E2E_ACCOUNT_ID=1
E2E_SYMBOL=META
```

Load them before running tests:

```bash
# Linux/Mac
export $(cat .env.local | xargs)
npx playwright test

# Windows PowerShell
Get-Content .env.local | ForEach-Object {
  if ($_ -match '=') {
    $parts = $_.Split('=')
    [Environment]::SetEnvironmentVariable($parts[0], $parts[1], "Process")
  }
}
npx playwright test
```

Or use a tool like `dotenv-cli`:

```bash
npm install --save-dev dotenv-cli
npx dotenv -e .env.local -- npx playwright test
```

## 5.2 Scan for Secrets in Built Bundle

After the Angular app is built for production, scan for:

```bash
cd dist/<app-directory>
grep -r "jwt_secret\|x-api-key\|api_key\|fauxnance" .
grep -r "Authorization: Bearer" .
```

**Expected**: No results. If any are found, remove them.

---

# Phase 6: Running the Tests

## 6.1 Startup Sequence

Before running tests, ensure the stack is running:

```bash
# Terminal 1: PostgreSQL (if running locally)
# Instructions depend on your setup

# Terminal 2: Auth Service
cd auth-service
npm install
npm start  # Runs on http://localhost:3002 (adjust as needed)

# Terminal 3: Trade REST API (Spring Boot)
cd spring-boot-app
mvn clean spring-boot:run  # Runs on http://localhost:3001 (adjust as needed)

# Terminal 4: Trade Executor (Spring Boot)
cd trade-executor
mvn clean spring-boot:run  # Runs in background, consumes Kafka

# Terminal 5: Angular UI
cd trading-ui
npm install
npm start  # Runs on http://localhost:4200

# Terminal 6: Run Playwright tests
cd trading-ui
npm install --save-dev @playwright/test
npx dotenv -e .env.local -- npx playwright test
```

## 6.2 Commands

```bash
# Install Playwright (if not already installed)
npm install --save-dev @playwright/test
npx playwright install

# Run all E2E tests
npx dotenv -e .env.local -- npx playwright test

# Run only login tests
npx dotenv -e .env.local -- npx playwright test e2e/login.spec.ts

# Run only place-order tests
npx dotenv -e .env.local -- npx playwright test e2e/place-order.spec.ts

# Run in UI mode (interactive debugging)
npx dotenv -e .env.local -- npx playwright test --ui

# Run with detailed output
npx dotenv -e .env.local -- npx playwright test --reporter=verbose

# Run a single test by name
npx dotenv -e .env.local -- npx playwright test -g "should redirect unauthenticated user"

# Test in a specific browser
npx dotenv -e .env.local -- npx playwright test --project=chromium

# Verify test isolation (run each file separately)
npx dotenv -e .env.local -- npx playwright test e2e/login.spec.ts
npx dotenv -e .env.local -- npx playwright test e2e/place-order.spec.ts
```

## 6.3 Verification Checklist

- [ ] Both services are running and healthy
- [ ] Test user account exists in auth database
- [ ] Test account exists in trading database with sufficient cash balance
- [ ] `E2E_BASE_URL`, `E2E_USERNAME`, `E2E_PASSWORD`, `E2E_ACCOUNT_ID`, `E2E_SYMBOL` are set in `.env.local`
- [ ] `.env.local` is in `.gitignore`
- [ ] Login test passes in isolation
- [ ] Place-order test passes in isolation
- [ ] Running both together produces no interference
- [ ] Built Angular bundle contains no secrets (run secret scan)

---

# Phase 7: Troubleshooting

## Test Fails: "E2E_BASE_URL not set"
**Fix**: Create `.env.local` with all required variables.

## Test Fails: "Connection refused" or "ECONNREFUSED"
**Fix**: Verify all services are running on the configured ports. Check terminal logs.

## Login Test Passes, but Place-Order Fails
**Likely cause**: The test can't navigate to the order page after login. Check:
- Does the guard redirect to the wrong page?
- Is the order route at `/order` or elsewhere?
- Does the test wait long enough for the page to load?

## Order Placement Hangs or Times Out
**Likely cause**: The order API is not running or is very slow. Check:
- Spring Boot app logs for errors
- Network tab in browser to see if `POST /api/v1/orders` is pending
- Database connectivity

## Order Status is Always "NEW"
**Expected behaviour** if the executor is not processing orders. Verify:
- Trade Executor is running (`mvn spring-boot:run` in `trade-executor/`)
- Kafka is running (executor consumes from `orders` topic)
- No errors in executor logs

---

# Phase 8: Deliverables Checklist

- [ ] `playwright.config.ts` configured with `E2E_BASE_URL` from env vars
- [ ] `e2e/login.spec.ts` with 4 test scenarios (guard redirect, refused login, successful login, return URL)
- [ ] `e2e/place-order.spec.ts` with 4 test scenarios (read-only account, client-side validation rejection, successful placement, async status)
- [ ] `.env.example` documenting all required environment variables
- [ ] `.env.local` created (not committed) with real test credentials
- [ ] `.gitignore` includes `.env.local` and `.env.test`
- [ ] All required `data-testid` attributes added to login form and order form
- [ ] Both tests run independently without shared state
- [ ] Both tests run against the real Auth Service, Trade REST API, and database
- [ ] Secret scan of built bundle shows no API keys, secrets, or fauxnance references
- [ ] Test runs documented in `e2e/README.md` or similar

---

# Phase 9: Optional: Blotter Journey

**Only if time permits and both assessed journeys are solid:**

`e2e/blotter.spec.ts`

This test would:
1. Sign in
2. Verify the blotter displays existing orders (or navigate to place an order first)
3. Verify status badges render correctly (`NEW`, `FILLED`, `REJECTED`, `CANCELLED`)
4. Verify that if any order is at `NEW`, the blotter re-polls and updates status
5. Verify the UI indicates the order is "working" when at `NEW`

**Do not spend time on this if the two assessed journeys need work.**

---

# Acceptance Criteria

Your instructor will verify:

1. ✅ Sign-in works end to end against the real Auth service
2. ✅ Order placement works against the real Trade REST API and backend
3. ✅ Both journeys run independently without shared state
4. ✅ Environment variables are used (not hard-coded credentials)
5. ✅ Tests handle `NEW` status as a working state, not an error
6. ✅ No secrets in the built Angular bundle
7. ✅ Stable selectors (data-testid) used throughout
8. ✅ Tests are readable and not over-engineered
