import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { RegisterComponent } from './register.component';
import { API_CONFIG } from '../../../core/config/api-config';

describe('RegisterComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('blocks a password shorter than 12 characters', () => {
    const fixture = TestBed.createComponent(RegisterComponent);
    const component = fixture.componentInstance;

    component.form.setValue({ username: 'new.user', password: 'short' });
    component.submit();

    httpMock.expectNone(`${API_CONFIG.authApiBaseUrl}/auth/register`);
    expect(component.form.controls.password.invalid).toBe(true);
  });

  it('shows AUTH-409 as "username already taken"', () => {
    const fixture = TestBed.createComponent(RegisterComponent);
    const component = fixture.componentInstance;

    component.form.setValue({ username: 'existing.user', password: 'correct horse battery staple' });
    component.submit();

    const req = httpMock.expectOne(`${API_CONFIG.authApiBaseUrl}/auth/register`);
    req.flush({ errorCode: 'AUTH-409', message: 'Registration failed' }, { status: 409, statusText: 'Conflict' });

    expect(component.errorMessage()).toBe('That username is already taken.');
  });
});
