import { Injectable, inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { MockKycService } from '../services/mock-kyc.service';

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

  // Redirect to KYC submission if not approved
  router.navigate(['/kyc-submission'], {
    queryParams: { returnUrl: state.url }
  });

  return false;
};
