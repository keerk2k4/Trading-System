import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ErrorMappingService {
  private readonly errorMap: { [key: string]: string } = {
    'ACC-404': 'The account could not be found.',
    'ACC-403': 'This account is not active or is not authorized for this session.',
    'INS-404': 'The instrument cannot be traded.',
    'ORD-400': 'There is not enough cash to place this order.',
    'ORD-409': 'There are not enough holdings to sell, or this order has already been placed.',
    'STR-404': 'This strategy could not be found. It may have already been triggered or cancelled.',
    'MKT-503': 'Prices are unavailable right now. Please try again shortly.',
    'VAL-422': 'A field is not acceptable. Please review and try again.',
    'AUTH-401': 'Your session has expired or sign-in was refused. Please log in again.',
    'AUTH-409': 'This username is already taken. Please choose another.',
    'AUTH-403': 'This sign-in is not allowed to do that. Sign in with a customer account and try again.',
    'KYC-404': 'We could not find your identity verification. Please submit your details.',
    'KYC-409': 'This identity verification has already been submitted or approved.',
    'PHONE-409': 'This phone number is already registered to another account.',
    'DOC-409': 'This document is already registered to another account. Check the document type and number.',
  };

  getErrorMessage(errorCode: string): string {
    return this.errorMap[errorCode] || 
      'An unexpected error occurred. Please try again or contact support.';
  }

  getNetworkErrorMessage(): string {
    return 'Unable to connect to the service. Please check your connection and try again.';
  }

  isNetworkError(status: number): boolean {
    return status === 0;
  }

  isUnknownError(errorCode: string): boolean {
    return !this.errorMap[errorCode];
  }
}
