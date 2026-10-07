// Order models and interfaces.
//
// Every wire type is an alias of the model generated from
// contracts/trade-api.yaml (src/generated/trade-client), never a hand-written
// copy: when the contract changes and the client is regenerated, every
// component that no longer matches fails to compile.
import type {
  AccountResponse,
  AccountStatus as ContractAccountStatus,
  AlertChannel as ContractAlertChannel,
  BalanceResponse,
  HoldingResponse as ContractHoldingResponse,
  NotificationResponse as ContractNotificationResponse,
  NotificationStatus as ContractNotificationStatus,
  NotificationType as ContractNotificationType,
  OrderHistoryEntry,
  OrderResponse,
  OrderSide as ContractOrderSide,
  OrderStatus as ContractOrderStatus,
  OrderType as ContractOrderType,
  PlaceOrderRequest as ContractPlaceOrderRequest,
  PositionResponse,
  PreferenceResponse as ContractPreferenceResponse,
  QuoteResponse,
  UpdateOrderRequest as ContractUpdateOrderRequest,
  UpdatePreferenceRequest as ContractUpdatePreferenceRequest
} from '../../../generated/trade-client';

export type OrderStatus = ContractOrderStatus;
export type OrderSide = ContractOrderSide;
export type OrderType = ContractOrderType;
export type AccountStatus = ContractAccountStatus;
export type AlertChannel = ContractAlertChannel;
export type NotificationType = ContractNotificationType;
export type NotificationStatus = ContractNotificationStatus;

// One entry of GET /api/v1/accounts/{id}/orders.
export type Order = OrderHistoryEntry;
// POST /api/v1/orders request and response.
export type PlaceOrderRequest = ContractPlaceOrderRequest;
export type PlaceOrderResponse = OrderResponse;
// PATCH /api/v1/orders/{id} request.
export type UpdateOrderRequest = ContractUpdateOrderRequest;
// GET /api/v1/instruments/{symbol}/quote response.
export type Quote = QuoteResponse;
// GET /api/v1/accounts/{id}, /balance, /positions and /holdings.
export type Account = AccountResponse;
export type Balance = BalanceResponse;
export type Position = PositionResponse;
export type Holding = ContractHoldingResponse;
// GET /api/v1/preferences/me and PUT.
export type Preferences = ContractPreferenceResponse;
export type UpdatePreferences = ContractUpdatePreferenceRequest;
// GET /api/v1/notifications/me.
export type Notification = ContractNotificationResponse;

export interface BalanceUpdateRequest {
  cashBalance: number;
}

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
