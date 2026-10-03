// Every address and credential the journeys use comes from the environment,
// so all specs stay on one set. A missing variable fails the test with its
// name rather than with a confusing timeout further down.
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Export the E2E_* variables first (see e2e/README.md).`);
  }
  return value;
}

export const env = {
  get authApi(): string {
    return requireEnv('E2E_AUTH_API');
  },
  get tradeApi(): string {
    return requireEnv('E2E_TRADE_API');
  },
  get username(): string {
    return requireEnv('E2E_USERNAME');
  },
  get password(): string {
    return requireEnv('E2E_PASSWORD');
  },
  get accountId(): string {
    return requireEnv('E2E_ACCOUNT_ID');
  },
  get symbol(): string {
    return requireEnv('E2E_SYMBOL');
  },
  get adminUsername(): string {
    return requireEnv('E2E_ADMIN_USERNAME');
  },
  get adminPassword(): string {
    return requireEnv('E2E_ADMIN_PASSWORD');
  }
};

// The UI renders statuses as words ("NEW" -> "New").
export const PLACED_ORDER_STATUSES = ['NEW', 'FILLED', 'REJECTED'];
export const PLACED_ORDER_LABELS = ['New', 'Filled', 'Rejected'];

// Messages from ErrorMappingService, so a spec asserts what a trader reads.
export const MESSAGES = {
  'ACC-404': 'The account could not be found.',
  'INS-404': 'The instrument cannot be traded.',
  'ORD-400': 'There is not enough cash to place this order.',
  'ORD-409': 'There are not enough holdings to sell, or this order has already been placed.',
  'AUTH-409': 'This username is already taken. Please choose another.',
  badLogin: 'Incorrect username or password. Check your details and try again.'
} as const;

// Every route behind mockAuthGuard + kycApprovalGuard.
export const TRADING_ROUTES = ['/dashboard', '/orders/new', '/orders/history', '/funds', '/watchlist'];
