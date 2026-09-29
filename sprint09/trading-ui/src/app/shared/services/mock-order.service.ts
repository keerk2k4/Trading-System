import { Injectable, signal } from '@angular/core';
import { Order, OrderStatus, PlaceOrderResponse } from '../models/order.models';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class MockOrderService {
  private mockOrders = signal<Order[]>(this.generateMockOrders());

  constructor() {}

  // Get all orders for current user
  getOrders(): Observable<Order[]> {
    return of(this.mockOrders()).pipe(delay(500));
  }

  // Place a new order
  placeOrder(orderData: any): Observable<PlaceOrderResponse> {
    return new Observable(observer => {
      setTimeout(() => {
        // Validate idempotencyKey
        if (!orderData.idempotencyKey || orderData.idempotencyKey.length < 8 || orderData.idempotencyKey.length > 100) {
          observer.error({
            errorCode: 'VAL-422',
            message: 'Invalid idempotencyKey'
          });
          return;
        }

        // Simulate occasional errors
        const randomError = Math.random();
        
        if (randomError < 0.05) { // 5% chance of ACC-404
          observer.error({
            errorCode: 'ACC-404',
            message: 'Account not found'
          });
          return;
        }

        if (randomError < 0.10) { // 5% chance of ORD-400
          observer.error({
            errorCode: 'ORD-400',
            message: 'Insufficient cash'
          });
          return;
        }

        // Generate successful order
        const newOrder: Order = {
          id: 'ORD-' + this.generateId().substring(0, 8).toUpperCase(),
          accountId: orderData.accountId,
          symbol: orderData.symbol,
          side: orderData.side,
          quantity: orderData.quantity,
          price: orderData.price,
          status: 'NEW',
          createdAt: new Date()
        };

        // Add to mock orders
        const current = this.mockOrders();
        this.mockOrders.set([newOrder, ...current]);

        observer.next({
          orderId: newOrder.id,
          status: newOrder.status as OrderStatus,
          message: 'Order placed successfully',
          symbol: newOrder.symbol,
          side: newOrder.side,
          quantity: newOrder.quantity,
          price: newOrder.price
        });
        observer.complete();
      }, 1200);
    });
  }

  // Generate mock orders for display
  private generateMockOrders(): Order[] {
    const now = new Date();
    const statuses: OrderStatus[] = ['NEW', 'FILLED', 'REJECTED', 'CANCELLED'];
    
    return [
      {
        id: 'ORD-00001',
        accountId: 1,
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 100,
        price: 150.25,
        status: 'FILLED',
        createdAt: new Date(now.getTime() - 86400000) // 1 day ago
      },
      {
        id: 'ORD-00002',
        accountId: 1,
        symbol: 'GOOGL',
        side: 'SELL',
        quantity: 50,
        price: 140.00,
        status: 'NEW',
        createdAt: new Date(now.getTime() - 3600000) // 1 hour ago
      },
      {
        id: 'ORD-00003',
        accountId: 1,
        symbol: 'MSFT',
        side: 'BUY',
        quantity: 75,
        price: 380.50,
        status: 'REJECTED',
        createdAt: new Date(now.getTime() - 7200000) // 2 hours ago
      },
      {
        id: 'ORD-00004',
        accountId: 1,
        symbol: 'TSLA',
        side: 'BUY',
        quantity: 25,
        price: 245.75,
        status: 'CANCELLED',
        createdAt: new Date(now.getTime() - 10800000) // 3 hours ago
      },
      {
        id: 'ORD-00005',
        accountId: 1,
        symbol: 'AMZN',
        side: 'SELL',
        quantity: 30,
        price: 175.00,
        status: 'FILLED',
        createdAt: new Date(now.getTime() - 172800000) // 2 days ago
      },
      {
        id: 'ORD-00006',
        accountId: 1,
        symbol: 'NVDA',
        side: 'BUY',
        quantity: 200,
        price: 875.30,
        status: 'NEW',
        createdAt: new Date(now.getTime() - 1800000) // 30 minutes ago
      }
    ];
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}
