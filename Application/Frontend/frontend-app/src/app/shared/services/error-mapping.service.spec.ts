import { ErrorMappingService } from './error-mapping.service';

// Completeness check for the error catalogue: every errorCode declared in
// contracts/trade-api.yaml and contracts/auth-api.yaml must render as a
// readable, code-specific sentence - never the generic fallback.
const FALLBACK = 'An unexpected error occurred. Please try again or contact support.';

// Every code in both contracts, with a word the message must contain.
const CATALOGUE: Record<string, RegExp> = {
  'ACC-404': /account could not be found/i,
  'ACC-403': /not active|not authorized/i,
  'INS-404': /instrument/i,
  'ORD-400': /not enough cash/i,
  'ORD-409': /holdings|already been placed/i,
  'VAL-422': /field/i,
  'AUTH-401': /session|sign-in/i,
  'AUTH-409': /username is already taken/i,
  // Declared in contracts/auth-api.yaml for the KYC endpoints.
  'AUTH-403': /not allowed/i,
  'KYC-404': /could not find your identity verification/i,
  'KYC-409': /already been submitted or approved/i
};

describe('ErrorMappingService', () => {
  let service: ErrorMappingService;

  beforeEach(() => {
    service = new ErrorMappingService();
  });

  for (const [code, meaning] of Object.entries(CATALOGUE)) {
    it(`renders ${code} as its own readable message`, () => {
      const message = service.getErrorMessage(code);

      expect(message).not.toBe(FALLBACK);
      expect(message).toMatch(meaning);
      expect(service.isUnknownError(code)).toBeFalse();
    });
  }

  it('falls back to a sentence, never a blank, for a code it has never seen', () => {
    expect(service.getErrorMessage('XYZ-999')).toBe(FALLBACK);
    expect(service.getErrorMessage('')).toBe(FALLBACK);
    expect(service.isUnknownError('XYZ-999')).toBeTrue();
  });

  it('treats status 0 as a network failure with its own message', () => {
    expect(service.isNetworkError(0)).toBeTrue();
    expect(service.isNetworkError(500)).toBeFalse();
    expect(service.getNetworkErrorMessage()).toMatch(/unable to connect/i);
  });
});
