// Order models and interfaces.
//
// Every wire type is an alias of the model generated from
// contracts/trade-api.yaml (src/generated/trade-client), never a hand-written
// copy: when the contract changes and the client is regenerated, every
// component that no longer matches fails to compile.
import type {
  AccountResponse,
  AccountStatus as ContractAccountStatus,
  BalanceResponse,
  OrderHistoryEntry,
  OrderResponse,
  OrderSide as ContractOrderSide,
  OrderStatus as ContractOrderStatus,
  PlaceOrderRequest as ContractPlaceOrderRequest,
  PositionResponse
} from '../../../generated/trade-client';

export type OrderStatus = ContractOrderStatus;
export type OrderSide = ContractOrderSide;
export type AccountStatus = ContractAccountStatus;

// One entry of GET /api/v1/accounts/{id}/orders.
export type Order = OrderHistoryEntry;
// POST /api/v1/orders request and response.
export type PlaceOrderRequest = ContractPlaceOrderRequest;
export type PlaceOrderResponse = OrderResponse;
// GET /api/v1/accounts/{id}, /balance and /positions.
export type Account = AccountResponse;
export type Balance = BalanceResponse;
export type Position = PositionResponse;

// UI-only: filter form state for the order history screen.
export interface OrderHistoryFilter {
  status?: OrderStatus;
  from?: Date | string;
  to?: Date | string;
}

// What TradeApiService rethrows on a failed call. `status` is the HTTP
// status, 0 when the backend could not be reached at all.
export interface TradeApiError {
  errorCode: string;
  message: string;
  status: number;
}
