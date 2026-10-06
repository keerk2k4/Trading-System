import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, of, throwError } from 'rxjs';
import { HealthDetailsResponse, HealthService as AuthHealthApi } from '../../../generated/auth-admin-client';
import { AdminHealthResponse, AdminService as TradeAdminApi } from '../../../generated/trade-admin-client';
import { ServiceHealthService, formatUptime } from './service-health.service';

describe('ServiceHealthService', () => {
  let authHealth: jasmine.SpyObj<AuthHealthApi>;
  let tradeAdmin: jasmine.SpyObj<TradeAdminApi>;
  let service: ServiceHealthService;

  const authUp: HealthDetailsResponse = {
    status: 'UP',
    checkedAt: '2026-10-06T10:00:00.000Z',
    uptimeSeconds: 7_500,
    components: {
      database: { status: 'UP', responseMs: 4 }
    }
  };
  const tradeUp: AdminHealthResponse = {
    overall: 'UP',
    checkedAt: '2026-10-06T10:00:00Z',
    services: [
      { name: 'Trade API', status: 'UP', responseMs: 3, detail: 'Running; database answered' },
      { name: 'Kafka', status: 'UP', responseMs: 35, detail: '1 broker reachable' },
      { name: 'Trade Executor', status: 'UP', responseMs: 12, detail: 'Responded in 12 ms' }
    ]
  };
  const httpError = (status: number) => new HttpErrorResponse({ status });

  beforeEach(() => {
    authHealth = jasmine.createSpyObj<AuthHealthApi>('AuthHealthApi', ['getHealthDetails']);
    tradeAdmin = jasmine.createSpyObj<TradeAdminApi>('TradeAdminApi', ['getPlatformHealth']);
    authHealth.getHealthDetails.and.returnValue(of(authUp) as never);
    tradeAdmin.getPlatformHealth.and.returnValue(of(tradeUp) as never);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthHealthApi, useValue: authHealth },
        { provide: TradeAdminApi, useValue: tradeAdmin }
      ]
    });
    service = TestBed.inject(ServiceHealthService);
  });

  it('reports every service, in a fixed order, as operational when all are up', async () => {
    const view = await firstValueFrom(service.check());

    expect(view.overall).toBe('UP');
    expect(view.services.map((s) => s.name)).toEqual(['Auth service', 'Trade API', 'Kafka', 'Trade Executor']);
    expect(view.services[0].facts).toEqual([{ label: 'Running for', value: '2 h 5 min' }]);
    expect(view.services[0].checkedBy).toBe('Checked directly');
    expect(view.services[2].checkedBy).toBe('Checked by the Trade API');
  });

  it('marks the Trade API down and what it reports on as unknown when it cannot be reached', async () => {
    tradeAdmin.getPlatformHealth.and.returnValue(throwError(() => httpError(0)));

    const view = await firstValueFrom(service.check());

    expect(view.overall).toBe('DEGRADED');
    expect(view.services[0].status).toBe('UP');
    expect(view.services[1]).toEqual(jasmine.objectContaining({ name: 'Trade API', status: 'DOWN', detail: 'Not reachable' }));
    expect(view.services[2]).toEqual(
      jasmine.objectContaining({ name: 'Kafka', status: 'UNKNOWN', detail: 'Reported by the Trade API, which is not answering' })
    );
    expect(view.services[3].status).toBe('UNKNOWN');
  });

  it('shows the Auth service as degraded, with the database reason, when only its database is failing', async () => {
    authHealth.getHealthDetails.and.returnValue(
      of({
        ...authUp,
        status: 'DOWN',
        components: { ...authUp.components, database: { status: 'DOWN', responseMs: null, detail: 'No response within 2 s' } }
      }) as never
    );

    const auth = (await firstValueFrom(service.check())).services[0];

    expect(auth.status).toBe('DEGRADED');
    expect(auth.detail).toBe('Running, but its database is not answering (No response within 2 s)');
    expect(auth.responseMs).toBeNull();
  });

  it('passes on a degraded Executor and its reason as the Trade API reports them', async () => {
    tradeAdmin.getPlatformHealth.and.returnValue(
      of({
        ...tradeUp,
        overall: 'DEGRADED',
        services: [
          tradeUp.services[0],
          { name: 'Kafka', status: 'DOWN', responseMs: null, detail: 'Broker unreachable' },
          { name: 'Trade Executor', status: 'DEGRADED', responseMs: 9, detail: "Running, but can't reach Kafka" }
        ]
      }) as never
    );

    const view = await firstValueFrom(service.check());

    expect(view.overall).toBe('DEGRADED');
    expect(view.services[3]).toEqual(
      jasmine.objectContaining({ status: 'DEGRADED', detail: "Running, but can't reach Kafka" })
    );
  });

  it('asks the admin to sign in again when a service refuses the token', async () => {
    authHealth.getHealthDetails.and.returnValue(throwError(() => httpError(403)));

    const auth = (await firstValueFrom(service.check())).services[0];

    expect(auth.status).toBe('UNKNOWN');
    expect(auth.detail).toContain('Sign in again as an admin');
  });

  it('reports a server error as down with its status code', async () => {
    authHealth.getHealthDetails.and.returnValue(throwError(() => httpError(500)));

    const auth = (await firstValueFrom(service.check())).services[0];

    expect(auth).toEqual(jasmine.objectContaining({ status: 'DOWN', detail: 'Answered with an error (HTTP 500)' }));
  });

  it('formats uptime for a person to read', () => {
    expect(formatUptime(42)).toBe('42 s');
    expect(formatUptime(600)).toBe('10 min');
    expect(formatUptime(7_500)).toBe('2 h 5 min');
    expect(formatUptime(90_000)).toBe('1 d 1 h');
  });
});
