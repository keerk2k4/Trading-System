import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { REFRESH_MS, ServiceHealthComponent } from './service-health.component';
import { ServiceHealthService } from '../../../shared/services/service-health.service';
import { PlatformHealthView, ServiceCard } from '../../../shared/models/service-health.models';

describe('ServiceHealthComponent', () => {
  let health: jasmine.SpyObj<ServiceHealthService>;
  let fixture: ComponentFixture<ServiceHealthComponent>;
  let page: HTMLElement;
  let visibility: DocumentVisibilityState;

  const card = (name: string, status: ServiceCard['status'], detail = 'Fine'): ServiceCard => ({
    name,
    status,
    responseMs: status === 'UP' ? 5 : null,
    detail,
    checkedBy: 'Checked directly',
    facts: name === 'Auth service' ? [{ label: 'Running for', value: '2 h 5 min' }] : []
  });
  const allUp: PlatformHealthView = {
    overall: 'UP',
    checkedAt: new Date('2026-10-06T10:00:00Z'),
    services: [card('Auth service', 'UP'), card('Trade API', 'UP'), card('Kafka', 'UP'), card('Trade Executor', 'UP')]
  };
  const twoDown: PlatformHealthView = {
    ...allUp,
    overall: 'DEGRADED',
    services: [
      card('Auth service', 'UP'),
      card('Trade API', 'UP'),
      card('Kafka', 'DOWN', 'Broker unreachable'),
      card('Trade Executor', 'DEGRADED', "Running, but can't reach Kafka")
    ]
  };

  const text = (selector: string) => page.querySelector(selector)?.textContent?.trim() ?? '';
  const setVisibility = (state: DocumentVisibilityState) => {
    visibility = state;
    document.dispatchEvent(new Event('visibilitychange'));
  };

  beforeEach(() => {
    visibility = 'visible';
    spyOnProperty(document, 'visibilityState', 'get').and.callFake(() => visibility);
    health = jasmine.createSpyObj<ServiceHealthService>('ServiceHealthService', ['check']);
    health.check.and.returnValue(of(allUp));
    TestBed.configureTestingModule({ providers: [{ provide: ServiceHealthService, useValue: health }] });
  });

  // The first check is scheduled on timer(0), so it runs on the first tick.
  function create(): void {
    fixture = TestBed.createComponent(ServiceHealthComponent);
    page = fixture.nativeElement;
    fixture.detectChanges();
    tick(0);
    fixture.detectChanges();
  }

  it('shows a card per service, with its status in words, and the all-clear banner', fakeAsync(() => {
    create();

    const cards = page.querySelectorAll('[data-testid="health-card"]');
    expect(cards.length).toBe(4);
    expect(cards[0].querySelector('h2')?.textContent).toContain('Auth service');
    expect(cards[0].querySelector('[data-testid="health-status"]')?.textContent?.trim()).toBe('Up');
    expect(cards[0].textContent).toContain('Running for');
    expect(text('[data-testid="health-overall"]')).toBe('All systems operational.');
    discardPeriodicTasks();
  }));

  it('says how many services need attention and why each one does', fakeAsync(() => {
    health.check.and.returnValue(of(twoDown));
    create();

    expect(text('[data-testid="health-overall"]')).toBe('2 services need attention.');
    const kafka = page.querySelector('[data-service="Kafka"]')!;
    expect(kafka.querySelector('[data-testid="health-status"]')?.textContent?.trim()).toBe('Down');
    expect(kafka.textContent).toContain('Broker unreachable');
    const executor = page.querySelector('[data-service="Trade Executor"]')!;
    const badge = executor.querySelector('[data-testid="health-status"]')!;
    expect(badge.textContent?.trim()).toBe('Degraded');
    expect(badge.classList).toContain('tp-badge-warning');
    expect(text('[role="status"]')).toBe('2 services need attention.');
    discardPeriodicTasks();
  }));

  it('says it is checking until the first answer arrives', fakeAsync(() => {
    health.check.and.returnValue(new Subject<PlatformHealthView>());
    create();

    expect(text('[data-testid="health-loading"]')).toBe('Checking services…');
    expect(page.querySelector('[data-testid="health-check-now"]')?.getAttribute('aria-disabled')).toBe('true');
    discardPeriodicTasks();
  }));

  it('checks again every 30 seconds while the tab is visible', fakeAsync(() => {
    create();
    expect(health.check).toHaveBeenCalledTimes(1);

    tick(REFRESH_MS);
    expect(health.check).toHaveBeenCalledTimes(2);
    discardPeriodicTasks();
  }));

  it('stops checking while the tab is hidden and checks at once when it is shown again', fakeAsync(() => {
    create();
    setVisibility('hidden');
    tick(REFRESH_MS * 4);
    expect(health.check).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    tick(0);
    expect(health.check).toHaveBeenCalledTimes(2);
    discardPeriodicTasks();
  }));

  it('checks immediately when Check now is pressed', fakeAsync(() => {
    create();

    (page.querySelector('[data-testid="health-check-now"]') as HTMLButtonElement).click();

    expect(health.check).toHaveBeenCalledTimes(2);
    discardPeriodicTasks();
  }));
});
