# Trading UI (frontend-app): the complete guide

This guide explains the Angular frontend of the trading platform from start to finish: every folder, every file,
what each one does, and how they work together. It uses **real user flows** (register, sign in, verify identity,
trade, admin review…) to show where each file comes into play.

- **Code location:** [Application/Frontend/frontend-app/](../Frontend/frontend-app/)
- **Companion guides:** [auth-service-guide.md](auth-service-guide.md) (sign-in, tokens, KYC),
  [order-service-guide.md](order-service-guide.md) (Trade REST API: accounts, orders, watchlists),
  [executor-service-guide.md](executor-service-guide.md) (order execution and live prices)

Paths shown in code blocks and tables are relative to `Application/Frontend/frontend-app/` unless they say
otherwise.

If you are new to Angular, read it in order. Part 1 teaches only the Angular ideas this app actually uses. Every
later part builds on it.

---

## Table of contents

- [Part 0: The 60-second mental model](#part-0-the-60-second-mental-model)
- [Part 1: Angular crash course (only what this app uses)](#part-1-angular-crash-course-only-what-this-app-uses)
- [Part 2: Folder and file map](#part-2-folder-and-file-map)
- [Part 3: Tooling and configuration files](#part-3-tooling-and-configuration-files)
- [Part 4: How the app boots](#part-4-how-the-app-boots)
- [Part 5: Routing, the map of every screen](#part-5-routing-the-map-of-every-screen)
- [Part 6: The shared layer, file by file](#part-6-the-shared-layer-file-by-file)
- [Part 7: The feature screens, file by file](#part-7-the-feature-screens-file-by-file)
- [Part 8: User flows end to end](#part-8-user-flows-end-to-end)
- [Part 9: State, meaning where data lives](#part-9-state-meaning-where-data-lives)
- [Part 10: Error handling pipeline](#part-10-error-handling-pipeline)
- [Part 11: Styling and theming](#part-11-styling-and-theming)
- [Part 12: Accessibility patterns](#part-12-accessibility-patterns)
- [Part 13: Testing (unit and end-to-end)](#part-13-testing-unit-and-end-to-end)
- [Part 14: Commands cheat sheet](#part-14-commands-cheat-sheet)
- [Part 15: Known quirks and technical debt](#part-15-known-quirks-and-technical-debt)
- [Part 16: Review questions and answers](#part-16-review-questions-and-answers)
- [Part 17: Glossary](#part-17-glossary)

---

## Part 0: The 60-second mental model

The frontend is a **single-page application (SPA)**. The browser downloads one HTML page and one JavaScript
bundle, and from then on Angular swaps screens in and out **without reloading the page**. All data comes from
two backend services over HTTP/JSON:

```
                          ┌──────────────────────────────────────────────┐
  Browser (localhost:4200)│                Angular app                   │
                          │                                              │
   URL /orders/new ──────►│  Router ──► guards ──► AppShell ──► PlaceOrder│
                          │                                    component │
                          │                                       │      │
                          │                         calls a service      │
                          │                                       ▼      │
                          │   MockAuthService / MockKycService /         │
                          │   TradeApiService / WatchlistService         │
                          │                                       │      │
                          │           generated client → HttpClient      │
                          │                                       ▼      │
                          │   authTokenInterceptor (adds "Bearer <JWT>", │
                          │   refreshes an expired token, retries)       │
                          └───────────────┬───────────────────┬──────────┘
                                          │                   │
                       http://localhost:3000        http://localhost:8080
                          ┌───────────────▼──┐      ┌─────────▼─────────────┐
                          │  Auth service    │      │  Trade REST API       │
                          │  /auth/*, /kyc   │      │  /api/v1/accounts/me, │
                          │  (login, JWTs,   │      │  /orders, /watchlists,│
                          │   KYC)           │      │  /instruments         │
                          └──────────────────┘      └───────────────────────┘
```

Five ideas explain almost everything:

1. **Components** are screens or pieces of a screen. Each one is a TypeScript class with an HTML template.
2. **Services** hold logic and talk to the backend. Components ask Angular for them through
   **dependency injection** (`inject(...)`).
3. **The router** maps URLs to components. **Guards** decide whether a URL may open (signed in? KYC approved?
   admin?).
4. **The HTTP interceptor** quietly attaches the login token to every backend call and renews it when it expires.
5. **Signals** hold UI state (`isLoading`, `orders`, `errorMessage`…). When a signal changes, the screen updates.

---

## Part 1: Angular crash course (only what this app uses)

This project uses **Angular 21** in its modern style: standalone components, signals, the new `@if`/`@for`
template syntax, functional guards and interceptors, and `inject()`. You will not find `NgModule`s,
constructor injection or `*ngIf` in the app code. (The generated API clients do use older patterns, but you never
edit those.)

### 1.1 Components

A component is a class with a `@Component` decorator:

```ts
@Component({
  selector: 'app-status-badge',          // the HTML tag other templates use: <app-status-badge />
  imports: [ ... ],                      // other components/pipes this template uses
  template: `{{ label() }}`,             // the HTML (inline in this project, no separate .html files)
  styles: [`...`]                        // CSS that applies ONLY to this component
})
export class StatusBadgeComponent { ... }
```

- **Standalone:** every component lists what it needs in `imports`. There are no modules. In Angular 21,
  `standalone: true` is the default, which is why you don't see it written.
- **Inline templates:** this project puts the HTML in the `template:` string instead of a separate `.html` file,
  and component CSS in `styles:`. Global CSS lives in [src/styles.css](../Frontend/frontend-app/src/styles.css).
- **Selector prefix `app-`:** set in [angular.json](../Frontend/frontend-app/angular.json) (`"prefix": "app"`).

### 1.2 Template syntax you will see

| Syntax | Meaning | Example in this app |
|---|---|---|
| `{{ expr }}` | Interpolation: print a value | `{{ user()?.username }}` |
| `[prop]="expr"` | Property binding: set a DOM/component property | `[status]="order.status"` |
| `[attr.x]="expr"` | Attribute binding (for `aria-*`, `data-*`) | `[attr.aria-invalid]="usernameError() ? 'true' : null"` (a `null` value removes the attribute) |
| `[class.x]="bool"` | Toggle a CSS class | `[class.is-active]="passwordVisible()"` |
| `[style.--icon]="v"` | Set a CSS custom property | in the app shell nav |
| `(event)="handler()"` | Event binding | `(click)="signOut()"`, `(ngSubmit)="onSubmit()"` |
| `@if (cond) { } @else { }` | Conditional block (new control flow) | error alerts, loading states |
| `@if (x(); as v)` | Conditional that also names the value | `@if (errorMessage(); as message)` |
| `@for (x of list; track x.id) { }` | Loop. `track` tells Angular how to identify rows | order table rows |
| `#name` | Template reference variable | `<main #main>` in the shell |
| `<ng-content />` | Content projection: "put whatever the parent wrote between my tags here" | [auth-shell.component.ts](../Frontend/frontend-app/src/app/features/auth/auth-shell/auth-shell.component.ts) |
| `value \| pipe: arg` | Pipe: format a value | `{{ price \| currency }}`, `{{ date \| date: 'MMM d, h:mm a' }}` |

**Pipes used:** `CurrencyPipe` (`$1,234.50`), `DatePipe`, `DecimalPipe` (`number`). They come from
`@angular/common` and must be listed in a component's `imports`.

### 1.3 Signals (reactive state)

Signals are Angular's reactive values. **Every piece of UI state in this app is a signal.**

```ts
isLoading = signal(false);          // writable signal
isLoading();                        // READ it (call it like a function)
isLoading.set(true);                // WRITE it
count.update(n => n + 1);           // write based on the old value

total = computed(() => a() + b());  // derived, read-only; recalculates when a() or b() changes
ro = writable.asReadonly();         // expose a signal without letting others write to it
```

When a template reads a signal (`@if (isLoading())`), Angular re-renders that part whenever the signal changes.
`computed` only re-runs when a **signal** it read changes. That detail matters: see the Funds quirk in
[Part 15](#part-15-known-quirks-and-technical-debt).

**`toSignal(observable)`** turns an RxJS stream into a signal. The Place Order screen uses it to turn form
`valueChanges` into a signal so the summary panel updates live.

**`input()`** is a signal-based component input: `heading = input.required<string>()` in `AuthShellComponent`;
the parent passes it with `[heading]="..."`.

**`viewChild()`** is a signal that points at an element or child component in the template:
`viewChild.required<ElementRef>('main')`.

### 1.4 Dependency injection (DI) and services

A **service** is a plain class marked `@Injectable({ providedIn: 'root' })`. `providedIn: 'root'` means
**Angular creates one shared instance (a singleton) for the whole app**, the first time someone asks for it.

Components and other services ask for it with `inject()`:

```ts
private readonly authService = inject(MockAuthService);
```

Why DI instead of `new MockAuthService()`?
- Angular wires the service's own dependencies (e.g. the generated `AuthService` client, which itself uses
  `HttpClient`) automatically.
- Everyone shares **the same instance**, so the logged-in user stored in `MockAuthService` is the same
  everywhere.
- Tests can swap in a fake: `{ provide: MockAuthService, useValue: { ... } }`.

The comment at the top of [mock-auth.guard.ts](../Frontend/frontend-app/src/app/shared/guards/mock-auth.guard.ts) explains this exact point.

### 1.5 RxJS Observables (how HTTP works)

`HttpClient.get()` returns an **Observable**: a lazy stream that does nothing until someone calls
`.subscribe()`. Each HTTP Observable emits once (the response) or errors. The generated API clients are built
on `HttpClient`, so every generated method (e.g. `AccountsService.getMyBalance()`) returns one too.

```ts
this.tradeApi.getBalance()            // nothing has been sent yet
  .pipe(takeUntilDestroyed(this.destroyRef))
  .subscribe({                        // NOW the request is sent
    next: (balance) => { ... },       // success
    error: (err) => { ... }           // failure
  });
```

Operators used in this codebase (they go inside `.pipe(...)`):

| Operator | What it does | Where |
|---|---|---|
| `map` | Transform the value | convert backend `KycResponse` into the UI's `KycSubmission` |
| `tap` | Side effect, value unchanged | keep the new access token in memory after login |
| `catchError` | Handle an error: return a replacement stream or rethrow | every service's `rethrowServerError` |
| `switchMap` | "When this finishes, start that request" (chain requests) | login then `/auth/me`; refresh then retry |
| `forkJoin` | Run several requests in parallel, emit once all finish | dashboard (account + balance + positions) |
| `shareReplay(1)` | Share one in-flight request among many subscribers | token refresh de-duplication |
| `finalize` | Run when the stream ends (success or error) | clear `refreshInFlight`; clear session after logout |
| `of(x)` / `throwError(() => e)` | Make a stream that emits `x` / errors with `e` | fallbacks |
| `takeUntilDestroyed` | Auto-unsubscribe when the component is destroyed | almost every component subscription |

### 1.6 Router

- **Routes** (in [app.routes.ts](../Frontend/frontend-app/src/app/app.routes.ts)) map a path to a component.
- **`loadComponent: () => import(...)`** is **lazy loading**: that screen's code is downloaded only when first
  visited, which keeps the initial bundle small.
- **`children`**: nested routes render inside the parent component's `<router-outlet />`. That is how every
  signed-in page appears inside the sidebar shell.
- **`canActivate: [guard]`**: functions that run before navigation. They return `true` (allow) or a
  **`UrlTree`** (redirect somewhere else).
- **`data: { isAdmin: true }`**: static data attached to a route, read via `ActivatedRoute.snapshot.data`.
- **`title`**: sets the browser tab title automatically.
- **`routerLink="/x"`**: a link that navigates without a page reload. `[queryParams]="{ symbol: 'AAPL' }"` adds
  `?symbol=AAPL`.
- **`routerLinkActive="is-active"`**: adds a CSS class when the link matches the current URL (sidebar highlighting).
- **`Router.navigate([...])` / `navigateByUrl('...')`**: navigation from code.
- **`ActivatedRoute`**: information about the current route (query params, data).

### 1.7 HttpClient and interceptors

`provideHttpClient(withInterceptors([authTokenInterceptor]))` (in [app.config.ts](../Frontend/frontend-app/src/app/app.config.ts)) makes
`HttpClient` available and runs **every request** through `authTokenInterceptor`. An interceptor is a function
`(req, next) => Observable` that can modify the request (add a header), call `next(req)` to send it, and
react to the response (e.g. catch a 401). The generated API clients send their requests through the same
`HttpClient`, so the interceptor sees every call the app makes.

`withCredentials: true` on a request tells the browser to store and send **cookies** on a cross-origin call
(the UI on `:4200` calling the auth service on `:3000`). The auth client is configured with it so the HttpOnly
`refresh_token` cookie works (see [Part 9](#part-9-state-meaning-where-data-lives)).

HTTP errors arrive as `HttpErrorResponse`, with:
- `.status`: the HTTP status (`0` means the server could not be reached at all),
- `.error`: the JSON body the server sent (here `{ errorCode, message }`).

### 1.8 Reactive forms

Forms are built in TypeScript, not in the template:

```ts
form = inject(NonNullableFormBuilder).group({
  username: ['', [Validators.required, Validators.maxLength(64)]],
  password: ['', [Validators.required]]
});
```

- `[formGroup]="form"` on `<form>` and `formControlName="username"` on `<input>` connect them.
- `(ngSubmit)` fires on submit.
- `form.invalid`, `control.hasError('required')`, `control.touched`, `control.pristine` drive error messages.
- `form.getRawValue()` returns the values; `patchValue()` and `reset()` change them.
- **NonNullable** means `reset()` returns controls to their initial value instead of `null`.
- **Custom validators** are plain functions `(control) => ValidationErrors | null`, e.g. `matchesPassword`,
  `wholeNumber`, `positive`, `twoDecimals`.
- Angular adds CSS classes such as `ng-invalid` to inputs. The app uses
  `querySelector('input.ng-invalid')?.focus()` to jump to the first broken field.

**Error display pattern used on every form:** an error shows only when the control is invalid **and**
(the user touched it **or** pressed submit). That's what `submitted = signal(false)` is for.

### 1.9 Component lifecycle and cleanup

| Piece | When it runs | Used for |
|---|---|---|
| `constructor()` / field initialisers | Instance created | `inject()` calls, building forms, subscribing to `valueChanges` |
| `ngOnInit()` | After inputs are set, before first render completes | loading data from the backend |
| `DestroyRef` + `takeUntilDestroyed` | When the component is removed | cancelling HTTP subscriptions, stopping timers |
| `afterNextRender(fn, { injector })` | After the next DOM update | moving keyboard focus to an element that just appeared |

### 1.10 Bootstrapping

`bootstrapApplication(AppComponent, appConfig)` in [main.ts](../Frontend/frontend-app/src/main.ts) starts Angular: it finds
`<app-root>` in `index.html`, renders `AppComponent` there, and registers the app-wide **providers** from
`appConfig` (router, HttpClient + interceptor, API clients, session-restore initializer).

---

## Part 2: Folder and file map

Paths are relative to `Application/Frontend/frontend-app/`.

```
frontend-app/
├── package.json             npm dependencies + scripts (start, build, test, e2e, scan:bundle, generate:clients)
├── package-lock.json        exact dependency versions (auto-generated by npm)
├── angular.json             Angular CLI workspace config: build/serve/test settings, budgets, env file swap
├── tsconfig.json            base TypeScript config (strict mode, strict templates)
├── tsconfig.app.json        TS config for the app build (entry: src/main.ts)
├── tsconfig.spec.json       TS config for unit tests (*.spec.ts, jasmine types)
├── karma.conf.js            unit-test runner config (Karma + Jasmine in Chrome)
├── playwright.config.ts     end-to-end test config (runs against the real running stack)
├── openapitools.json        OpenAPI Generator config: how src/generated/ is produced from the contracts
├── .gitignore               what git ignores (node_modules, dist, .env.local, playwright reports…)
├── .env.local               (gitignored) E2E_* variables: URLs + test credentials for Playwright
├── public/                  static assets copied as-is into the build (currently just .gitkeep)
├── prompts/                 AI prompt docs used while building the UI (theme, login/register, e2e). Not app code.
├── scripts/
│   └── scan-bundle.mjs      searches dist/ for API keys, the market-data host and secrets (Part 13.3)
├── e2e/                     Playwright end-to-end tests (see Part 13)
│   ├── env.ts               reads E2E_* env vars; shared expected messages/constants
│   ├── helpers.ts           UI helpers: signIn, fillTicket, submitTicket, recordRequests
│   ├── api.ts               direct backend helpers: create users, submit/approve KYC, place orders
│   └── *.spec.ts            46 tests, one file per journey: login, place-order, blotter, session, admin,
│                            kyc, token-refresh, api-security, register, funds, watchlist
├── dist/, .angular/, node_modules/, playwright-report/, test-results/   generated output (gitignored)
└── src/
    ├── index.html           the single HTML page; contains <app-root>
    ├── main.ts              entry point: bootstrapApplication(AppComponent, appConfig)
    ├── styles.css           GLOBAL design system: colour tokens, light/dark theme, tp-* and sh-* classes
    ├── environments/
    │   ├── environment.ts       dev: API base URLs http://localhost:3000 and :8080
    │   └── environment.prod.ts  prod: same-origin paths /auth-api and /trade-api
    ├── generated/           GENERATED API clients. Never edit by hand (see Part 6.9)
    │   ├── README.md
    │   ├── auth-client/     from Contracts/API-Schemas/auth-api.yaml
    │   └── trade-client/    from Contracts/API-Schemas/trade-api.yaml
    └── app/
        ├── app.component.ts     root component: just <router-outlet />, plus starts ThemeService
        ├── app.config.ts        app-wide providers: router, HttpClient + interceptor, API clients,
        │                        session restore at startup
        ├── app.routes.ts        EVERY URL in the app, its component and guards
        ├── shared/              code used by many screens
        │   ├── api/api-clients.ts               base URLs + configures generated clients
        │   ├── interceptors/auth-token.interceptor.ts   adds JWT, silent refresh on 401
        │   ├── guards/
        │   │   ├── mock-auth.guard.ts           mockAuthGuard (signed in?) + mockAdminGuard (admin?)
        │   │   ├── kyc-approval.guard.ts        kycApprovalGuard (KYC APPROVED?)
        │   │   └── safe-return-url.ts           blocks open redirects via ?returnUrl=
        │   ├── services/
        │   │   ├── mock-auth.service.ts         register, login, /auth/me, refresh, logout, session state
        │   │   ├── access-token.store.ts        the in-memory access token (one shared signal)
        │   │   ├── mock-kyc.service.ts          KYC submit/update/read, admin pending list + review
        │   │   ├── trade-api.service.ts         every Trade REST API call (via the generated clients)
        │   │   ├── watchlist.service.ts         watchlist state (signals) + business rules
        │   │   ├── error-mapping.service.ts     error code → human message
        │   │   ├── theme.service.ts             light/dark theme
        │   │   └── market-data.service.ts       static stock catalog (currently UNUSED by the app)
        │   ├── models/                          TypeScript types (mostly aliases of generated models)
        │   │   ├── auth.models.ts  kyc.models.ts  order.models.ts  watchlist.models.ts
        │   ├── layout/app-shell.component.ts    sidebar + top bar frame for signed-in pages
        │   └── ui/status-badge.component.ts     coloured status pill (FILLED, PENDING, …)
        └── features/            one folder per screen/area
            ├── auth/
            │   ├── auth-shell/auth-shell.component.ts      frame for login/register pages
            │   ├── auth-shell/auth-showcase.component.ts   marketing panel on wide screens
            │   ├── login/login.component.ts                /login and /admin-login
            │   ├── register/register.component.ts          /register
            │   └── kyc/kyc-form.component.ts               /kyc-submission
            ├── dashboard/dashboard.component.ts            /dashboard
            ├── funds/funds.component.ts                    /funds
            ├── orders/place-order/place-order.component.ts /orders/new
            ├── orders/view-orders/view-orders.component.ts /orders/history
            ├── watchlist/watchlist.component.ts            /watchlist
            └── admin/
                ├── admin-dashboard.component.ts            /admin/dashboard
                └── kyc-review/kyc-review-list.component.ts /admin/kyc-review
```

Unit tests (`*.spec.ts`, next to the file they cover) exist for the screens and services the Sprint 9 brief
assesses: login, register, KYC form, dashboard, place order, view orders, the interceptor, `mockAuthGuard`,
`safeReturnUrl`, `ErrorMappingService`, `MockAuthService` and `TradeApiService`. The admin screens, funds,
watchlist, app shell, `MarketDataService`, `ThemeService`, `MockKycService`, `kycApprovalGuard` and the models
have none; funds, watchlist and the admin screens are covered by Playwright instead. (`api-clients.ts` is still
exercised: the auth and trade service specs load `provideApiClients()` exactly as `app.config.ts` does.)

**Architecture rule of thumb:**
- `features/` = screens. They contain UI logic and call services. They never call `HttpClient` directly.
- `shared/services/` = the only code that calls the backend. Every call goes through a **generated client**
  method, never a hand-built URL; no service injects `HttpClient` any more.
- `shared/models/` = shared types. Wire types are **aliases of the generated contract models**.
- `generated/` = machine-written from the API contracts. Components never import from here.

---

## Part 3: Tooling and configuration files

### [package.json](../Frontend/frontend-app/package.json)

Name `trading-ui` (the folder's old name, from before it was moved). Scripts:

| Script | Command | What it does |
|---|---|---|
| `npm start` | `ng serve` | dev server at http://localhost:4200 with live reload, using `environment.ts` |
| `npm run build` | `ng build` | production build into `dist/trading-ui/` (defaultConfiguration is `production`) |
| `npm run watch` | `ng build --watch --configuration development` | rebuild on change |
| `npm test` | `ng test` | Karma + Jasmine unit tests in Chrome (watch mode) |
| `npm run e2e` | `playwright test` | end-to-end tests against the real running stack |
| `npm run scan:bundle` | `node scripts/scan-bundle.mjs` | after a build, fails if `dist/` contains an API key, the market-data host or a secret (Part 13.3) |
| `npm run generate:clients` | `openapi-generator-cli generate` | regenerate `src/generated/` from the YAML contracts (needs Java) |
| `npm run lint` | `ng lint` | **not configured**: there is no lint builder in angular.json |

Dependencies: Angular 21 packages, `rxjs` (Observables), `zone.js` (Angular's change detection trigger),
`tslib`. Dev dependencies: Angular CLI/build tools, TypeScript 5.9, Karma/Jasmine, Playwright,
OpenAPI generator CLI (pinned to `2.41.0`).

### [angular.json](../Frontend/frontend-app/angular.json)

The Angular CLI's project config:
- `sourceRoot: src`, `prefix: app`, entry `browser: src/main.ts`, `index: src/index.html`.
- `polyfills: ["zone.js"]`: zone.js patches browser async APIs so Angular knows when to re-render.
- `styles: ["src/styles.css"]`: the one global stylesheet.
- `assets`: everything in `public/` is copied into the build.
- **production configuration**:
  - **budgets**: warn if the initial bundle exceeds 500 kB (error at 1 MB); warn if any **component's own
    styles** exceed 2 kB (error at 4 kB). This is why most CSS lives in the global `styles.css`.
  - **`fileReplacements`**: swaps `environment.ts` for `environment.prod.ts`. This is how prod gets different
    API URLs.
  - `outputHashing: all`: file names get content hashes for cache busting.
- **development configuration**: no optimisation, source maps on. `ng serve` uses this by default.
- **test**: Karma builder with `zone.js/testing`, using `tsconfig.spec.json`.
- Schematics: new components default to standalone + CSS.

### [tsconfig.json](../Frontend/frontend-app/tsconfig.json), [tsconfig.app.json](../Frontend/frontend-app/tsconfig.app.json), [tsconfig.spec.json](../Frontend/frontend-app/tsconfig.spec.json)

- Base config: `strict: true` (no implicit `any`, strict null checks), `noPropertyAccessFromIndexSignature`
  (which is why code writes `params['status']` rather than `params.status`), target ES2022.
- `angularCompilerOptions.strictTemplates: true`: **templates are type-checked**. A typo in a template binding
  or a wrong type passed to an input fails the build.
- `tsconfig.app.json` compiles from `src/main.ts`. `tsconfig.spec.json` compiles all `*.spec.ts` with Jasmine
  types.

### [karma.conf.js](../Frontend/frontend-app/karma.conf.js)

Unit-test runner: Jasmine framework, Chrome browser, HTML reporter, coverage output to `coverage/trading-ui`.

### [playwright.config.ts](../Frontend/frontend-app/playwright.config.ts)

End-to-end config:
- Loads `.env.local` for `E2E_*` variables (`process.loadEnvFile`).
- `baseURL` defaults to `http://localhost:4200`.
- **`workers: 1`, `fullyParallel: false`**: tests run one at a time because the Trade API allocates order IDs
  with `MAX(order_id) + 1`, so parallel orders could collide.
- `webServer: undefined`: Playwright **does not start anything**. You must already have the UI, auth service,
  trade API, executor, Postgres and Kafka running.
- Only Chromium.

### [openapitools.json](../Frontend/frontend-app/openapitools.json)

Config for OpenAPI Generator. Two generators (`typescript-angular`, generator version `7.25.0`):
- `auth-client`: input `../../Contracts/API-Schemas/auth-api.yaml` → `src/generated/auth-client`
- `trade-client`: input `../../Contracts/API-Schemas/trade-api.yaml` → `src/generated/trade-client`

(Paths are relative to `frontend-app/`, so the contracts are in `Application/Contracts/API-Schemas/`.)

### [src/environments/](../Frontend/frontend-app/src/environments/)

```ts
// environment.ts (dev, used by ng serve and ng test)
AUTH_API_BASE_URL: 'http://localhost:3000',
TRADE_API_BASE_URL: 'http://localhost:8080'

// environment.prod.ts (production build)
AUTH_API_BASE_URL: '/auth-api',
TRADE_API_BASE_URL: '/trade-api'
```

- **Dev:** the browser calls the two services directly on other ports. That is a **cross-origin** request, so
  the backends must allow CORS from `http://localhost:4200` (the auth service's `UI_ORIGIN`). The auth service
  also sends `Access-Control-Allow-Credentials: true`, which the browser requires before it stores or sends the
  refresh cookie on these cross-origin calls.
- **Prod caveat:** the refresh cookie's `Path=/auth` doesn't match the browser-visible `/auth-api/auth/…` URLs, so
  the proxy must rewrite the cookie path (see [Part 15](#part-15-known-quirks-and-technical-debt), item 10).
- **Prod:** URLs are same-origin paths; a reverse proxy/web server in front of the UI forwards `/auth-api/**`
  and `/trade-api/**` to the real services. That keeps hostnames and secrets out of the JavaScript bundle.
- **Everything in these files ships to the browser.** Never put secrets here (the comments say so too).

### [.gitignore](../Frontend/frontend-app/.gitignore), [.env.local](../Frontend/frontend-app/.env.local)

`.env.local` holds `E2E_BASE_URL`, `E2E_AUTH_API`, `E2E_TRADE_API`, `E2E_USERNAME`, `E2E_PASSWORD`,
`E2E_ACCOUNT_ID`, `E2E_SYMBOL`, `E2E_ADMIN_USERNAME`, `E2E_ADMIN_PASSWORD`. It is gitignored because it contains
credentials. `src/generated/` is **deliberately committed** so contract changes show up as reviewable diffs.

### [src/index.html](../Frontend/frontend-app/src/index.html)

The only HTML page. `<base href="/">` makes relative URLs and the router work from the site root.
`<app-root></app-root>` is where Angular renders the app.

---

## Part 4: How the app boots

What happens when you open `http://localhost:4200/` in a browser:

1. **The browser loads `index.html`.** It contains an empty `<app-root>` and the bundled scripts the CLI injected.
2. **[main.ts](../Frontend/frontend-app/src/main.ts) runs** `bootstrapApplication(AppComponent, appConfig)`.
3. **[app.config.ts](../Frontend/frontend-app/src/app/app.config.ts) registers app-wide providers:**
   ```ts
   provideRouter(routes),                                        // the URL map
   provideHttpClient(withInterceptors([authTokenInterceptor])),  // HttpClient + JWT interceptor
   ...provideApiClients(),                                       // configures the generated clients
   provideAppInitializer(() => inject(MockAuthService).restoreSession())  // silent session restore
   ```
   **The app initializer runs before the first navigation**, and Angular waits for the Observable it returns.
   `MockAuthService` is created here, which resets the in-memory access token to `null` and deletes any
   `auth_token`/`refresh_token` that older builds left in `localStorage`. Then `restoreSession()`:
   - nobody was signed in (no `current_user` in `localStorage`) → finishes at once, **no request**;
   - a returning user → **one `POST /auth/refresh`** with an empty body. The browser attaches the HttpOnly
     `refresh_token` cookie, and the response's new access token goes into memory. Then **`GET /auth/me`**
     reloads the user from the server, overwriting whatever `current_user` held (so a hand-edited cache can't
     survive a reload); if `/auth/me` fails, the cached user is kept;
   - the cookie is missing, expired or revoked → the session is cleared, and boot **still succeeds** (errors are
     swallowed). The guards then send the user to `/login`.
4. **[AppComponent](../Frontend/frontend-app/src/app/app.component.ts) renders.** Its whole template is `<router-outlet />`. It injects
   `ThemeService` purely so the theme the user saved is applied **before** the first screen paints (no flash
   of the wrong theme).
5. **The router reads the URL `/`.** The first route `{ path: '', redirectTo: '/login', pathMatch: 'full' }`
   redirects to `/login`.
6. **`/login` lazy-loads `LoginComponent`** (its JavaScript chunk downloads now) and renders it in the
   `<router-outlet />`.

The access token is **never written to web storage**, so every page load starts without one. `currentUser` is
still loaded from `localStorage['current_user']`, but it is a **display cache only** (username, greeting): it
tells `restoreSession()` a refresh is worth trying, and nothing that decides access ever reads it.
The bootstrap refresh above is what keeps **a page reload signed in** (see
[Flow 15](#flow-15-page-reload-keeps-you-signed-in)).

---

## Part 5: Routing, the map of every screen

Source: [app.routes.ts](../Frontend/frontend-app/src/app/app.routes.ts)

| URL | Component | Guards | Inside shell? | Notes |
|---|---|---|---|---|
| `/` | (none) | none | n/a | redirects to `/login` |
| `/register` | `RegisterComponent` | none (public) | no | |
| `/login` | `LoginComponent` | none (public) | no | |
| `/admin-login` | `LoginComponent` (same one!) | none (public) | no | `data: { isAdmin: true }` makes it call `/auth/admin/login` |
| `/kyc-submission` | `KycFormComponent` | `mockAuthGuard` (from parent) | yes | reachable without KYC approval, by design; admins are sent to `/admin/dashboard` |
| `/dashboard` | `DashboardComponent` | `mockAuthGuard` + `kycApprovalGuard` | yes | |
| `/orders/new` | `PlaceOrderComponent` | `mockAuthGuard` + `kycApprovalGuard` | yes | accepts `?symbol=AAPL` |
| `/orders/history` | `ViewOrdersComponent` | `mockAuthGuard` + `kycApprovalGuard` | yes | |
| `/funds` | `FundsComponent` | `mockAuthGuard` + `kycApprovalGuard` | yes | |
| `/watchlist` | `WatchlistComponent` | `mockAuthGuard` + `kycApprovalGuard` | yes | |
| `/admin/dashboard` | `AdminDashboardComponent` | `mockAdminGuard` (from parent) | yes | |
| `/admin/kyc-review` | `KycReviewListComponent` | `mockAdminGuard` (from parent) | yes | |
| anything else (`**`) | (none) | none | n/a | redirects to `/login` |

**How "inside the shell" works.** The customer routes are `children` of a route with `path: ''` and
`component: AppShellComponent`. When you visit `/dashboard`, the router:
1. runs the parent's `canActivate: [mockAuthGuard]`,
2. runs the child's `canActivate: [kycApprovalGuard]`,
3. renders `AppShellComponent` (sidebar + top bar) in `AppComponent`'s outlet,
4. renders `DashboardComponent` inside the **shell's** `<router-outlet />` (inside `<main>`).

The admin routes do the same under the `admin` path. That's why `/admin/dashboard` = `admin` + `dashboard`.

**Rule written in the file:** every non-public route must have a guard, so signed-out visitors get redirected
to sign-in instead of seeing an empty screen. The unit test "guards every route except sign-in and sign-up" in
`mock-auth.guard.spec.ts` fails if a route is added without one.

**Admins and customers stay on their own side.** `mockAuthGuard` (the customer shell's guard) sends a signed-in
admin to `/admin/dashboard`, because an admin has no trading account or KYC. `mockAdminGuard` sends a signed-in
customer to `/dashboard`.

---

## Part 6: The shared layer, file by file

### 6.1 [shared/api/api-clients.ts](../Frontend/frontend-app/src/app/shared/api/api-clients.ts)

**Purpose:** the single place that knows the API base URLs and configures the generated OpenAPI clients.

- Exports `AUTH_API_BASE_URL` and `TRADE_API_BASE_URL` (read from `environment`). Every service and the
  interceptor imports these.
- `provideApiClients()` returns two providers:
  - `provideAuthApi({ basePath, credentials: { bearerAuth: readAccessToken }, withCredentials: true })`:
    configures the generated auth client (`AuthService`, `ProfileService`, `KYCService`). It adds
    `Authorization: Bearer <token>` itself, but only on operations the contract marks as secured (`/auth/me`,
    `/kyc`), never on register/login/refresh/logout. `withCredentials: true` lets the browser store and send the
    HttpOnly `refresh_token` cookie on these cross-origin calls.
  - `provideTradeApi(TRADE_API_BASE_URL)`: sets the base path for the generated trade client (`AccountsService`,
    `OrdersService`, `WatchlistsService`). Its bearer token is added by the interceptor.
- `readAccessToken` reads the in-memory `accessTokenStore` signal **on every request**, so a token obtained after
  login or a refresh is picked up without recreating anything. It never reads `localStorage`.

**Every backend call in the app now goes through these generated clients.** `MockAuthService`,
`MockKycService` and `TradeApiService` inject generated services instead of `HttpClient`, so a contract change
that breaks a caller fails the build.

#### [shared/services/access-token.store.ts](../Frontend/frontend-app/src/app/shared/services/access-token.store.ts)

`export const accessTokenStore = signal<string | null>(null);` That one line is the whole file: the access
token, **in memory only**. It's a module-level signal rather than a field of `MockAuthService` because two
readers need it: `MockAuthService`, which owns and writes it, and the `readAccessToken` callback above. That
callback is configured once with a plain function and can't inject a service.

### 6.2 [shared/interceptors/auth-token.interceptor.ts](../Frontend/frontend-app/src/app/shared/interceptors/auth-token.interceptor.ts)

**Purpose:** attach the JWT to the right requests and transparently renew an expired one.

Step by step for every HTTP request:

1. **`needsBearerToken(req.url)`** decides whether this request should carry a token:
   - any URL under `TRADE_API_BASE_URL/` → **yes**
   - any URL under `AUTH_API_BASE_URL/` → yes, **unless** it's one of `PUBLIC_AUTH_PATHS`
     (`/auth/login`, `/auth/admin/login`, `/auth/register`, `/auth/refresh`, `/auth/logout`)
   - any other origin → **no**. The token never leaks to third-party sites.
2. If no token is needed, or the user has no token, the request passes through untouched.
3. Otherwise the request is **cloned** with `Authorization: Bearer <token>` (requests are immutable, so it
   must be cloned) and sent. For `/auth/me` and `/kyc` the generated auth client has already set the same
   header; the interceptor overwrites it with the identical value.
4. **If the response is a 401** and `auth.getRefreshToken()` is non-null, the access token (short-lived,
   15 minutes) has probably expired. `getRefreshToken()` can't return the real refresh token any more (it's an
   HttpOnly cookie the page can't read). It returns a non-secret marker while signed in and `null` otherwise,
   which is exactly the "is a refresh worth trying?" check needed here. Then the interceptor:
   - calls `auth.refreshAccessToken()` (`POST /auth/refresh`, empty body, cookie attached by the browser),
   - on success, **retries the original request** with the new token (`switchMap`),
   - on failure, if the session is now cleared and the user isn't already on a sign-in page, navigates to
     `/login?returnUrl=<current page>`, then rethrows the original error.
5. Any other error is rethrown unchanged.

**Interview-worthy detail:** the refresh token is **single-use** (rotated on each refresh, and a used one is
refused). If the dashboard fires three requests and all get 401 at once, they must share **one** refresh call.
(The backend's "theft detected" branch never actually runs; see
[auth-service-guide.md](auth-service-guide.md), known issues.) `MockAuthService.refreshAccessToken()` handles that with `refreshInFlight` + `shareReplay(1)`.

### 6.3 Guards: [shared/guards/](../Frontend/frontend-app/src/app/shared/guards/)

Guards are functions of type `CanActivateFn`. They use `inject()` to get services and return `true` or a
`UrlTree` (a redirect). Returning a `UrlTree` rather than calling `router.navigate()` and returning `false` makes
the redirect part of the same navigation, so it can't be lost and leave a blank screen.

| Guard | File | Allows if | Otherwise redirects to |
|---|---|---|---|
| `mockAuthGuard` | [mock-auth.guard.ts](../Frontend/frontend-app/src/app/shared/guards/mock-auth.guard.ts) | `authService.isAuthenticated()` (an unexpired access token exists) **and** `!authService.isAdmin()` | signed out → `/login?returnUrl=<where you were going>`; signed-in admin → `/admin/dashboard` |
| `mockAdminGuard` | same file | signed in **and** `authService.isAdmin()` | signed out → `/admin-login?returnUrl=…`; signed in but not admin → `/dashboard` |
| `kycApprovalGuard` | [kyc-approval.guard.ts](../Frontend/frontend-app/src/app/shared/guards/kyc-approval.guard.ts) | `kycService.getCurrentUserKycStatus() === 'APPROVED'` | `/kyc-submission?returnUrl=…` |

**The role comes from the token, never from `localStorage`.** `isAdmin()` decodes the `roles` claim of the
in-memory access token (and returns nothing for an expired one). The `current_user` entry in `localStorage` is a
display cache: changing its `roles` to `["ADMIN"]` in DevTools no longer opens the admin screens or shows the admin
navigation, and the next reload overwrites it from `/auth/me`. `mock-auth.guard.spec.ts` has a test for exactly
that spoof.

**These guards are still a usability control, not a security control.** Anyone can edit the JavaScript, and
`kycApprovalGuard` still trusts the cached `kyc_status`. Real security is the backend checking the JWT on every API call. The comment in
`mock-auth.guard.ts` says this explicitly, and the `api-security.spec.ts` e2e test shows the Trade API refusing
a request with no token.

**[safe-return-url.ts](../Frontend/frontend-app/src/app/shared/guards/safe-return-url.ts)**, `safeReturnUrl(candidate, fallback)`:
validates the `?returnUrl=` value before the login screen navigates to it. Without this, an attacker could send
someone `https://our-site/login?returnUrl=https://evil.example`: the victim signs in on the real site and is
bounced to a look-alike. That's an **open redirect**. It accepts only same-origin paths:
- must start with exactly one `/` (rejects `//evil.example`, which is protocol-relative),
- no backslashes (browsers treat `\` like `/`),
- no control characters (tabs/newlines get stripped by URL parsers),
- finally resolves it with `new URL(candidate, origin)` and checks the origin is unchanged.

Returns `pathname + search + hash`, so `/orders/history?status=FILLED` keeps its query string.

### 6.4 Services: [shared/services/](../Frontend/frontend-app/src/app/shared/services/)

All are `providedIn: 'root'` singletons.

#### [mock-auth.service.ts](../Frontend/frontend-app/src/app/shared/services/mock-auth.service.ts): `MockAuthService`

**Purpose:** everything about the user session. Despite the name it talks to the **real** auth service. It used
to be an in-memory mock; the name was kept to avoid touching every file that injects it.

It calls the backend only through two **generated** clients: `authApi` (the generated `AuthService`, imported as
`AuthApi` to avoid the name clash) and `profileApi` (`ProfileService`). Both are configured with
`withCredentials`, so the HttpOnly refresh cookie is stored and sent.

State (signals):
- `accessToken` (private) = the shared `accessTokenStore` signal. **In memory only.** The constructor sets it to
  `null` and deletes the legacy `auth_token`/`refresh_token` keys from `localStorage`, so it stays `null` until
  login or `restoreSession()` fills it.
- `currentUser` (private) / `currentUser$` (public read-only), initialised from `localStorage['current_user']`
- `authenticated = computed(() => hasValidToken())`: a token is present and, if it is a JWT, its `exp` is in the
  future. (A computed signal only re-runs when the token changes, so this cached value doesn't notice expiry on
  its own; `isAuthenticated()` calls `hasValidToken()` directly instead. See Part 15, item 13.)

**Where the refresh token lives.** Login and refresh responses still carry `refreshToken` in the JSON body, but
the service **ignores it**. The auth service also sets it as an HttpOnly `refresh_token` cookie (`Path=/auth`,
`Secure`, `SameSite=Strict`), and that cookie is the only copy the browser keeps.

Methods:

| Method | Generated call → HTTP | What it does |
|---|---|---|
| `register(data)` | `authApi.register` → `POST /auth/register` | creates the user. Returns `{ id, username, roles }`, **no tokens**, so the user still has to sign in |
| `login(data, asAdmin)` | `authApi.login` / `authApi.loginAdmin` → `POST /auth/login` or `/auth/admin/login`, then `GET /auth/me` | keeps the access token in memory (the response also sets the refresh cookie), builds a user from the JWT claims immediately, then refines it from `/auth/me` (if `/auth/me` fails, the JWT-derived user is kept) |
| `loadCurrentUser()` | `profileApi.getCurrentUser` → `GET /auth/me` | `{ id, username, accountId, roles }` → saves to signal + localStorage |
| `refreshAccessToken()` | `authApi.refresh({})` → `POST /auth/refresh` | empty body; the browser sends the cookie and the backend rotates it. Emits the new access token. Shared among concurrent callers. On 401 it clears the session |
| `restoreSession()` | via `refreshAccessToken()`, then `loadCurrentUser()` | run once at startup by the app initializer (see [Part 4](#part-4-how-the-app-boots)). Refreshes only if a `current_user` is stored, then reloads the user from `/auth/me` so the cache can't stay spoofed. **Never errors** |
| `logout()` | `authApi.logout({})` → `POST /auth/logout` | **always** calls the backend (the page can't tell whether a cookie exists, and only the server can revoke and clear it), then clears the session (`finalize`), even if the call fails |
| `getCurrentUser()` | none | the cached user, **for display only**; never used for an access decision |
| `isAuthenticated()` | none | `hasValidToken()`: an access token exists and is not expired |
| `getToken()` | none | the in-memory access token |
| `getRefreshToken()` | none | a non-secret marker (`'httponly-cookie'`) while signed in, else `null`. The real token is unreadable |
| `decodeToken(token)` | none | decodes the JWT payload (base64url → JSON). **Does not verify** the signature; that's the server's job |
| `getRolesFromToken()`, `isAdmin()` | none | roles from the in-memory JWT payload (`[]` when signed out or the token has expired); `isAdmin()` compares case-insensitively. The only role source the guards and the shell trust |
| `rethrowServerError(err)` (private) | none | converts `HttpErrorResponse` into a plain `{ errorCode, message, status }` (`AuthError`) |
| `storeTokens(tokens)` (private) | none | sets the in-memory access token only. Nothing is written to storage |
| `clearSession()` (private) | none | removes `current_user` and `kyc_status` from localStorage and resets the signals (including the access token) |

**A JWT** has three base64url parts, `header.payload.signature`. The payload here has `sub` (user id),
`accountId`, `roles`, `iat`/`exp` (issued/expiry time), `iss` (issuer). See `TokenPayload` in
[auth.models.ts](../Frontend/frontend-app/src/app/shared/models/auth.models.ts).

#### [mock-kyc.service.ts](../Frontend/frontend-app/src/app/shared/services/mock-kyc.service.ts): `MockKycService`

**Purpose:** KYC (Know Your Customer, i.e. identity verification). Also "Mock" by name only: it calls the real
backend.

State: `kycStatus` signal (`'PENDING' | 'APPROVED' | 'REJECTED' | null`), initialised from
`localStorage['kyc_status']`. **This cached value is what `kycApprovalGuard` reads**, synchronously.

Every call goes through the generated `KYCService` (`kycApi`). All `/kyc` operations are secured in the
contract, so the generated client attaches the bearer token (and so does the interceptor).

| Method | Generated call → HTTP | What it does |
|---|---|---|
| `submitKyc(userId, data)` | `getMyKyc` then `updateMyKyc`; if the GET returns 404, `submitKyc` → `GET /kyc` then `PUT /kyc`, or `POST /kyc` | create-or-update: first submission is a POST, later edits are a PUT. The payload is typed as the generated `CreateKycRequest`. Updates the status signal + localStorage |
| `getKycStatus(userId)` | `getMyKyc` → `GET /kyc` | the current user's submission (the backend knows who from the JWT). 404 → `null` (never submitted) and clears the cache |
| `getCurrentUserKyc()` | via `getKycStatus` | convenience; `of(null)` if no user |
| `getPendingKycSubmissions()` | `getPendingKyc` → `GET /kyc/pending` | **admin**: all pending submissions |
| `reviewKyc(userId, approved, reason?)` | `reviewKyc` → `PATCH /kyc` with `{ userId, status, rejectionReason }` | **admin**: approve or reject |
| `getCurrentUserKycStatus()` | none | synchronous read of the cached status (used by the guard and dashboard) |
| `toKycSubmission()` (private) | none | maps the contract's `KycResponse` (numeric id, ISO strings, nullable fields) into the UI's `KycSubmission` (string id, `Date`s, `undefined`s) |

#### [trade-api.service.ts](../Frontend/frontend-app/src/app/shared/services/trade-api.service.ts): `TradeApiService`

**Purpose:** a thin wrapper over every Trade REST API endpoint. **Every call goes through a generated service**
(`AccountsService`, `OrdersService`, `WatchlistsService`), and the return types are the generated models, so a
contract change that breaks a caller fails the build. Every method pipes errors through `rethrowServerError`,
which produces a `TradeApiError { errorCode, message, status }`. The bearer token is added by the interceptor.

| Method | Generated call | HTTP |
|---|---|---|
| `getAccount()` | `accounts.getMyAccount()` | `GET /api/v1/accounts/me` |
| `getBalance()` | `accounts.getMyBalance()` | `GET /api/v1/accounts/me/balance` |
| `getPositions()` | `accounts.getMyPositions()` | `GET /api/v1/accounts/me/positions` |
| `getOrders(filter)` | `accounts.getMyOrders(status, from, to)` | `GET /api/v1/accounts/me/orders?status=&from=&to=` |
| `updateBalance({ cashBalance })` | `accounts.updateMyBalance(request)` | `PATCH /api/v1/accounts/me/balance` (sets the **new absolute** balance) |
| `placeOrder(order)` | `orders.placeOrder(order)` | `POST /api/v1/orders` |
| `getWatchlists()` / `createWatchlist(name)` | `watchlists.getWatchlists()` / `createWatchlist({ name })` | `GET` / `POST /api/v1/watchlists` |
| `getWatchlistDetail(id)` / `deleteWatchlist(id)` | `watchlists.getWatchlist(Number(id))` / `deleteWatchlist(Number(id))` | `GET` / `DELETE /api/v1/watchlists/{id}` |
| `addWatchlistInstrument(id, symbol)` | `watchlists.addWatchlistInstrument(Number(id), { symbol })` | `POST /api/v1/watchlists/{id}/instruments` |
| `removeWatchlistInstrument(id, symbol)` | `watchlists.removeWatchlistInstrument(Number(id), symbol)` | `DELETE /api/v1/watchlists/{id}/instruments/{symbol}` |
| `searchInstruments(query)` | `watchlists.searchInstruments(query)` | `GET /api/v1/instruments?search=` |

Details worth knowing:
- **`getOrders`** turns unset filters into `undefined`, which the generated client leaves out of the query
  string. `from`/`to` are converted to ISO strings and **encoded once** by the client (`:` → `%3A`, never
  `%253A`); the Trade API decodes them back to the same instant.
- **Watchlist ids** are numeric in the contract, so `Number(id)` converts the UI's `string | number` id.
- **`removeWatchlistInstrument`** passes the raw symbol; the generated client encodes it into the path itself.
- **The two `DELETE`s** `map(() => undefined)` so callers still get `Observable<void>`.
- The watchlist methods return the generated `WatchlistResponse`, `WatchlistDetailResponse`,
  `WatchlistStockResponse` and `InstrumentResponse`. `WatchlistService` converts them into the UI's
  `Watchlist`/`WatchlistStock` shapes (its `toStock()` maps the backend's `name` to `companyName`).

Note the `/me` URLs: the account is identified **from the JWT on the server**, never from an ID the browser
sends. A user can't read someone else's account by changing a number in the URL.

#### [watchlist.service.ts](../Frontend/frontend-app/src/app/shared/services/watchlist.service.ts): `WatchlistService`

**Purpose:** the watchlist feature's **state store and business rules**. Unlike the other services it keeps
state that the component reads directly.

Constants: `MAX_WATCHLISTS = 20`, `MAX_WATCHLIST_NAME_LENGTH = 60`, `DEFAULT_WATCHLIST_NAME = 'Default'`.

Signals:
- `lists` → public `watchlists`: all lists, default first
- `selectedId` → public `selectedListId`
- `selected = computed(...)`: the selected list (falls back to the default)
- `stocks` → public `selectedStocks`: live-priced stocks of the selected list
- `catalog`: all instruments (used for search)
- `loading` → public `isLoading`

Methods: `load()`, `select(id)`, `createWatchlist(name)`, `deleteWatchlist(id)`, `addToSelected(symbol)`,
`removeFromSelected(symbol)`, `isInSelected(symbol)`, `search(query)` (synchronous filter over `catalog`),
`quote(symbol)`. Details in [Flow 11](#flow-11-watchlist).

Validation done **client-side before** calling the backend: name required, ≤ 60 chars, unique
(case-insensitive), at most 20 lists, default list not deletable, no duplicate symbols.

#### [error-mapping.service.ts](../Frontend/frontend-app/src/app/shared/services/error-mapping.service.ts): `ErrorMappingService`

**Purpose:** turn backend error codes into friendly sentences. See [Part 10](#part-10-error-handling-pipeline).

#### [theme.service.ts](../Frontend/frontend-app/src/app/shared/services/theme.service.ts): `ThemeService`

**Purpose:** light/dark theme. Until the user chooses, CSS follows the OS setting (`prefers-color-scheme`).
`toggle()` sets `<html data-theme="dark|light">` and saves `localStorage['tp_theme']`. The localStorage access
is wrapped in try/catch because storage can be unavailable in private mode.

#### [market-data.service.ts](../Frontend/frontend-app/src/app/shared/services/market-data.service.ts): `MarketDataService`

A hard-coded catalog of 12 stocks with reference prices. **Nothing in the app injects it anymore.** The
watchlist now gets instruments and prices from the backend (`/api/v1/instruments`, `/api/v1/watchlists/{id}`).
Nothing uses it, and its spec was removed. It's leftover code.

### 6.5 Models: [shared/models/](../Frontend/frontend-app/src/app/shared/models/)

TypeScript interfaces/types. They don't exist at runtime; they only give compile-time safety.

| File | Key types | Notes |
|---|---|---|
| [auth.models.ts](../Frontend/frontend-app/src/app/shared/models/auth.models.ts) | `User`, `TokenResponse`, `AuthResponse`, `RegisterRequest`, `LoginRequest`, `TokenPayload`, `ErrorResponse`, `AuthError` | `UserResponseData` is an alias of the generated `UserResponse` |
| [kyc.models.ts](../Frontend/frontend-app/src/app/shared/models/kyc.models.ts) | `KycStatus` (alias of generated), `KycSubmission` (UI view model), `KycRequest`, `KycReviewRequest` | |
| [order.models.ts](../Frontend/frontend-app/src/app/shared/models/order.models.ts) | `Order`, `OrderStatus`, `OrderSide`, `PlaceOrderRequest`, `PlaceOrderResponse`, `Account`, `Balance`, `Position`, `BalanceUpdateRequest`, `OrderHistoryFilter`, `TradeApiError` | **all wire types are aliases of the generated trade models** |
| [watchlist.models.ts](../Frontend/frontend-app/src/app/shared/models/watchlist.models.ts) | `Watchlist`, `WatchlistStock`, `WatchlistDetail`, `AddStockResult` | hand-written **UI** shapes used by `WatchlistService` (e.g. `companyName` instead of the backend's `name`). The wire types are the generated `Watchlist*Response`/`InstrumentResponse` models that `TradeApiService` returns |

**Why aliases?** `export type Order = OrderHistoryEntry;` means that if the YAML contract changes and the
client is regenerated, any component using a removed or renamed field **fails to compile**. Contract drift is
caught at build time instead of in production.

### 6.6 [shared/layout/app-shell.component.ts](../Frontend/frontend-app/src/app/shared/layout/app-shell.component.ts): `AppShellComponent`

**Purpose:** the frame around every signed-in page.

- **Sidebar nav.** It picks `ADMIN_NAV` (Overview, KYC review) or `CUSTOMER_NAV` (Dashboard, Watchlist, Funds,
  Place order, Orders, Verification) based on `authService.isAdmin()`, i.e. the token's roles, not the cached
  user. Uses `routerLink`
  and `routerLinkActive="is-active"`, plus `ariaCurrentWhenActive="page"` for screen readers.
- **Top bar.** Avatar initial, username, role label ("Administrator" / "Account 6" / "Customer"), theme toggle
  button, Sign out button.
- **`<main id="main">` contains `<router-outlet />`**, where the child page renders.
- **"Skip to main content"** button: keyboard users can jump past the nav (`focusMain()`).
- **`signOut()`** calls `authService.logout()` and navigates to `/login`.
- Everything is `computed` from `authService.currentUser$`, so it updates automatically when the user changes.
- Its CSS lives in `styles.css` under "App shell" (`sh-*` classes), because of the 4 kB component-style budget.

### 6.7 [shared/ui/status-badge.component.ts](../Frontend/frontend-app/src/app/shared/ui/status-badge.component.ts): `StatusBadgeComponent`

**Purpose:** a reusable pill such as `<app-status-badge [status]="order.status" />`.
- `status = input.required<string>()`
- `tone`: FILLED/APPROVED/ACTIVE → positive (green); PENDING/PARTIALLY_FILLED → warning; REJECTED/SUSPENDED/CLOSED
  → negative; anything else → neutral.
- `label`: `PARTIALLY_FILLED` → "Partially filled". Words are shown, so **colour is never the only cue**
  (accessibility).
- Uses `host: { class: 'tp-badge', '[class.tp-badge-positive]': ... }` to put classes on the
  `<app-status-badge>` element itself.

Used by: dashboard, KYC form, place order, view orders, admin dashboard, KYC review.

### 6.8 Auth shell components: [features/auth/auth-shell/](../Frontend/frontend-app/src/app/features/auth/auth-shell/)

- **`AuthShellComponent`** (`<app-auth-shell [heading] [subtitle]>`): the frame for login and register pages:
  brand logo, a card with an `<h1>`, and `<ng-content />` where the form goes. On wide screens (≥ 60rem) it adds
  the showcase panel on the right. `focusHeading()` lets the register page move focus to the heading after the
  success message replaces the form.
- **`AuthShowcaseComponent`**: purely decorative marketing text plus an SVG chart. Marked `aria-hidden`.

### 6.9 Generated clients: [src/generated/](../Frontend/frontend-app/src/generated/)

Produced by `npm run generate:clients` from the YAML contracts. **Never edit by hand**, and never import them from
components. Each folder contains:
- `api/*.service.ts`: Angular services (`AuthService`, `KYCService`, `ProfileService`; `AccountsService`,
  `OrdersService`, `WatchlistsService`) with one method per endpoint. **All of them are used at runtime**: the
  wrappers in `shared/services/` call nothing else
- `model/*.ts`: request/response interfaces and enums (`OrderStatus`, `KycStatus`, `WatchlistResponse`, …).
  `RefreshRequest.refreshToken` is **optional**: browsers send `{}` and rely on the cookie
- `provide-api.ts`: `provideApi(...)` used in `api-clients.ts`
- `configuration.ts`, `variables.ts` (`BASE_PATH` token), `encoder.ts`, `param.ts`, etc.: plumbing

Enums are generated as `const` objects + union types, e.g.:
```ts
export const OrderStatus = { NEW: 'NEW', FILLED: 'FILLED', REJECTED: 'REJECTED', CANCELLED: 'CANCELLED' } as const;
export type OrderStatus = typeof OrderStatus[keyof typeof OrderStatus];   // 'NEW' | 'FILLED' | ...
```

---

## Part 7: The feature screens, file by file

A quick reference here; the flows in Part 8 show them in action.

| Component | Route | Injects | Loads on init | Main user actions |
|---|---|---|---|---|
| `LoginComponent` | `/login`, `/admin-login` | MockAuthService, MockKycService, ErrorMappingService, Router, ActivatedRoute | none | submit login; show/hide password |
| `RegisterComponent` | `/register` | MockAuthService, ErrorMappingService | none | submit registration |
| `KycFormComponent` | `/kyc-submission` | MockKycService, MockAuthService, ErrorMappingService, Router | `GET /kyc` (pre-fills the form) | submit/update KYC; go to dashboard |
| `DashboardComponent` | `/dashboard` | MockAuthService, MockKycService, TradeApiService, ErrorMappingService | `forkJoin` of account + balance + positions | links to orders |
| `FundsComponent` | `/funds` | MockAuthService, TradeApiService, ErrorMappingService | `GET balance` | deposit, withdraw |
| `PlaceOrderComponent` | `/orders/new` | MockAuthService, TradeApiService, ErrorMappingService, ActivatedRoute | reads `?symbol=` | place order; place another |
| `ViewOrdersComponent` | `/orders/history` | TradeApiService, ErrorMappingService | `GET orders` (+ polling) | filter by status; refresh |
| `WatchlistComponent` | `/watchlist` | WatchlistService | `service.load()` | switch/create/delete lists; search; add/remove stock; click to trade |
| `AdminDashboardComponent` | `/admin/dashboard` | MockAuthService, MockKycService | `GET /kyc/pending` | link to review |
| `KycReviewListComponent` | `/admin/kyc-review` | MockKycService | `GET /kyc/pending` | approve, reject (with reason), refresh |

**Patterns repeated in nearly every screen** (learn them once):
- `isLoading` signal plus a guard at the top of submit handlers (`if (this.isLoading()) return;`) prevents
  double-submit. Buttons use `aria-disabled` instead of `disabled` so they stay focusable.
- `errorMessage` signal plus `@if (errorMessage(); as message) { <div class="tp-alert tp-alert-error" role="alert"> }`.
- The `submitted` signal plus `touched` control when validation messages appear.
- `.pipe(takeUntilDestroyed(this.destroyRef))` on every subscription.
- `data-testid="..."` attributes on everything Playwright needs to find.

---

## Part 8: User flows end to end

Each flow is a scenario. Follow the numbered steps and open the linked files as you go.

### Flow 1: First visit

**Scenario:** someone types `http://localhost:4200/` into the browser.

1. [main.ts](../Frontend/frontend-app/src/main.ts) bootstraps → [app.config.ts](../Frontend/frontend-app/src/app/app.config.ts) providers → [AppComponent](../Frontend/frontend-app/src/app/app.component.ts)
   renders `<router-outlet />` and creates `ThemeService`, which applies any saved theme. Before that, the app
   initializer runs `restoreSession()`. A first-time visitor has no stored `current_user`, so it sends nothing.
2. [app.routes.ts](../Frontend/frontend-app/src/app/app.routes.ts): `''` redirects to `/login`.
3. `/login` has no guard. The router lazy-loads [login.component.ts](../Frontend/frontend-app/src/app/features/auth/login/login.component.ts).
4. `LoginComponent` renders inside `<app-auth-shell>` ([auth-shell.component.ts](../Frontend/frontend-app/src/app/features/auth/auth-shell/auth-shell.component.ts)),
   which projects the form through `<ng-content />` and shows `AuthShowcaseComponent` on wide screens.
5. `isAdminLogin` = `route.snapshot.data['isAdmin'] === true` → `false`, so the heading is "Welcome back".

An unknown URL like `/nope` hits `{ path: '**', redirectTo: '/login' }`.

---

### Flow 2: Register a new account

**Scenario:** a new customer clicks "Create one" and fills in the form.

1. `routerLink="/register"` → [register.component.ts](../Frontend/frontend-app/src/app/features/auth/register/register.component.ts) loads.
2. **The form** (`NonNullableFormBuilder.group`) mirrors the backend rules:
   - username: required, 3–64 chars, `^[a-zA-Z0-9._-]+$`
   - email: required, valid email, ≤ 254
   - first/last name: required, ≤ 80
   - phone: required, `^\+?[1-9]\d{7,14}$` (international format)
   - password: required, 12–128 chars
   - confirmPassword: required + custom validator `matchesPassword`, which compares with
     `control.parent.get('password')`
3. **Constructor:** subscribes to `password.valueChanges` and re-validates `confirmPassword`, so changing the
   password after confirming it correctly flags a mismatch.
4. The user types; errors appear only after a field is touched or after submit (`usernameError()`, etc.). The
   password hint turns "met" once it's 12+ chars (`passwordLongEnough()`).
5. **Submit → `onSubmit()`:**
   - ignore if already loading; `submitted.set(true)`; clear `errorMessage`
   - if the form is invalid, focus the first `input.ng-invalid` and stop (**nothing is sent**)
   - `isLoading.set(true)`; take the values **without** `confirmPassword` (it's frontend-only)
   - `authService.register({...})` → [mock-auth.service.ts](../Frontend/frontend-app/src/app/shared/services/mock-auth.service.ts) `register()`
     → `POST {AUTH_API}/auth/register`
6. **Interceptor:** `/auth/register` is in `PUBLIC_AUTH_PATHS`, so no token is added.
7. **Success:** the backend returns `{ id, username, roles }` with **no tokens**. The component sets
   `registeredUsername`, which:
   - switches the template to the success panel ("The account X is ready…" plus a "Continue to sign in" link),
   - flips the `heading` computed to "Account created",
   - after the DOM updates (`afterNextRender`), focuses the heading via `shell().focusHeading()` so screen
     readers announce the change.
8. **Failure `AUTH-409` (username taken):** `username.setErrors({ taken: true })`. The message shows **on the
   field** (from `ErrorMappingService`) and the field is focused. Editing the username re-runs validators,
   which clears `taken`.
9. **Other failures:** status 0 → network message; `VAL-422` → "Those details were not accepted…"; else the
   mapped message.

**Behind the scenes (backend):** the trading account is created **asynchronously** (a `USER_REGISTERED` Kafka
event). Until it exists, sign-in can be refused, which is why the e2e helper `waitUntilCanSignIn` retries.

---

### Flow 3: Customer signs in

**Scenario:** an existing, KYC-approved customer signs in at `/login`.

1. [login.component.ts](../Frontend/frontend-app/src/app/features/auth/login/login.component.ts) `onSubmit()`: same validation pattern
   (username required ≤ 64, password required ≤ 128).
2. `authService.login(form.getRawValue(), isAdminLogin=false)` in
   [mock-auth.service.ts](../Frontend/frontend-app/src/app/shared/services/mock-auth.service.ts):
   1. `authApi.login(...)` → `POST /auth/login` with `{ username, password }` (public: no token). The generated
      auth client sends it `withCredentials`.
   2. Response body: `{ accessToken, refreshToken, tokenType, expiresIn }`, **plus** a
      `Set-Cookie: refresh_token=…; HttpOnly; Secure; SameSite=Strict; Path=/auth` header. The browser stores
      the cookie; page scripts can't see it.
   3. `tap`: **`storeTokens`** puts the access token into the in-memory `accessTokenStore` signal (nothing is
      written to storage, and the body's `refreshToken` is ignored), so `authenticated()` becomes true.
      **`setCurrentUser(userFromToken(...))`** decodes the JWT payload to get `sub`, `accountId` and `roles`
      immediately.
   4. `switchMap` → `loadCurrentUser()` → `profileApi.getCurrentUser()` → `GET /auth/me`. This **is** protected,
      so the generated client and the interceptor both set `Authorization: Bearer <new token>`. The result `{ id, username, accountId, roles }` replaces the user.
      If `/auth/me` fails, the JWT-derived user is kept (`catchError` → `of(user)`).
   5. Emits `{ ...tokens, user }`.
3. Back in the component, `next` → `enterApplication()`:
   - **Admin?** (`authService.isAdmin()` reads roles from the JWT) → `/admin/dashboard`.
   - No user? → `/kyc-submission`.
   - Otherwise **always re-read KYC from the backend** with `kycService.getKycStatus(user.id)` → `GET /kyc`.
     This also updates the cached `kyc_status`, so one user's cached status never leaks into another user's
     session on a shared browser.
     - `APPROVED` → `router.navigateByUrl(returnUrl('/dashboard'))`. The `returnUrl` goes through
       `safeReturnUrl` (see Flow 4).
     - PENDING, REJECTED, `null` (never submitted) or error → `/kyc-submission`.
4. Navigating to `/dashboard` runs the guards:
   - `mockAuthGuard` → `isAuthenticated()` → true ✔
   - `kycApprovalGuard` → `getCurrentUserKycStatus()` → `'APPROVED'` (just cached) ✔
5. `AppShellComponent` renders with `CUSTOMER_NAV`; `DashboardComponent` renders inside it (Flow 7).

**Wrong password:** the backend returns 401 `AUTH-401`. `rethrowServerError` → `{ errorCode: 'AUTH-401', status: 401 }`.
`messageFor()` shows "Incorrect username or password…" and focuses the password field. The message is
**deliberately identical for an unknown username and a wrong password**, so attackers can't discover which
usernames exist (username enumeration). The e2e test `login.spec.ts` checks this. Five failures lock the
account; that is covered by the auth service's `ThrottleService` unit tests, not by Playwright.

> **Why doesn't the 401 from `/auth/login` trigger a token refresh?** Because `/auth/login` is in
> `PUBLIC_AUTH_PATHS`: the interceptor passes it straight through and never enters the 401 handling.

---

### Flow 4: Deep link while signed out (guards + returnUrl)

**Scenario:** a signed-out user opens a bookmark to `/orders/history?status=FILLED`.

1. The router matches the shell route → parent `canActivate: [mockAuthGuard]`.
2. [mock-auth.guard.ts](../Frontend/frontend-app/src/app/shared/guards/mock-auth.guard.ts): not authenticated → returns
   `router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } })`.
   The URL becomes `/login?returnUrl=%2Forders%2Fhistory%3Fstatus%3DFILLED`.
3. The user signs in (Flow 3). When KYC is approved, `returnUrl('/dashboard')` calls
   `safeReturnUrl(route.snapshot.queryParams['returnUrl'], '/dashboard')` in
   [safe-return-url.ts](../Frontend/frontend-app/src/app/shared/guards/safe-return-url.ts) → `/orders/history?status=FILLED` passes all
   checks.
4. `navigateByUrl('/orders/history?status=FILLED')`, so the user lands where they meant to go.

**If the link was malicious**, e.g. `returnUrl=//evil.example` or `https://evil.example`, `safeReturnUrl`
returns the fallback `/dashboard`.

**Signed in but KYC not approved, opening `/funds`:** `kycApprovalGuard` returns a redirect to
`/kyc-submission?returnUrl=/funds`.

**Signed-in customer opening `/admin/kyc-review`:** `mockAdminGuard` sees no `ADMIN` role → redirect to
`/dashboard`. **Signed-out visitor to an admin page** → `/admin-login?returnUrl=…`.

**Signed-in admin opening `/orders/new` (or any customer screen, `/kyc-submission` included):** `mockAuthGuard`
sees the `ADMIN` role → redirect to `/admin/dashboard`. Before this rule an admin fell through to
`kycApprovalGuard` and landed on the KYC form, which the auth service would refuse with `AUTH-403`.

The e2e tests in `session.spec.ts`, `admin.spec.ts` and `kyc.spec.ts` visit every protected route for each of
these cases.

---

### Flow 5: Submit KYC (identity verification)

**Scenario:** a new customer signs in for the first time and lands on `/kyc-submission`.

1. Route `/kyc-submission` only needs `mockAuthGuard` (from the shell parent). **No KYC guard**, otherwise
   you could never reach the page that fixes your KYC.
2. [kyc-form.component.ts](../Frontend/frontend-app/src/app/features/auth/kyc/kyc-form.component.ts) `ngOnInit()` →
   `kycService.getCurrentUserKyc()` → `GET /kyc` (bearer added by the interceptor).
   - **404** → `null`: first-time user. The form is empty; "Submit for review".
   - **found** → `existingKyc` is set, which turns on `isUpdateMode()`; the form is pre-filled with
     `patchValue`; a status badge shows; a "You already have a submitted KYC" info box appears; the button says
     "Update submission". If REJECTED, the rejection reason shows in a red alert.
3. The **"How it works"** stepper is driven by computeds:
   - step 1 done = a submission exists
   - step 2 "waiting" = PENDING; done = APPROVED
   - step 3 done = APPROVED; rejected = REJECTED
4. The user fills date of birth, document type (`PASSPORT`, `AADHAR`, `DRIVER_LICENSE`, `PAN`) and document
   number (all required) → `onSubmit()`.
5. `kycService.submitKyc(user.id, values)` in [mock-kyc.service.ts](../Frontend/frontend-app/src/app/shared/services/mock-kyc.service.ts):
   ```
   GET /kyc ──found──► PUT /kyc  (update)
        └──404──────► POST /kyc (create)
   ```
   then maps the response, caches `status` (normally `PENDING`) in the signal + `localStorage['kyc_status']`.
6. Success: `justSubmitted` = true ("Your KYC details were updated."), the badge shows "Pending".
7. "Go to dashboard" → `/dashboard` → `kycApprovalGuard` sees `PENDING` → **bounces back** to `/kyc-submission`.
   The customer must wait for an admin (Flow 6).

---

### Flow 6: Admin reviews KYC, then the customer can trade

**Scenario:** an admin approves the customer from Flow 5.

1. The admin goes to `/admin-login` (link at the bottom of the login page). The same `LoginComponent` loads, but
   the route has `data: { isAdmin: true }`, so `isAdminLogin` = true: the heading becomes "Admin sign in" and
   `login(..., true)` posts to **`/auth/admin/login`**. (Customer credentials are refused there; admin
   credentials are refused on `/auth/login`. The backend treats them as separate endpoints.)
2. `enterApplication()` → `isAdmin()` → `/admin/dashboard`.
3. Guards: `mockAdminGuard` → authenticated and `isAdmin()` (the token's roles) ✔. The shell shows `ADMIN_NAV` and
   the role label "Administrator".
4. [admin-dashboard.component.ts](../Frontend/frontend-app/src/app/features/admin/admin-dashboard.component.ts) `ngOnInit` →
   `getPendingKycSubmissions()` → `GET /kyc/pending` → shows the count and a preview table.
5. "Open KYC review" → [kyc-review-list.component.ts](../Frontend/frontend-app/src/app/features/admin/kyc-review/kyc-review-list.component.ts):
   - lists each pending submission as a panel (user ID, document type/number, DOB)
   - the optional rejection reason `<textarea>` per submission is stored in the plain object `rejectionReasons[kyc.id]`
   - **Approve** → `review(kyc, true)` → `reviewKyc(userId, true)` → `PATCH /kyc { userId, status: 'APPROVED' }`
   - **Reject** → `review(kyc, false, reason || 'No reason provided')` → `PATCH /kyc { userId, status: 'REJECTED', rejectionReason }`
   - `processingId` prevents double-clicks (`isProcessing` computed); after success the list reloads, and a
     screen-reader-only status message announces "Submission N approved."
6. **The customer side:** the customer's cached `kyc_status` is still `PENDING` in their browser. It refreshes
   when they **sign in again** (Flow 3 re-reads `GET /kyc`) or **open `/kyc-submission`** (its `ngOnInit` calls
   `GET /kyc`, updating the cache). After that, `kycApprovalGuard` lets them into the trading pages. The e2e
   test "approving lets the customer trade" covers this.

---

### Flow 7: Dashboard loads (parallel requests and the interceptor)

**Scenario:** an approved customer lands on `/dashboard`.

1. [dashboard.component.ts](../Frontend/frontend-app/src/app/features/dashboard/dashboard.component.ts) `ngOnInit`:
   - `kycStatus` ← cached status (for the "Verification" badge)
   - `loadAccountSummary()`
2. `forkJoin({ account: getAccount(), balance: getBalance(), positions: getPositions() })` fires **three
   parallel requests** to the Trade API (`/accounts/me`, `/accounts/me/balance`, `/accounts/me/positions`).
3. For each request the interceptor sees `TRADE_API_BASE_URL/...` and adds the bearer token.
4. When all three succeed:
   - holdings = Σ `position.marketValue ?? quantity × averageCost` (uses the live price when the backend has
     seen a quote, otherwise cost)
   - `summary` = `{ cash, holdings, total: cash + holdings, currency, asOf }`
   - the template renders three stat tiles, a positions table and an account panel (holder, account ID,
     account status badge, KYC badge, user ID).
5. If **any** of the three fails, `forkJoin` errors: network → "Unable to connect…", otherwise the mapped code
   (e.g. `ACC-404`).
6. **If the token had expired:** all three get 401 at once. The interceptor calls `refreshAccessToken()` three
   times, but `refreshInFlight ??= ...` + `shareReplay(1)` means **one** `POST /auth/refresh`; all three
   requests retry with the new token. The e2e test "concurrent 401s share a single refresh call" checks this.

---

### Flow 8: Deposit and withdraw funds

**Scenario:** the customer deposits $500, then tries to withdraw more than they have.

1. [funds.component.ts](../Frontend/frontend-app/src/app/features/funds/funds.component.ts) `ngOnInit` → `GET /accounts/me/balance` →
   sets `balance`, `currency`, `asOf`.
2. The user types `500` → **Deposit** (the form's submit) → `onDeposit()` → `updateBalance('deposit')`:
   - `validMoney(amount)`: must be > 0 with ≤ 2 decimals, otherwise focus `#amount`
   - computes `updatedBalance = current + 500` **in the browser**
   - `PATCH /accounts/me/balance { cashBalance: <new total> }`, which sends the **new absolute balance**, not the
     delta
   - success: update the balance display, "Funds deposited successfully.", reset the form
3. **Withdraw** (a `type="button"` with `(click)`) → `updateBalance('withdraw')` → `current - amount`. If the
   result would be < 0: "Withdrawal amount exceeds your available cash balance." **and no request is sent**.

See [Part 15](#part-15-known-quirks-and-technical-debt) for two caveats (the absolute-balance PATCH and the
"Balance after action" preview).

---

### Flow 9: Place an order

**Scenario:** the customer buys 10 AAPL at a $224.12 limit.

1. `/orders/new` → [place-order.component.ts](../Frontend/frontend-app/src/app/features/orders/place-order/place-order.component.ts).
2. **`ngOnInit`** subscribes to `route.queryParamMap`. If the URL has `?symbol=aapl` (e.g. clicked from the
   watchlist), it fills the symbol as `AAPL`, **but only if the control is still pristine**, so the user's
   own typing always wins.
3. **The form:**
   - side: required (`BUY` / `SELL` radio buttons drawn as a segmented control)
   - symbol: required, ≤ 10 chars (shown uppercase via CSS; uppercased again when sent)
   - quantity: required, `wholeNumber`, `positive`
   - price: required, `positive`, `twoDecimals`
4. **Live summary panel:** `values = toSignal(form.valueChanges, …)` turns form changes into a signal, which
   drives the computeds `summarySymbol`, `estimate` (qty × price) and `submitLabel` ("Place buy order"). The
   account ID comes from `currentUser$().accountId` and is shown **read-only** (a `<dd>`, not an input).
5. **Submit → `onPlaceOrder()`:**
   - invalid → focus the first invalid input, **no request**
   - `accountId` is 0 (account not provisioned yet / token from before provisioning) → `ACC-404` message
   - **idempotency key:** `crypto.randomUUID()` is created once per logical order and stored in
     `this.idempotencyKey`
   - `TradeApiService.placeOrder({ accountId, symbol, side, quantity, price, idempotencyKey })` → generated
     `OrdersService.placeOrder` → `POST /api/v1/orders` (interceptor adds the bearer)
6. **Success:** the key is cleared; `placedOrder` is set, so the template swaps to "Order submitted" with Order
   ID + status badge (usually `NEW`); focus moves to that heading (`afterNextRender`). The buttons are "View
   orders" and "Place another order" (`resetForm()`).
7. **Errors:**
   - **status 0 (network):** the order **may or may not** have reached the server. The key is **kept**, so
     pressing submit again resends the **same** key and the server deduplicates it (no double order).
   - **Any server answer** (`INS-404` unknown symbol, `ORD-400` not enough cash, `ORD-409` not enough holdings or a
     duplicate key): the attempt is settled, the key is cleared, and the mapped message is shown. A corrected
     resubmission is a new order.

**Idempotency in one sentence:** retrying the same request has the same effect as sending it once. The DB
enforces it with a unique constraint on `orders.idempotency_key` (see the generated `PlaceOrderRequest` docs).

---

### Flow 10: Order history (blotter) with filter and auto-polling

**Scenario:** after placing an order, the customer opens "Orders".

1. [view-orders.component.ts](../Frontend/frontend-app/src/app/features/orders/view-orders/view-orders.component.ts):
   - **constructor:** `statusFilter.valueChanges` → `loadOrders()` (changing the filter reloads);
     `destroyRef.onDestroy(() => stopPolling())`
   - **`ngOnInit`** → `loadOrders()`
2. `loadOrders()` → `getOrders({ status })` → `GET /accounts/me/orders?status=FILLED` (or no param for "All").
   The orders are sorted newest first by `createdOn`.
3. **Polling:** `updatePolling(orders)`:
   - if **any order is `NEW`** (waiting for the executor to fill/reject), start
     `setInterval(poll, 5000)` (`POLL_INTERVAL_MS`)
   - each tick calls `loadOrders(true)`: a "background" load that doesn't toggle the loading UI, so nothing
     flickers
   - stops when no order is NEW, when the list errors, after **5 minutes** (`POLL_MAX_DURATION_MS`), or when
     the component is destroyed (the user navigates away)
   - **only the GET is repeated, never the order POST**
4. Template: count ("3 orders"), segmented radio filter (All/New/Filled/Rejected/Cancelled), table with Order
   ID, created date, symbol, side (green Buy / red Sell), quantity, limit price, fill price (`executedPrice`, or
   "—"), status badge, plus a `<details>` "What do the statuses mean?" guide.
5. The Refresh button calls `refreshOrders()`, which is ignored while a load is in flight.

---

### Flow 11: Watchlist

**Scenario:** the customer creates "Tech", adds NVDA, then clicks it to trade.

1. [watchlist.component.ts](../Frontend/frontend-app/src/app/features/watchlist/watchlist.component.ts) `ngOnInit` →
   [watchlist.service.ts](../Frontend/frontend-app/src/app/shared/services/watchlist.service.ts) `load()`:
   - `GET /api/v1/watchlists` (the backend creates the Default list if missing)
   - `normalizeLists`: uppercase + de-duplicate symbols, default list first
   - pick the selected list (the current id, else the default, else the first)
   - `forkJoin`: `GET /watchlists/{id}` (live-priced stocks) **and** `GET /instruments?search=` (the full catalog
     for search). Each has its own `catchError`, so one failing doesn't kill the other.
2. The component **reads the service's signals directly** (`watchlists`, `selected`, `stocks`, `isLoading`), so
   whenever the service updates them the page re-renders. The component itself holds only UI state
   (`searchQuery`, `createMode`, `newName`, `pendingDeleteId`, `notice`, …).
3. **Create "Tech"** → `create(event)` → `service.createWatchlist('Tech')`:
   - client checks: not blank, ≤ 60 chars, unique name, < 20 lists; failures come back as `Error` with a message
   - `POST /watchlists { name }` → append, select it, empty stocks; a server 409 means "already exists"
4. **Search "nvid"** → `searchQuery` signal → `searchResults = computed(() => service.search(query))` filters
   the cached catalog by symbol or company name. Each row shows "Add", or "Already in watchlist" if
   `isInSelected()`.
5. **Add NVDA** → `addToSelected('NVDA')`:
   - already there → `'already-in-watchlist'` (no request)
   - `POST /watchlists/{id}/instruments { symbol }` → update `symbols`, then `refreshSelected()` re-reads live
     prices; a 404 means "Unknown symbol"
6. **Remove** → `removeFromSelected()` is **optimistic**: the UI updates first, then `DELETE …/instruments/NVDA`;
   if that fails it re-reads from the server to restore the truth.
7. **Delete list** → two-step confirm (`requestDelete` → "Confirm delete"/"Keep") → `deleteWatchlist(id)` →
   `DELETE /watchlists/{id}`. The default list can't be deleted. If the deleted list was selected, it falls back
   to the default.
8. **Trade from the watchlist:** each symbol and company name is a
   `routerLink="/orders/new" [queryParams]="{ symbol: stock.symbol }"` link, which opens Flow 9 with the symbol
   pre-filled.

---

### Flow 12: Token expiry and silent refresh

**Scenario:** the customer leaves the tab open for 20 minutes (the access token lives 15), then clicks Refresh on
Orders.

1. `GET /accounts/me/orders` with the old token → **401**.
2. [auth-token.interceptor.ts](../Frontend/frontend-app/src/app/shared/interceptors/auth-token.interceptor.ts) `catchError`: 401 and
   `getRefreshToken()` is non-null (the user is signed in) → `auth.refreshAccessToken()`.
3. [mock-auth.service.ts](../Frontend/frontend-app/src/app/shared/services/mock-auth.service.ts) `refreshAccessToken()`:
   - `authApi.refresh({})` → `POST /auth/refresh` with an **empty body**. The browser attaches the HttpOnly
     `refresh_token` cookie (its `Path=/auth` covers this URL). It's a public path: no bearer, and its own 401
     isn't "refreshed" again, which would otherwise loop forever
   - success → the response sets a **new** refresh cookie (rotation, done by the browser) and `storeTokens()`
     keeps the new access token in memory → emits the new access token
4. The interceptor `switchMap`s to `next(withBearer(req, newToken))`: the original GET is **retried** and the
   user never notices.
5. **If refresh fails with 401** (cookie missing, expired or revoked; the backend also clears the cookie):
   `clearSession()` resets the access token and removes the stored user. The
   interceptor sees `!auth.isAuthenticated()` and navigates to `/login?returnUrl=/orders/history`. The original
   error still propagates, so the screen can show its error state.
6. **If refresh fails with a network error:** the session is **not** cleared (the server just wasn't
   reachable), so the user can try again.

---

### Flow 13: Toggle the theme

1. Top-bar button in [app-shell.component.ts](../Frontend/frontend-app/src/app/shared/layout/app-shell.component.ts):
   `(click)="theme.toggle()"`.
2. [theme.service.ts](../Frontend/frontend-app/src/app/shared/services/theme.service.ts) `toggle()` → `current` signal flips →
   `document.documentElement.dataset['theme'] = 'dark'` → `<html data-theme="dark">` → saved in
   `localStorage['tp_theme']`.
3. [styles.css](../Frontend/frontend-app/src/styles.css): `:root[data-theme='dark'] { --tp-bg: …; --tp-text: …; }` overrides the colour
   tokens. Every component uses `var(--tp-…)`, so the whole app re-colours instantly with no Angular re-render
   needed.
4. The button's `aria-label` switches between "Switch to light theme" and "Switch to dark theme".

---

### Flow 14: Sign out

1. Shell "Sign out" → `signOut()` → `authService.logout()` then `router.navigate(['/login'])`.
2. `logout()`: `authApi.logout({})` → `POST /auth/logout` with an empty body. The browser sends the refresh
   cookie; the server revokes that token and **clears the cookie** (`204`). The call is always made, because
   the page can't tell whether a cookie exists. Errors are swallowed (`catchError(() => of(void 0))`), and
   `finalize(() => clearSession())` **always** removes `current_user` and `kyc_status` and resets the signals,
   including the in-memory access token.
3. Because `isAuthenticated` is a computed signal, the shell's Sign out button disappears immediately. The next
   guarded navigation redirects to login.

---

### Flow 15: Page reload keeps you signed in

1. The user presses F5 on `/funds`. The whole JavaScript app restarts from scratch, and every signal is gone,
   **including the access token**, which was only ever in memory.
2. Before any route is guarded, the app initializer runs `MockAuthService.restoreSession()`. `currentUser` is
   loaded from `localStorage['current_user']`, so this is a returning user → **one `POST /auth/refresh`**
   (empty body, HttpOnly cookie attached) → new access token in memory, refresh cookie rotated → **`GET /auth/me`**
   → the user is reloaded from the server and the cache overwritten.
3. `MockKycService`'s constructor reads `localStorage['kyc_status']`.
4. `mockAuthGuard` ✔, `kycApprovalGuard` ✔, so `/funds` loads normally. The e2e test "a reload keeps the user
   signed in through one silent refresh" covers this.
5. **No valid cookie** (expired, revoked, or the cookies were cleared): the refresh gets a 401, the session is
   cleared, and the initializer still completes. `mockAuthGuard` then redirects to
   `/login?returnUrl=/funds`.

**Side effect for tests and multiple tabs:** every login revokes the user's other refresh tokens. A second
login elsewhere (another tab, or an e2e test calling the API directly) therefore makes the next reload of the
first tab end at `/login`.

---

## Part 9: State, meaning where data lives

### Where the tokens live

| Token | Stored in | Written by | Read by | Cleared by |
|---|---|---|---|---|
| access token (JWT, 15 min) | **memory only**: the `accessTokenStore` signal | `MockAuthService.storeTokens` (login, refresh) | `getToken()` → interceptor; `api-clients.readAccessToken` → generated auth client | `clearSession`; every page load (the `MockAuthService` constructor) |
| refresh token (7 days, single-use) | **HttpOnly cookie** `refresh_token`, `Path=/auth`, `Secure`, `SameSite=Strict` | the auth service (`Set-Cookie` on login, admin login, refresh) | only the browser, which sends it to `/auth/refresh` and `/auth/logout` | the auth service on logout or a refused refresh; cookie expiry |

### localStorage keys

| Key | Written by | Read by | Cleared by |
|---|---|---|---|
| `current_user` (JSON) | `setCurrentUser` | `loadUserFromStorage` (display: username, greeting); `restoreSession` uses it to decide whether to refresh. **Never read for access decisions**; overwritten from `/auth/me` on every reload | `clearSession` |
| `kyc_status` | `MockKycService.submitKyc/getKycStatus` | `MockKycService` constructor → guard | `clearSession`, 404 from `GET /kyc` |
| `tp_theme` | `ThemeService.toggle` | `ThemeService` init | never |
| `auth_token`, `refresh_token` | **nothing any more** (older builds only) | nothing | deleted by the `MockAuthService` constructor on every load |

**Security design to know for reviews:** nothing token-shaped is in web storage, so an XSS bug can't read a
token from `localStorage`. The refresh token (the long-lived credential) is in an **HttpOnly** cookie that
JavaScript can't read at all. The access token is in memory: injected script running in the page could still
use it while the tab is open, but it expires within 15 minutes and is gone on reload. The cookie is
`SameSite=Strict` and scoped to `Path=/auth`, so the browser never sends it to `/kyc` or the Trade API, and a
cross-site page can't trigger a refresh or logout with it (that's the CSRF protection). Other mitigations:
single-use rotating refresh tokens, server-side logout/revocation, and Angular's built-in template escaping
(which prevents most XSS). The cost: a reload needs one extra `POST /auth/refresh` before the first screen
loads.

### In-memory state (signals)

- **App-wide (in services):** current user + access token (`MockAuthService` / `accessTokenStore`), KYC status
  (`MockKycService`), all watchlist data (`WatchlistService`), theme (`ThemeService`).
- **Per screen (in components):** loading flags, error/success messages, loaded data (orders, positions…),
  form state. It disappears when you navigate away.

Note the design difference: most screens load their data in `ngOnInit` and keep it in **component** signals,
while the watchlist keeps its data in the **service**. If you navigate away and back, `load()` re-fetches anyway.

---

## Part 10: Error handling pipeline

```
Backend returns e.g. 400 { "errorCode": "ORD-400", "message": "Insufficient cash" }
        │
        ▼
HttpClient errors with HttpErrorResponse { status: 400, error: { errorCode, message } }
        │
        ▼  (interceptor: not a 401 → rethrow unchanged)
        │
        ▼
Service.rethrowServerError()  →  plain object { errorCode: 'ORD-400', message, status: 400 }
        │                         (TradeApiError / AuthError)
        ▼
Component subscribe({ error: (err) => ... })
        │
        ├─ errorMapping.isNetworkError(err.status)  (status === 0, backend unreachable)
        │       → "Unable to connect to the service. Please check your connection and try again."
        └─ errorMapping.getErrorMessage(err.errorCode)
                → "There is not enough cash to place this order."
        │
        ▼
errorMessage.set(...)  →  <div class="tp-alert tp-alert-error" role="alert">
```

Why unwrap to a plain object? Components only care about `errorCode` and `status`, and the old in-memory mocks
threw exactly that shape, so components didn't have to change when the real backend was wired in. `status` is
carried because a status-0 failure has no JSON body.

**Error codes** ([error-mapping.service.ts](../Frontend/frontend-app/src/app/shared/services/error-mapping.service.ts)):

| Code | Message | Typical cause |
|---|---|---|
| `ACC-404` | The account could not be found. | account not provisioned yet (`accountId` 0) |
| `ACC-403` | This account is not active or is not authorized for this session. | suspended account / wrong account |
| `INS-404` | The instrument cannot be traded. | unknown symbol on order |
| `ORD-400` | There is not enough cash to place this order. | buy > cash |
| `ORD-409` | There are not enough holdings to sell, or this order has already been placed. | oversell or reused idempotency key |
| `VAL-422` | A field is not acceptable. Please review and try again. | server-side validation |
| `AUTH-401` | Your session has expired or sign-in was refused. Please log in again. | bad credentials / expired token |
| `AUTH-409` | This username is already taken. Please choose another. | registration |
| `AUTH-403` | This sign-in is not allowed to do that. Sign in with a customer account and try again. | a non-customer token on a customer-only KYC call |
| `KYC-404` | We could not find your identity verification. Please submit your details. | no KYC submission yet |
| `KYC-409` | This identity verification has already been submitted or approved. | second `POST /kyc`, or reviewing an approved one |
| anything else | An unexpected error occurred. Please try again or contact support. | |

Login and register override some messages locally (`messageFor` / `showError`) for more specific wording.

The table covers **every code in both contracts** (the eight in the Sprint 9 catalogue plus the three KYC-related
auth codes). `error-mapping.service.spec.ts` loops over all eleven and fails if any falls back to the generic
sentence; it also checks the fallback and the status-0 network message.

---

## Part 11: Styling and theming

[src/styles.css](../Frontend/frontend-app/src/styles.css) (~1,100 lines) is the **design system**. Sections:

1. **Tokens** on `:root`: colours (`--tp-bg`, `--tp-surface`, `--tp-text`, `--tp-accent` green, `--tp-positive`,
   `--tp-negative`…), radii, fonts, shadows, and **icons as inline SVG data URLs** (`--tp-icon-grid`,
   `--tp-icon-eye`, …) used with CSS `mask`.
2. **Dark theme**, applied in two ways:
   - `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { … } }`: follow the OS unless the
     user pinned light
   - `:root[data-theme='dark'] { … }`: the user pinned dark
3. **Base**, utilities (`.sr-only` visually hidden but readable by screen readers, `.tp-num` tabular numbers,
   `.tp-mono`, `.tp-muted`, `.tp-positive`, `.tp-negative`).
4. **Components** as classes: `.tp-page`, `.tp-page-header`, `.tp-grid(-3|-main-side)`, `.tp-panel(-header|-body)`,
   `.tp-stat`, `.tp-details`, `.tp-table(-wrap)`, `.tp-empty`, `.tp-badge(-positive|-negative|-warning)`,
   `.tp-form`, `.tp-label`, `.tp-input`, `.tp-input-action` (eye button), `.tp-field-error`, `.tp-hint`,
   `.tp-segmented`, `.tp-btn(-primary|-secondary|-danger|-block)`, `.tp-link`, `.tp-spinner`,
   `.tp-alert(-error|-success|-info)`, `.tp-form-footer`.
5. **App shell**: `.sh`, `.sh-sidebar`, `.sh-nav-link`, `.sh-topbar`, `.sh-main`, `.sh-skip`…

**Global vs component styles:** small, screen-specific CSS goes in a component's `styles: [...]`. Angular
**scopes** it to that component (adds unique attributes), so `.steps` in the KYC form can't affect anything else.
Shared look-and-feel goes in `styles.css`. The 2 kB/4 kB component style budget in `angular.json` enforces this.

The visual direction (dark green/black with bright-green accents) is described in
[prompts/theme-context.md](../Frontend/frontend-app/prompts/theme-context.md).

---

## Part 12: Accessibility patterns

Reviewers like these, and they're everywhere in the templates:

- Every input has a `<label for="id">`; errors are linked with `aria-describedby` and flagged with
  `aria-invalid="true"`; required fields have `aria-required`.
- Error alerts use `role="alert"` (announced immediately); success/progress uses `role="status"`; hidden
  `<span class="sr-only" role="status">Signing in, please wait.</span>` announces loading states.
- **Focus management:** after a failed submit, focus jumps to the first invalid field; after a successful
  order or registration, focus moves to the new heading (`afterNextRender`); "Skip to main content" in the shell.
- `aria-disabled` instead of `disabled` on busy buttons, so they stay focusable and the handler simply ignores
  clicks.
- Tables use `<th scope="col">`, and scrollable table wrappers are focusable regions with labels.
- Status badges show words, not just colour; buy/sell show "Buy"/"Sell" text as well as green/red.
- The nav uses `ariaCurrentWhenActive="page"`; the KYC stepper uses `aria-current="step"`.
- Decorative SVGs are `aria-hidden="true"`.

---

## Part 13: Testing (unit and end-to-end)

The suite is deliberately small: **62 unit tests** and **46 Playwright tests**. Each test checks one behaviour
that would matter if it broke, and the unit tests are aimed at the screens and rules the Sprint 9 brief assesses.

### 13.1 Unit tests: Karma + Jasmine (`npm test`)

Each `*.spec.ts` sits next to the file it tests (62 `it(...)` cases across 12 spec files). The shape:

```ts
TestBed.configureTestingModule({
  providers: [
    provideRouter([]),
    { provide: TradeApiService, useValue: tradeApi },          // a jasmine spy object
    { provide: MockAuthService, useValue: { currentUser$: signal(user) } }
  ]
});
fixture = TestBed.createComponent(PlaceOrderComponent);
fixture.detectChanges();                        // runs ngOnInit + renders
submit();
expect(tradeApi.placeOrder).not.toHaveBeenCalled();
```

| Spec | Tests | What it proves |
|---|---:|---|
| `error-mapping.service.spec.ts` | 13 | every code in both contracts (11) renders its own sentence; unknown codes get the fallback; status 0 gets the network message |
| `place-order.component.spec.ts` | 8 | validation before submit (missing, fractional, zero/negative, 3 decimals), read-only account, fresh idempotency key, same key on a network retry, the server's status (incl. `REJECTED`), a business rejection keeps the ticket |
| `view-orders.component.spec.ts` | 7 | newest first with badges in words, mapped error; polling every 5 s while NEW, never re-posting, stopping when settled, on destroy, and after 5 minutes |
| `login.component.spec.ts` | 6 | missing fields send nothing, sign-in → dashboard, return URL honoured, off-origin return URL refused, refused and unreachable messages |
| `mock-auth.service.spec.ts` | 6 | access token in memory only, refused login stores nothing, logout clears the session, one refresh for concurrent 401s + retry, session restore from the cookie, a spoofed `ADMIN` in `current_user` overwritten from `/auth/me` on restore |
| `trade-api.service.spec.ts` | 5 | account/balance/positions, order-history query params, order POST body, error envelope, status 0 |
| `auth-token.interceptor.spec.ts` | 3 | **attaches the bearer token to the Trade API**, never to `/auth/login`, **never to a third-party origin** (the two cases the brief assesses by name) |
| `mock-auth.guard.spec.ts` | 6 | redirect with the return address, allow when signed in, a token-admin sent from customer screens to `/admin/dashboard`, `mockAdminGuard` refuses a spoofed `localStorage` admin and allows a real token admin, every route has a guard |
| `safe-return-url.spec.ts` | 2 | same-origin path accepted; off-origin, protocol-relative, backslash, `javascript:` and empty refused |
| `register.component.spec.ts` | 2 | invalid fields send nothing; a valid form sends the payload without the confirmation field |
| `kyc-form.component.spec.ts` | 2 | every field required; valid details submitted for the signed-in user |
| `dashboard.component.spec.ts` | 2 | cash/holdings/total summary; `ACC-404` explained |

Techniques to recognise:
- **Fakes via DI:** `{ provide: X, useValue: {...} }` replaces a real service. This is the main payoff of
  dependency injection.
- **`HttpTestingController`** (`provideHttpClientTesting()`): intercepts `HttpClient` calls so a test can
  assert the URL/headers (`backend.expectOne(url)`) and reply (`req.flush(data)`). See
  [auth-token.interceptor.spec.ts](../Frontend/frontend-app/src/app/shared/interceptors/auth-token.interceptor.spec.ts).
  The generated clients are built on `HttpClient`, so this still catches their requests. Service specs add
  `...provideApiClients()` to the providers to configure the clients exactly as `app.config.ts` does.
- **In-memory token in tests:** the token lives in `accessTokenStore`, which `MockAuthService`'s constructor
  resets, never in `localStorage`.
- **`fakeAsync` + `tick(ms)`**: fast-forward virtual time to test the 5-second polling without waiting
  ([view-orders.component.spec.ts](../Frontend/frontend-app/src/app/features/orders/view-orders/view-orders.component.spec.ts)).

Run once, headless (as CI would): `npx ng test --watch=false --browsers=ChromeHeadless`.

### 13.2 End-to-end tests: Playwright (`npm run e2e`)

They run a **real Chromium** against the **real, already-running stack**. Nothing is mocked. Setup:
1. Start Postgres, Kafka, the auth service (3000), the Trade API (8080), the executor, and `npm start` (4200).
2. Fill in `.env.local` with the `E2E_*` variables.
3. `npm run e2e`, then open `playwright-report/index.html` for results.

| File | Tests | Covers |
|---|---:|---|
| `login.spec.ts` (assessed) | 7 | guard redirect + returnUrl, refused sign-in, no username enumeration, customer/admin sign-in kept apart, success, arriving where you were going, open-redirect protection |
| `place-order.spec.ts` (assessed) | 8 | read-only account, validation before submit (no POST), a placed order in any valid status, `INS-404`/`ORD-400`/`ORD-409` as sentences, resubmit after a refusal, SELL |
| `blotter.spec.ts` | 4 | badges in words, an order at NEW brought up to date by polling, rejected orders kept, server-side status filter |
| `session.spec.ts` | 3 | every protected screen redirects when signed out, sign-out ends access, bearer token only on platform APIs |
| `admin.spec.ts` | 7 | admin sign-in, signed-out/customer/admin each kept on their own side, queue + pending count, approve/reject seen by the customer |
| `kyc.spec.ts` | 4 | KYC gate on every trading screen, submit, reject + resubmit, approve |
| `token-refresh.spec.ts` | 5 | one silent refresh per reload, refresh + retry on 401, one refresh for concurrent 401s, no cookie → `/login`, sign-out removes the cookie |
| `api-security.spec.ts` | 2 | the Trade API refuses a missing token; a reused idempotency key places no second order |
| `register.spec.ts` | 2 | successful sign-up, taken username on the field |
| `funds.spec.ts` | 2 | deposit persists across a reload, over-balance withdrawal blocked |
| `watchlist.spec.ts` | 2 | create + add/remove, link to the order ticket |

Support files: `env.ts` (reads `E2E_*` variables, expected messages, `TRADING_ROUTES`), `helpers.ts` (`signIn`,
`signInAsAdmin`, `submitTicket`, `recordRequests`…), `api.ts` (builds test data through the real APIs). The full
walkthrough is in [playwright-e2e-guide.md](playwright-e2e-guide.md). Before a review, run each file in its own
process so a test that depends on its neighbour shows up.

Playwright finds elements by **`data-testid`** (`page.getByTestId('login-submit')`). That's why the templates are
full of `data-testid` attributes: tests don't break when CSS classes or text change.

### 13.3 Bundle secret scan (`npm run scan:bundle`)

Everything in `dist/` is downloaded by every browser, so [scripts/scan-bundle.mjs](../Frontend/frontend-app/scripts/scan-bundle.mjs)
searches the built files for what must never be there, and exits non-zero if it finds any:

| Pattern | Why |
|---|---|
| `x-api-key`, `api_key`, `api-key`, `fauxnance` | a market-data key in the bundle is a key published |
| `execute-api.<region>.amazonaws.com` | the app never calls the market-data API directly |
| `jwt_secret`, `secret = "<16+ chars>"`, a three-part JWT | a signing secret in the browser lets anyone mint tokens |

To also catch your real key and signing secret under names none of these patterns would match, pass their values
in the environment; the script never prints them:

```bash
npm run build
BUNDLE_SCAN_LITERALS="<market-data key>,<jwt secret>" npm run scan:bundle
```

Use the full values: a short literal can match ordinary minified code.

---

## Part 14: Commands cheat sheet

Run from `Application/Frontend/frontend-app/`:

```bash
npm ci                       # install exact dependency versions from package-lock.json
npm start                    # dev server → http://localhost:4200 (needs auth :3000 and trade :8080 running)
npm run build                # production build → dist/trading-ui/ (uses environment.prod.ts)
npm test                     # unit tests (Karma opens Chrome, watches files)
npx ng test --watch=false    # unit tests once (e.g. CI)
npm run e2e                  # Playwright e2e (whole stack must be running; .env.local filled)
npx playwright show-report   # open the last e2e report
npm run scan:bundle          # after npm run build: search dist/ for keys and secrets
npm run generate:clients     # regenerate src/generated/ from Contracts/API-Schemas/*.yaml (needs Java 11+)
```

---

## Part 15: Known quirks and technical debt

Knowing these shows real understanding in a review. Read each as an observation about the current code, not a
mandate to change it.

1. **"Mock" names on real services.** `MockAuthService`, `MockKycService`, `mockAuthGuard` and `mockAdminGuard` all
   call the real backend. The names are historical (explained in the comment at the top of
   `mock-auth.service.ts`).
2. **`MarketDataService` is unused.** The watchlist moved to backend data; nothing references it any more.
3. **The bearer token is attached twice on `/auth/me` and `/kyc`.** Now that every call goes through the
   generated clients, the auth client adds `Authorization` itself on secured operations, and
   `authTokenInterceptor` sets the same header again. It's harmless (same value), but it means two places decide
   which auth-service calls get a token.
4. **The KYC guard trusts a cached status.** `kycApprovalGuard` reads `kyc_status` from memory/localStorage.
   After an admin approves, the customer needs to sign in again or open the Verification page to refresh it. (It
   is safe because the backend enforces authorization regardless, but it's a UX lag.)
5. **Funds sends an absolute balance.** The browser computes `current ± amount` and PATCHes the total. Two tabs,
   or a fill landing between the read and the write, could overwrite each other (a lost update). A
   `deposit/withdraw { amount }` endpoint, or optimistic locking, would avoid it.
6. **The Funds "Balance after action" preview likely never appears.** `previewBalance` is a `computed` that
   reads `form.controls.amount.value`, which is **not a signal**, so typing an amount doesn't trigger a
   recompute. (Compare `PlaceOrderComponent`, which correctly uses `toSignal(form.valueChanges)`.) It also always
   *adds* the amount, even for a withdrawal. No unit test covers the preview.
7. **The `returnUrl` is dropped on the KYC detour.** `kycApprovalGuard` adds `returnUrl` to `/kyc-submission`,
   but the KYC page ignores it ("Go to dashboard" always goes to `/dashboard`). Login also sends admins to
   `/admin/dashboard`, ignoring `returnUrl`.
8. **Small loose ends:** `submitKyc(userId, data: any)` takes an untyped `data` and doesn't use `userId` (the
   backend uses the JWT); `void known;` in `WatchlistService.addToSelected` is dead code;
   `TradeApiService.rethrowServerError` uses `throw` while the auth service uses `throwError()` (both work inside
   `catchError`); watchlist component subscriptions don't use `takeUntilDestroyed`; the `KycFormComponent` keeps
   `rejectionReason` as a plain field rather than a signal.
9. **Stale docs:** [src/generated/README.md](../Frontend/frontend-app/src/generated/README.md) still mentions `sprint09/…` paths, and
   `e2e/env.ts` mentions an `e2e/README.md` that doesn't exist. `npm run lint` has no lint builder configured.
10. **The refresh cookie depends on the deployment.** It's `Secure` and `SameSite=Strict`. In dev, the UI
    (`localhost:4200`) and auth service (`localhost:3000`) are the same *site*, and browsers treat `localhost` as
    secure, so it works over plain HTTP. **In the prod build it won't be sent as things stand:** the UI calls
    `/auth-api/auth/refresh`, but the auth service sets `Path=/auth`, and `/auth-api/…` doesn't path-match `/auth`.
    The proxy in front of the UI must rewrite the cookie path (e.g. nginx
    `proxy_cookie_path /auth /auth-api/auth;`), or refresh and reload will fail and logout won't revoke the token. A different site or
    no HTTPS breaks it too. The CORS config also needs `credentials: true` with an explicit origin, never `*`.
11. **The blotter never says an order is still working.** `ViewOrdersComponent` tracks polling in its
    `isPolling` signal, but the template never reads it, so while an order sits at `NEW` the only on-screen hint
    is the collapsed "What do the statuses mean?" guide. The Sprint 9 brief asks the screen to say the order is
    still working; one line shown while `isPolling()` is true would do it.
12. **Every reload costs a refresh.** The access token isn't persisted, so each full page load (and each
    `page.goto` in Playwright) makes one `POST /auth/refresh` before the first screen, and rotates the refresh
    cookie.
13. **An expired access token sends the user to sign-in on the next navigation.** `isAuthenticated()` now
    requires an unexpired token. A user who leaves a tab open past the 15-minute access-token lifetime and then
    clicks a sidebar link is redirected by `mockAuthGuard` to `/login`, although the refresh cookie is still
    valid and an API call on the same page would have refreshed silently. Meanwhile the `authenticated` computed
    signal (which the shell's sign-out button and `getRefreshToken()` read) still says "signed in", because it
    only re-runs when the token changes. Refreshing in the guard when the token has expired, or refreshing a
    little before `exp`, would make navigation behave like API calls. `hasValidToken()` also treats non-JWT
    tokens and tokens without `exp` as valid, a concession to unit-test doubles that lives in production code.

---

## Part 16: Review questions and answers

**Architecture and Angular basics**

1. **What happens when the app starts?**
   `index.html` loads, `main.ts` calls `bootstrapApplication(AppComponent, appConfig)`, `appConfig` registers the
   router, HttpClient with the interceptor, API client config, and an app initializer that runs
   `restoreSession()` (one silent refresh for a returning user). `AppComponent` renders `<router-outlet />`, and
   the router resolves the URL (`/` → `/login`).

2. **What is a standalone component? Where are your NgModules?**
   A component that declares its own dependencies in `imports`. There are no NgModules; app-wide setup lives in
   `app.config.ts` providers.

3. **What's the difference between a component and a service?**
   A component owns a piece of UI (template + view state). A service holds reusable logic or shared state and does
   the backend I/O. Components get services through DI.

4. **What does `providedIn: 'root'` mean?**
   One singleton instance for the whole app, created lazily the first time it's injected, and tree-shaken if
   never used.

5. **Why `inject()` and not `new`?**
   DI supplies the service's own dependencies (the generated API clients), guarantees one shared instance (one session), and lets
   tests substitute fakes.

6. **What are signals? Why use them over plain fields?**
   Reactive values: reading one in a template subscribes the view to it, so changes re-render precisely.
   `computed` derives values that stay in sync automatically, e.g. `authenticated = computed(() => accessToken() !== null)`.

7. **Signals vs Observables: when is each used here?**
   Observables for **async events/streams** (HTTP calls, `valueChanges`, `queryParamMap`); signals for **state**
   the UI displays. `toSignal` bridges them (Place Order's `values`).

8. **What is lazy loading and how is it done here?**
   `loadComponent: () => import('./…')` puts each screen in its own JS chunk, downloaded on first visit, which
   keeps the initial bundle under the 500 kB budget.

9. **How do nested routes and the shell work?**
   The shell route has `component: AppShellComponent` and `children`. The child component renders inside the
   shell's `<router-outlet />` in `<main>`.

10. **Why reuse `LoginComponent` for `/admin-login`?**
    Same UI, different endpoint. The route's `data: { isAdmin: true }` switches the heading, links and the API
    call (`/auth/admin/login`).

**Auth and security**

11. **How does a request get the JWT?**
    `authTokenInterceptor` clones the request with `Authorization: Bearer <token>` for Trade API URLs and
    non-public auth URLs only.

12. **Why not send the token on every request?**
    So it never leaks to third-party origins, and because login/register/refresh/logout are public endpoints that
    must not carry one.

13. **What happens when the access token expires?**
    The 401 is caught by the interceptor, `POST /auth/refresh` (empty body; the browser sends the HttpOnly
    cookie) returns a new access token and rotates the cookie, and the original request is retried. If refresh is
    refused, the session is cleared and the user is sent to `/login?returnUrl=…`.

14. **Three requests fail with 401 at the same time. How many refresh calls?**
    One. `refreshInFlight ??= …pipe(shareReplay(1))` shares the in-flight refresh; `finalize` resets it. This
    matters because refresh tokens are single-use and rotated: a second refresh with the same token is refused,
    which would sign the user out.

15. **Are the route guards your security?**
    No. They're UX: they redirect instead of showing empty screens. The client is fully under the user's control.
    The backend validates the JWT and authorises every call (`api-security.spec.ts` shows a request with no token
    refused), and `/me` endpoints
    take the account from the token, not the URL.

16. **Why return a `UrlTree` from guards?**
    The router performs the redirect as part of the same navigation, so it can't race or be dropped (no blank screen).

17. **What is an open redirect and how do you prevent it?**
    Using an attacker-supplied URL as a post-login destination. `safeReturnUrl` only accepts same-origin paths:
    single leading `/`, no `//`, no `\`, no control characters, and an origin re-check via `new URL`.

18. **Why is the login error the same for a wrong username and a wrong password?**
    To prevent username enumeration. The backend also returns the same `AUTH-401`.

19. **Where are tokens stored? Risks?**
    The access token is **in memory only** (the `accessTokenStore` signal); the refresh token is an **HttpOnly**
    `refresh_token` cookie (`Secure`, `SameSite=Strict`, `Path=/auth`). Nothing token-shaped is in
    `localStorage`, so XSS can't read the long-lived credential at all. Injected script could still use the access
    token while the page is open, but it lasts 15 minutes. `SameSite=Strict` plus the `/auth` path is the CSRF
    protection: cross-site pages can't make the browser send the cookie, and it never goes to the Trade API. The
    trade-off: every reload needs one refresh call before the first screen.

20. **Do you verify the JWT in the browser?**
    No. `decodeToken` only base64-decodes the payload to read claims for display/routing. Verification
    (signature, expiry) is done by the backend.

21. **How does a reload keep the user signed in?**
    The access token is lost on reload by design. An app initializer (`provideAppInitializer` in `app.config.ts`)
    runs `restoreSession()` before the first route is guarded: if a `current_user` is stored, one
    `POST /auth/refresh` swaps the HttpOnly cookie for a new access token. `MockKycService` restores the KYC status
    from `localStorage`. With no valid cookie the initializer still completes, and the guards send the user to
    `/login`.

22. **What does logout do?**
    `POST /auth/logout` with an empty body. The browser sends the refresh cookie, and the server revokes the token
    and clears the cookie. The app then **always** clears local session data (even if the call fails), and the
    shell navigates to `/login`.

**Features**

23. **How does the app decide where to go after login?**
    Admin → `/admin/dashboard`. Otherwise fetch `GET /kyc`: APPROVED → safe `returnUrl` or `/dashboard`;
    anything else → `/kyc-submission`.

24. **How does KYC know whether to create or update?**
    `submitKyc` does `GET /kyc`: if found, `PUT`; if 404, `POST`.

25. **How does the dashboard load data?**
    `forkJoin` of account, balance and positions in parallel. Holdings use `marketValue` when available, otherwise
    `quantity × averageCost`.

26. **What is the idempotency key and when is it reused?**
    A UUID per logical order, so a retried POST doesn't create a duplicate. It's **kept** after a network error
    (status 0, unknown outcome) so a retry is deduplicated, and **cleared** after any server answer or success.

27. **How does the order ticket validate?**
    Reactive form with built-in plus custom validators (`wholeNumber`, `positive`, `twoDecimals`, max length 10).
    Invalid → focus the first invalid field and send nothing (the e2e test asserts zero POSTs).

28. **How does the blotter show fills without manual refresh?**
    While any order is `NEW`, it polls `GET orders` every 5 s with a background load (no flicker). It stops when
    nothing is NEW, on error, after 5 minutes, or when the component is destroyed.

29. **How does "Trade" from the watchlist pre-fill the ticket?**
    `routerLink="/orders/new" [queryParams]="{symbol}"`; `PlaceOrderComponent` reads `queryParamMap` and fills the
    symbol only if the control is pristine.

30. **Why does `WatchlistService` hold state but other services don't?**
    The watchlist has richer shared state (lists, selection, catalog, live stocks) and business rules; keeping it
    in signals on the service keeps the component thin. Other screens are simple "load and display".

31. **What is optimistic UI? Where is it used?**
    Updating the UI before the server confirms. `removeFromSelected` removes the row immediately and re-syncs from
    the server if the DELETE fails.

**Data and contracts**

32. **What is `src/generated/` and why commit it?**
    TypeScript Angular clients and models generated from the OpenAPI YAML contracts. It's committed so contract
    changes are reviewable diffs and the app builds without Java.

33. **Why are the models aliases of the generated ones?**
    If the contract changes and the clients are regenerated, mismatched code fails to **compile** instead of failing
    at runtime.

34. **How do dev and prod reach different APIs?**
    `angular.json` `fileReplacements` swaps `environment.ts` (localhost:3000/8080) for `environment.prod.ts`
    (`/auth-api`, `/trade-api` behind a reverse proxy).

35. **Why does dev need CORS?**
    The UI (4200) and APIs (3000/8080) are different origins, so the backends must allow `http://localhost:4200`.

**Errors, styling, testing**

36. **How do errors become user messages?**
    Service `rethrowServerError` → `{ errorCode, message, status }`; component → `ErrorMappingService`
    (status 0 → network message; code → friendly text) → `errorMessage` signal → `role="alert"` alert.

37. **How does dark mode work?**
    CSS custom properties on `:root`, overridden under `[data-theme='dark']` and under `prefers-color-scheme: dark`.
    `ThemeService` sets the attribute and remembers it.

38. **Why is most CSS global?**
    It's a shared design system (`tp-*`), and the component style budget (2 kB warn / 4 kB error) keeps
    per-component CSS small.

39. **Unit vs e2e tests here?**
    Unit (Karma/Jasmine): isolated classes with faked dependencies via DI and `HttpTestingController`, run in
    seconds. E2E (Playwright): a real browser against the real stack, covering user journeys and backend security,
    run one at a time.

40. **Why `data-testid`?**
    Stable selectors for tests that don't break when text, layout or CSS changes.

---

## Part 17: Glossary

| Term | Meaning |
|---|---|
| **SPA** | Single-page application: one HTML page, and JavaScript swaps the views |
| **Component** | Class + template + styles for a piece of UI |
| **Service** | Injectable class for logic, state or HTTP |
| **DI / `inject()`** | Angular creates and hands out dependencies |
| **Signal / computed** | Reactive value / derived reactive value |
| **Observable** | Lazy async stream (RxJS); HTTP calls return one |
| **Pipe (template)** | Formatter like `currency`, `date` |
| **Pipe (RxJS)** | `.pipe(op1, op2)` chains operators |
| **Route guard** | Function deciding if navigation may proceed |
| **UrlTree** | A parsed URL a guard returns to redirect |
| **Interceptor** | Function that sees and can modify every HTTP request/response |
| **Lazy loading** | Download a screen's code only when first needed |
| **Router outlet** | Placeholder where the routed component renders |
| **Reactive form** | Form model defined in TypeScript (FormGroup/FormControl) |
| **Validator** | Function returning errors for a control value |
| **JWT** | JSON Web Token: signed `header.payload.signature`; the payload carries claims (`sub`, `roles`, `accountId`, `exp`) |
| **Access / refresh token** | Short-lived token for API calls (kept in memory here) / longer-lived single-use token to get a new pair (kept in an HttpOnly cookie here) |
| **HttpOnly cookie** | Cookie the browser stores and sends but page JavaScript can't read (`document.cookie` doesn't show it) |
| **SameSite=Strict** | Cookie attribute: the browser only sends the cookie on requests initiated by the same site, which blocks CSRF |
| **CSRF** | Cross-site request forgery: another site making the browser send a request that carries your cookies |
| **`withCredentials`** | Request option that lets a cross-origin call store and send cookies |
| **App initializer** | `provideAppInitializer(fn)`: work Angular finishes before the first navigation (here, `restoreSession()`) |
| **KYC** | Know Your Customer: identity verification required before trading |
| **Idempotency key** | Client-generated ID that makes retrying a request safe |
| **Blotter** | Trading term for the list of orders |
| **Limit order** | Buy/sell at a specified price or better |
| **Position** | Shares held in a symbol, with an average cost |
| **OpenAPI** | YAML/JSON description of an HTTP API, used to generate clients |
| **CORS** | Browser rule controlling cross-origin requests |
| **Open redirect** | Vulnerability where a site redirects to an attacker-chosen URL |
| **XSS** | Cross-site scripting: injected JS running in your page |
| **`data-testid`** | Attribute used by tests to locate elements |
