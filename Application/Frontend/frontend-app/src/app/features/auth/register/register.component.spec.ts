import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { RegisterComponent } from './register.component';
import { MockAuthService } from '../../../shared/services/mock-auth.service';
import { UserResponseData } from '../../../shared/models/auth.models';

const PASSWORD = 'correct horse battery staple';

describe('RegisterComponent', () => {
  let auth: jasmine.SpyObj<MockAuthService>;
  let fixture: ComponentFixture<RegisterComponent>;
  let page: HTMLElement;

  const input = (id: string) => page.querySelector<HTMLInputElement>(`#${id}`)!;
  const errorText = (id: string) => page.querySelector(`#${id}-error`)?.textContent?.trim();

  function type(id: string, value: string): void {
    input(id).value = value;
    input(id).dispatchEvent(new Event('input'));
  }

  function fill(
    username: string,
    email: string,
    firstName: string,
    lastName: string,
    phone: string,
    password: string,
    confirmPassword: string
  ): void {
    type('register-username', username);
    type('register-email', email);
    type('register-first-name', firstName);
    type('register-last-name', lastName);
    type('register-phone', phone);
    type('register-password', password);
    type('register-confirm-password', confirmPassword);
  }

  function submit(): void {
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  beforeEach(() => {
    auth = jasmine.createSpyObj<MockAuthService>('MockAuthService', ['register']);
    auth.register.and.returnValue(of({ id: 'user-1', username: 'gaurang123', roles: ['CUSTOMER'] }));

    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: MockAuthService, useValue: auth }]
    });
    fixture = TestBed.createComponent(RegisterComponent);
    page = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('offers no role selector and links to the login page', () => {
    expect(page.querySelector('h1')?.textContent).toContain('Create your account');
    expect(page.querySelectorAll('input').length).toBe(6);
    expect(page.querySelector('select')).toBeNull();
    expect(page.querySelector('a[href="/login"]')).not.toBeNull();
  });

  it('stays quiet until a field has been visited', () => {
    type('register-username', 'ab');
    fixture.detectChanges();
    expect(errorText('register-username')).toBeUndefined();

    input('register-username').dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(errorText('register-username')).toBe('Username must be at least 3 characters.');
    expect(input('register-username').getAttribute('aria-describedby')).toContain('register-username-error');
  });

  it('reports every invalid field on submit without calling the API', () => {
    fill('bad name!', 'bad', '', '', '123', 'too short', 'different');
    submit();

    expect(auth.register).not.toHaveBeenCalled();
    expect(errorText('register-username')).toBe('Use only letters, numbers, dots, dashes and underscores.');
    expect(errorText('register-email')).toBe('Enter a valid email address.');
    expect(errorText('register-first-name')).toBe('Enter your first name.');
    expect(errorText('register-last-name')).toBe('Enter your last name.');
    expect(errorText('register-phone')).toBe('Enter a valid phone number in international format.');
    expect(errorText('register-password')).toBe('Password must be at least 12 characters.');
    expect(errorText('register-confirm-password')).toBe('Passwords do not match.');
    expect(document.activeElement).toBe(input('register-username'));
  });

  it('re-checks the confirmation when the password is edited afterwards', () => {
    fill('gaurang123', 'gaurang@example.com', 'Gaurang', 'Patel', '+919900112233', PASSWORD, PASSWORD);
    type('register-password', `${PASSWORD}!`);
    submit();

    expect(auth.register).not.toHaveBeenCalled();
    expect(errorText('register-confirm-password')).toBe('Passwords do not match.');
  });

  it('sends the register payload without the confirmation field', () => {
    fill('gaurang123', 'gaurang@example.com', 'Gaurang', 'Patel', '+919900112233', PASSWORD, PASSWORD);
    submit();

    expect(auth.register).toHaveBeenCalledOnceWith({
      username: 'gaurang123',
      email: 'gaurang@example.com',
      firstName: 'Gaurang',
      lastName: 'Patel',
      phone: '+919900112233',
      password: PASSWORD
    });
  });

  it('shows a success state with a path to the login page', async () => {
    fill('gaurang123', 'gaurang@example.com', 'Gaurang', 'Patel', '+919900112233', PASSWORD, PASSWORD);
    submit();
    await fixture.whenStable();

    const heading = page.querySelector('h1')!;
    expect(heading.textContent).toContain('Account created');
    expect(document.activeElement).toBe(heading);
    expect(page.querySelector('form')).toBeNull();
    expect(page.querySelector('[role="status"]')?.textContent).toContain('gaurang123');
    expect(page.querySelector('a.tp-btn[href="/login"]')?.textContent).toContain('Continue to sign in');
  });

  it('reports a taken username on the username field', () => {
    auth.register.and.returnValue(
      throwError(() => ({ errorCode: 'AUTH-409', message: 'Username already registered', status: 409 }))
    );
    fill('gaurang123', 'gaurang@example.com', 'Gaurang', 'Patel', '+919900112233', PASSWORD, PASSWORD);
    submit();

    expect(errorText('register-username')).toBe('This username is already taken. Please choose another.');
    expect(input('register-username').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(input('register-username'));
    expect(page.querySelector('form')).not.toBeNull();
  });

  it('shows a friendly message when the backend rejects the input', () => {
    auth.register.and.returnValue(throwError(() => ({ errorCode: 'VAL-422', message: 'Invalid input', status: 422 })));
    fill('gaurang123', 'gaurang@example.com', 'Gaurang', 'Patel', '+919900112233', PASSWORD, PASSWORD);
    submit();

    const alert = page.querySelector('[role="alert"]')?.textContent;
    expect(alert).toContain('Those details were not accepted');
    expect(alert).not.toContain('Invalid input');
  });

  it('shows a loading state and ignores a second submit while registering', () => {
    auth.register.and.returnValue(new Subject<UserResponseData>());
    fill('gaurang123', 'gaurang@example.com', 'Gaurang', 'Patel', '+919900112233', PASSWORD, PASSWORD);
    submit();
    submit();

    const button = page.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(auth.register).toHaveBeenCalledTimes(1);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.textContent).toContain('Creating account');
  });
});
