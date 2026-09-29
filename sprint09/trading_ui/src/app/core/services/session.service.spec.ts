import { TestBed } from '@angular/core/testing';
import { SessionService } from './session.service';

describe('SessionService', () => {
  let service: SessionService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(SessionService);
  });

  it('starts signed out', () => {
    expect(service.isSignedIn()).toBe(false);
  });

  it('setTokens signs the session in', () => {
    service.setTokens({ accessToken: 'a', refreshToken: 'r' });
    expect(service.isSignedIn()).toBe(true);
    expect(service.accessToken()).toBe('a');
  });

  it('signing out clears the session', () => {
    service.setTokens({ accessToken: 'a', refreshToken: 'r' });
    service.clear();
    expect(service.isSignedIn()).toBe(false);
    expect(service.accessToken()).toBeNull();
  });
});
