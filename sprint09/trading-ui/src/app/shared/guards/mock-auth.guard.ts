import { Injectable } from '@angular/core';
import { Router, CanActivateFn, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { MockAuthService } from '../services/mock-auth.service';

export const mockAuthGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const authService = new MockAuthService();
  const router = new Router();

  if (authService.isAuthenticated()) {
    return true;
  }

  // Redirect to login with return URL
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export const mockAdminGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const authService = new MockAuthService();
  const router = new Router();

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }

  const user = authService.getCurrentUser();
  if (user && user.roles.includes('ADMIN')) {
    return true;
  }

  // Redirect to dashboard if not admin
  return router.createUrlTree(['/dashboard']);
};
