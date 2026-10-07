import { Routes } from '@angular/router';
import { AppShellComponent } from './shared/layout/app-shell.component';
import { mockAuthGuard, mockAdminGuard } from './shared/guards/auth.guard';
import { kycApprovalGuard } from './shared/guards/kyc-approval.guard';

// Every screen except sign-in/sign-up must have a canActivate guard, so a
// signed-out visitor is redirected to sign-in (with a returnUrl) rather than
// shown an empty screen. When adding a route, add mockAuthGuard or
// mockAdminGuard to it.
export const routes: Routes = [
  // Public routes
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  {
    path: 'register',
    title: 'Create account · Trading Platform',
    loadComponent: () =>
      import('./features/auth/register/register.component').then((m) => m.RegisterComponent)
  },
  {
    path: 'login',
    title: 'Sign in · Trading Platform',
    loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent)
  },
  {
    path: 'forgot-password',
    title: 'Reset password · Trading Platform',
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password.component').then((m) => m.ForgotPasswordComponent)
  },
  // isAdmin tells LoginComponent to call POST /auth/admin/login instead of
  // POST /auth/login - the real backend treats these as separate endpoints.
  {
    path: 'admin-login',
    title: 'Admin sign in · Trading Platform',
    loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent),
    data: { isAdmin: true }
  },

  // Authenticated routes (user flow), inside the application shell
  {
    path: '',
    component: AppShellComponent,
    canActivate: [mockAuthGuard],
    children: [
      {
        path: 'kyc-submission',
        title: 'Verification · Trading Platform',
        loadComponent: () =>
          import('./features/auth/kyc/kyc-form.component').then((m) => m.KycFormComponent)
      },
      {
        path: 'dashboard',
        title: 'Dashboard · Trading Platform',
        canActivate: [kycApprovalGuard],
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent)
      },
      {
        path: 'portfolio',
        title: 'Portfolio · Trading Platform',
        canActivate: [kycApprovalGuard],
        loadComponent: () =>
          import('./features/portfolio/portfolio.component').then((m) => m.PortfolioComponent)
      },
      {
        path: 'orders/new',
        title: 'Place order · Trading Platform',
        canActivate: [kycApprovalGuard],
        loadComponent: () =>
          import('./features/orders/place-order/place-order.component').then((m) => m.PlaceOrderComponent)
      },
      {
        path: 'orders/history',
        title: 'Orders · Trading Platform',
        canActivate: [kycApprovalGuard],
        loadComponent: () =>
          import('./features/orders/view-orders/view-orders.component').then((m) => m.ViewOrdersComponent)
      },
      {
        path: 'strategies',
        title: 'Strategies · Trading Platform',
        canActivate: [kycApprovalGuard],
        loadComponent: () =>
          import('./features/strategies/strategies.component').then((m) => m.StrategiesComponent)
      },
      {
        path: 'funds',
        title: 'Funds · Trading Platform',
        canActivate: [kycApprovalGuard],
        loadComponent: () =>
          import('./features/funds/funds.component').then((m) => m.FundsComponent)
      },
      {
        path: 'watchlist',
        title: 'Watchlist · Trading Platform',
        canActivate: [kycApprovalGuard],
        loadComponent: () =>
          import('./features/watchlist/watchlist.component').then((m) => m.WatchlistComponent)
      },
      {
        path: 'positions',
        title: 'Positions · Trading Platform',
        canActivate: [kycApprovalGuard],
        loadComponent: () =>
          import('./features/portfolio/positions.component').then((m) => m.PositionsComponent)
      },
      {
        path: 'holdings',
        title: 'Holdings · Trading Platform',
        canActivate: [kycApprovalGuard],
        loadComponent: () =>
          import('./features/portfolio/holdings.component').then((m) => m.HoldingsComponent)
      },
      {
        path: 'notifications',
        title: 'Notifications · Trading Platform',
        canActivate: [kycApprovalGuard],
        loadComponent: () =>
          import('./features/notifications/notifications.component').then((m) => m.NotificationsComponent)
      },
      {
        path: 'settings',
        title: 'Settings · Trading Platform',
        canActivate: [kycApprovalGuard],
        loadComponent: () =>
          import('./features/settings/settings.component').then((m) => m.SettingsComponent)
      }
    ]
  },

  // Admin routes, inside the same shell
  {
    path: 'admin',
    component: AppShellComponent,
    canActivate: [mockAdminGuard],
    children: [
      {
        path: 'dashboard',
        title: 'Admin overview · Trading Platform',
        loadComponent: () =>
          import('./features/admin/admin-dashboard.component').then((m) => m.AdminDashboardComponent)
      },
      {
        path: 'kyc-review',
        title: 'KYC review · Trading Platform',
        loadComponent: () =>
          import('./features/admin/kyc-review/kyc-review-list.component').then((m) => m.KycReviewListComponent)
      },
      {
        path: 'health',
        title: 'Service health · Trading Platform',
        loadComponent: () =>
          import('./features/admin/service-health/service-health.component').then((m) => m.ServiceHealthComponent)
      },
      {
        path: 'customers',
        title: 'Customers · Trading Platform',
        loadComponent: () =>
          import('./features/admin/customers/customer-list.component').then((m) => m.CustomerListComponent)
      },
      {
        path: 'customers/:accountId',
        title: 'Customer account · Trading Platform',
        loadComponent: () =>
          import('./features/admin/customers/customer-detail.component').then((m) => m.CustomerDetailComponent)
      }
    ]
  },

  // Fallback
  { path: '**', redirectTo: '/login' }
];
