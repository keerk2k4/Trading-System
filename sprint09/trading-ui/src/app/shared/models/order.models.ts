// Order models and interfaces

// The UI only ever filters by the first four, but the trade API's order
// history can also return the remaining lifecycle states.
export type OrderStatus =
  | 'NEW'
  | 'FILLED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'OPEN'
  | 'PARTIALLY_FILLED'
  | 'EXPIRED';
export type OrderSide = 'BUY' | 'SELL';

// Matches one entry of GET /api/v1/accounts/{accountId}/orders.
export interface Order {
  orderId: string;
  accountId: number;
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  executedPrice: number | null;
  status: OrderStatus;
  idempotencyKey: string;
  createdOn: string;
}

export interface OrderHistoryFilter {
  status?: OrderStatus;
  from?: Date | string;
  to?: Date | string;
}

export interface PlaceOrderRequest {
  accountId: number;
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  idempotencyKey: string;
}

export interface PlaceOrderResponse {
  orderId: string;
  status: OrderStatus;
  message: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
}

export type AccountStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED';

// Matches GET /api/v1/accounts/{accountId}.
export interface Account {
  id: number;
  accountId: string;
  holderName: string;
  cashBalance: number;
  status: AccountStatus;
  version: number;
  lastUpdated: string;
}

// Matches GET /api/v1/accounts/{accountId}/balance.
export interface Balance {
  accountId: number;
  cashBalance: number;
  currency: string;
  asOf: string;
}

// Matches one entry of GET /api/v1/accounts/{accountId}/positions.
export interface Position {
  accountId: number;
  symbol: string;
  quantity: number;
  averageCost: number;
}

// What TradeApiService rethrows on a failed call. `status` is the HTTP
// status, 0 when the backend could not be reached at all.
export interface TradeApiError {
  errorCode: string;
  message: string;
  status: number;
}
