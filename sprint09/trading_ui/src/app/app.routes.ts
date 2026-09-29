import { Routes } from '@angular/router';

/**
 * Only the four screens built so far are routed here: register, login,
 * admin login, and KYC submission. There is deliberately no route guard on
 * `/kyc` yet — see the "Route Guards and the Return Address" story, which
 * still needs a real CanActivateFn that redirects an unauthenticated visit
 * to `/login` carrying a same-origin-validated return address. The KYC
 * screen only checks SessionService.isSignedIn() inline and shows a message;
 * that is a usability nicety, not the guard.
 */
export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'register',
    loadComponent: () =>
      import('./features/auth/register/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'admin/login',
    loadComponent: () =>
      import('./features/auth/admin-login/admin-login.component').then((m) => m.AdminLoginComponent),
  },
  {
    path: 'kyc',
    loadComponent: () =>
      import('./features/kyc/kyc-form/kyc-form.component').then((m) => m.KycFormComponent),
  },
  { path: '**', redirectTo: 'login' },
];
