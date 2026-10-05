import { Injectable, inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { MockKycService } from '../services/kyc.service';

/**
 * Guard that ensures user has approved KYC before accessing trading features
 * Redirects to /kyc-submission if KYC is PENDING or not submitted
 */
export const kycApprovalGuard: CanActivateFn = (route, state) => {
  const kycService = inject(MockKycService);
  const router = inject(Router);

  const kycStatus = kycService.getCurrentUserKycStatus();

  // Only allow if KYC is APPROVED
  if (kycStatus === 'APPROVED') {
    return true;
  }

  // Redirect to KYC submission if not approved. Returned as a UrlTree (not
  // router.navigate() + false) so the redirect can't be dropped, leaving the
  // user on a blank screen.
  return router.createUrlTree(['/kyc-submission'], {
    queryParams: { returnUrl: state.url }
  });
};
