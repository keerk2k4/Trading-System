import { Routes } from '@angular/router';

export const routes: Routes = [
  // Routes will be populated in Phase 3 with components
  // - login
  // - dashboard (with authGuard)
  // - orders/new (with authGuard)
  // - orders/history (with authGuard)
  {
    path: '**',
    redirectTo: ''
  }
];
