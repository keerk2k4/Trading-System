import { TestBed } from '@angular/core/testing';
import { MAX_TOASTS, TOAST_DURATION_MS, ToastInput, ToastService } from './toast.service';

describe('ToastService', () => {
  let toasts: ToastService;
  const input = (title: string): ToastInput => ({ tone: 'positive', icon: 'M0 0', kind: 'Order filled', title, message: 'm' });
  const titles = () => toasts.toasts().map((t) => t.title);

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-10-07T12:00:00Z'));
    toasts = TestBed.inject(ToastService);
  });

  afterEach(() => {
    toasts.clear();
    jasmine.clock().uninstall();
  });

  it('puts the newest toast on top', () => {
    toasts.show(input('first'));
    toasts.show(input('second'));

    expect(titles()).toEqual(['second', 'first']);
  });

  it('closes a toast by itself after its time is up', () => {
    toasts.show(input('first'));

    jasmine.clock().tick(TOAST_DURATION_MS - 1);
    expect(titles()).toEqual(['first']);
    jasmine.clock().tick(1);
    expect(titles()).toEqual([]);
  });

  it('holds a paused toast and gives it the time it had left when resumed', () => {
    toasts.show(input('first'));
    const id = toasts.toasts()[0].id;

    jasmine.clock().tick(4000);
    toasts.pause(id);
    jasmine.clock().tick(60_000);
    expect(titles()).toEqual(['first']);

    toasts.resume(id);
    jasmine.clock().tick(TOAST_DURATION_MS - 4000 - 1);
    expect(titles()).toEqual(['first']);
    jasmine.clock().tick(1);
    expect(titles()).toEqual([]);
  });

  it(`keeps at most ${MAX_TOASTS} on screen, dropping the oldest`, () => {
    for (const title of ['1', '2', '3', '4']) {
      toasts.show(input(title));
    }

    expect(titles()).toEqual(['4', '3', '2']);
  });

  it('closes a toast on request', () => {
    toasts.show(input('first'));
    toasts.dismiss(toasts.toasts()[0].id);

    expect(titles()).toEqual([]);
  });
});
