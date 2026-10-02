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
  }
};

// The UI renders order statuses as words ("NEW" -> "New").
export const PLACED_ORDER_STATUSES = ['NEW', 'FILLED', 'REJECTED'];
export const PLACED_ORDER_LABELS = ['New', 'Filled', 'Rejected'];
export const ALL_STATUS_LABELS = ['New', 'Filled', 'Rejected', 'Cancelled'];
