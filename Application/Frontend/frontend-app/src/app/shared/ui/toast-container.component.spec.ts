import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ToastContainerComponent } from './toast-container.component';
import { ToastService } from '../services/toast.service';

describe('ToastContainerComponent', () => {
  let fixture: ComponentFixture<ToastContainerComponent>;
  let toasts: ToastService;
  let page: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    toasts = TestBed.inject(ToastService);
    fixture = TestBed.createComponent(ToastContainerComponent);
    page = fixture.nativeElement;
    toasts.show({ tone: 'negative', icon: 'M0 0', kind: 'Order rejected', title: 'Order rejected: TSLA', message: 'Insufficient funds.' });
    fixture.detectChanges();
  });

  afterEach(() => toasts.clear());

  it('shows the toast in a polite live region, with its kind for screen readers', () => {
    const region = page.querySelector('[data-testid="toasts"]')!;
    expect(region.getAttribute('aria-live')).toBe('polite');
    const toast = page.querySelector('[data-testid="toast"]')!;
    expect(toast.textContent).toContain('Order rejected:');
    expect(toast.textContent).toContain('Order rejected: TSLA');
    expect(toast.textContent).toContain('Insufficient funds.');
  });

  it('links the toast to the inbox', () => {
    expect(page.querySelector('[data-testid="toast-open"]')?.getAttribute('href')).toBe('/notifications');
  });

  it('closes when its close button is pressed, and names what it closes', () => {
    const close = page.querySelector<HTMLButtonElement>('[data-testid="toast-close"]')!;
    expect(close.getAttribute('aria-label')).toBe('Dismiss: Order rejected: TSLA');

    close.click();
    fixture.detectChanges();

    expect(page.querySelector('[data-testid="toast"]')).toBeNull();
  });

  it('holds the toast while the pointer is over it', () => {
    spyOn(toasts, 'pause').and.callThrough();
    spyOn(toasts, 'resume').and.callThrough();
    const toast = page.querySelector('[data-testid="toast"]')!;

    toast.dispatchEvent(new Event('mouseenter'));
    toast.dispatchEvent(new Event('mouseleave'));

    const id = toasts.toasts()[0].id;
    expect(toasts.pause).toHaveBeenCalledWith(id);
    expect(toasts.resume).toHaveBeenCalledWith(id);
  });
});
