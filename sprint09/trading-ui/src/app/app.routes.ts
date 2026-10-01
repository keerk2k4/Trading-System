import { Routes } from '@angular/router';
import { RegisterComponent } from './features/auth/register/register.component';
import { LoginComponent } from './features/auth/login/login.component';
import { KycFormComponent } from './features/auth/kyc/kyc-form.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { PlaceOrderComponent } from './features/orders/place-order/place-order.component';
import { ViewOrdersComponent } from './features/orders/view-orders/view-orders.component';
import { AdminDashboardComponent } from './features/admin/admin-dashboard.component';
import { KycReviewListComponent } from './features/admin/kyc-review/kyc-review-list.component';
import { mockAuthGuard, mockAdminGuard } from './shared/guards/mock-auth.guard';
import { kycApprovalGuard } from './shared/guards/kyc-approval.guard';

// Every screen except sign-in/sign-up must have a canActivate guard, so a
// signed-out visitor is redirected to sign-in (with a returnUrl) rather than
// shown an empty screen. When adding a route, add mockAuthGuard or
// mockAdminGuard to it.
export const routes: Routes = [
  // Public routes
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'register', component: RegisterComponent },
  { path: 'login', component: LoginComponent },
  // isAdmin tells LoginComponent to call POST /auth/admin/login instead of
  // POST /auth/login - the real backend treats these as separate endpoints.
  { path: 'admin-login', component: LoginComponent, data: { isAdmin: true } },

  // Authenticated routes (user flow)
  { path: 'kyc-submission', component: KycFormComponent, canActivate: [mockAuthGuard] },
  { path: 'dashboard', component: DashboardComponent, canActivate: [mockAuthGuard, kycApprovalGuard] },
  { path: 'orders/new', component: PlaceOrderComponent, canActivate: [mockAuthGuard, kycApprovalGuard] },
  { path: 'orders/history', component: ViewOrdersComponent, canActivate: [mockAuthGuard, kycApprovalGuard] },

  // Admin routes
  { path: 'admin/dashboard', component: AdminDashboardComponent, canActivate: [mockAdminGuard] },
  { path: 'admin/kyc-review', component: KycReviewListComponent, canActivate: [mockAdminGuard] },

  // Fallback
  { path: '**', redirectTo: '/login' }
];
