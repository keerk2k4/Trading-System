import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { RegisterComponent } from './register.component';
import { MockAuthService } from '../../../shared/services/mock-auth.service';

const PASSWORD = 'correct horse battery staple';

describe('RegisterComponent', () => {
  let auth: jasmine.SpyObj<MockAuthService>;
  let fixture: ComponentFixture<RegisterComponent>;
  let page: HTMLElement;

  const errorText = (id: string) => page.querySelector(`#${id}-error`)?.textContent?.trim();

  function fill(values: Record<string, string>): void {
    for (const [id, value] of Object.entries(values)) {
      const input = page.querySelector<HTMLInputElement>(`#register-${id}`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
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

  it('reports invalid fields on submit without calling the API', () => {
    fill({
      username: 'bad name!',
      email: 'bad',
      'first-name': '',
      'last-name': '',
      phone: '123',
      password: 'too short',
      'confirm-password': 'different'
    });
    submit();

    expect(auth.register).not.toHaveBeenCalled();
    expect(errorText('register-username')).toBe('Use only letters, numbers, dots, dashes and underscores.');
    expect(errorText('register-email')).toBe('Enter a valid email address.');
    expect(errorText('register-password')).toBe('Password must be at least 12 characters.');
    expect(errorText('register-confirm-password')).toBe('Passwords do not match.');
  });

  it('sends a valid registration without the confirmation field', () => {
    fill({
      username: 'gaurang123',
      email: 'gaurang@example.com',
      'first-name': 'Gaurang',
      'last-name': 'Patel',
      phone: '+919900112233',
      password: PASSWORD,
      'confirm-password': PASSWORD
    });
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
});
