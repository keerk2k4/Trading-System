// Order models and interfaces

export type OrderStatus = 'NEW' | 'FILLED' | 'REJECTED' | 'CANCELLED';
export type OrderSide = 'BUY' | 'SELL';

export interface Order {
  id: string;
  accountId: number;
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  status: OrderStatus;
  createdAt: Date;
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
