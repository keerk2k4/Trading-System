import { Notification } from '../models/order.models';

export type NotificationTone = 'positive' | 'negative' | 'warning' | 'accent';

export interface NotificationKind {
  /** The kind in words, read out before the title. */
  label: string;
  tone: NotificationTone;
  /** SVG path for a 20x20 stroked icon. */
  icon: string;
}

/**
 * How each kind of notification is drawn, shared by the inbox and the toasts
 * so the two always match.
 */
const KINDS: Record<string, NotificationKind> = {
  ORDER_FILLED: { label: 'Order filled', tone: 'positive', icon: 'M4 10.5l3.5 3.5L16 6' },
  ORDER_REJECTED: { label: 'Order rejected', tone: 'negative', icon: 'M5.5 5.5l9 9m0-9l-9 9' },
  ORDER_CANCELLED: { label: 'Order cancelled', tone: 'warning', icon: 'M5 10h10' },
  PRICE_ALERT: {
    label: 'Price alert',
    tone: 'accent',
    icon: 'M10 3a4.5 4.5 0 0 0-4.5 4.5c0 4-1.5 5.5-1.5 5.5h12s-1.5-1.5-1.5-5.5A4.5 4.5 0 0 0 10 3ZM8.5 15.5a1.5 1.5 0 0 0 3 0'
  }
};

const FALLBACK: NotificationKind = { label: 'Notification', tone: 'accent', icon: 'M10 6v5m0 3h.01' };

export function notificationKind(notification: Pick<Notification, 'type'>): NotificationKind {
  return KINDS[notification.type] ?? FALLBACK;
}
