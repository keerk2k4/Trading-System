import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { AdminLoginComponent } from './admin-login.component';
import { API_CONFIG } from '../../../core/config/api-config';
import { SessionService } from '../../../core/services/session.service';

describe('AdminLoginComponent', () => {
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminLoginComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    TestBed.inject(SessionService).clear();
  });

  afterEach(() => httpMock.verify());

  it('posts to /auth/admin/login, not /auth/login', () => {
    const fixture = TestBed.createComponent(AdminLoginComponent);
    const component = fixture.componentInstance;

    component.form.setValue({ username: 'ops.admin', password: 'correct horse battery staple' });
    component.submit();

    httpMock.expectOne(`${API_CONFIG.authApiBaseUrl}/auth/admin/login`);
  });

  it('a non-admin credential shows the same unauthorised message', () => {
    const fixture = TestBed.createComponent(AdminLoginComponent);
    const component = fixture.componentInstance;

    component.form.setValue({ username: 'regular.customer', password: 'correct horse battery staple' });
    component.submit();

    const req = httpMock.expectOne(`${API_CONFIG.authApiBaseUrl}/auth/admin/login`);
    req.flush({ errorCode: 'AUTH-401', message: 'Unauthorised' }, { status: 401, statusText: 'Unauthorized' });

    expect(component.errorMessage()).toBe('The session has expired, or the sign-in was refused.');
  });
});
