import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { HealthService as AuthHealthApi } from '../../../generated/auth-admin-client';
import { AdminService as TradeAdminApi } from '../../../generated/trade-admin-client';
import { PlatformHealthView, ServiceCard } from '../models/service-health.models';

const DIRECT = 'Checked directly';
const VIA_TRADE_API = 'Checked by the Trade API';
const SIGN_IN_AGAIN = 'This sign-in cannot read service health. Sign in again as an admin.';

/**
 * Asks both services for the platform's health and turns the answers into one
 * card per service.
 *
 * The Auth service is asked directly (GET /health/details). The Trade API
 * reports on itself, Kafka and the Trade Executor (GET /api/v1/admin/health),
 * which the browser never reaches. Either call failing still yields a full set
 * of cards, so the screen never goes blank because one service is down.
 */
@Injectable({
  providedIn: 'root'
})
export class ServiceHealthService {
  private readonly authHealth = inject(AuthHealthApi);
  private readonly tradeAdmin = inject(TradeAdminApi);

  check(): Observable<PlatformHealthView> {
    return forkJoin({ auth: this.authCard(), trade: this.tradeCards() }).pipe(
      map(({ auth, trade }) => {
        const services = [auth, ...trade];
        return {
          overall: services.every((service) => service.status === 'UP') ? 'UP' : 'DEGRADED',
          checkedAt: new Date(),
          services
        };
      })
    );
  }

  private authCard(): Observable<ServiceCard> {
    return this.authHealth.getHealthDetails().pipe(
      map((details): ServiceCard => {
        const database = details.components.database;
        return {
          name: 'Auth service',
          // It answered, so it is running: a failing database is degraded, not down.
          status: details.status === 'UP' ? 'UP' : 'DEGRADED',
          responseMs: database.responseMs,
          detail:
            details.status === 'UP'
              ? 'Running; database answered'
              : `Running, but its database is not answering${database.detail ? ` (${database.detail})` : ''}`,
          checkedBy: DIRECT,
          facts: [{ label: 'Running for', value: formatUptime(details.uptimeSeconds) }]
        };
      }),
      catchError((err: HttpErrorResponse) => of(failedCard('Auth service', err)))
    );
  }

  private tradeCards(): Observable<ServiceCard[]> {
    return this.tradeAdmin.getPlatformHealth().pipe(
      map((report) =>
        report.services.map(
          (service): ServiceCard => ({
            name: service.name,
            status: service.status,
            responseMs: service.responseMs,
            detail: service.detail,
            checkedBy: service.name === 'Trade API' ? DIRECT : VIA_TRADE_API,
            facts: []
          })
        )
      ),
      catchError((err: HttpErrorResponse) => {
        // Kafka and the Executor are only ever seen through the Trade API, so
        // without its answer their state is unknown, not down.
        const unknown = isRefused(err) ? SIGN_IN_AGAIN : 'Reported by the Trade API, which is not answering';
        return of([
          failedCard('Trade API', err),
          unknownCard('Kafka', unknown),
          unknownCard('Trade Executor', unknown)
        ]);
      })
    );
  }
}

function isRefused(err: HttpErrorResponse): boolean {
  return err.status === 401 || err.status === 403;
}

function failedCard(name: string, err: HttpErrorResponse): ServiceCard {
  if (isRefused(err)) {
    return unknownCard(name, SIGN_IN_AGAIN, DIRECT);
  }
  return {
    name,
    status: 'DOWN',
    responseMs: null,
    // Status 0: the browser got no answer at all (stopped, or blocked by CORS).
    detail: err.status === 0 ? 'Not reachable' : `Answered with an error (HTTP ${err.status})`,
    checkedBy: DIRECT,
    facts: []
  };
}

function unknownCard(name: string, detail: string, checkedBy = VIA_TRADE_API): ServiceCard {
  return { name, status: 'UNKNOWN', responseMs: null, detail, checkedBy, facts: [] };
}

export function formatUptime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} h ${minutes % 60} min`;
  }
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}
