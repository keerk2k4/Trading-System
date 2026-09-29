import { HttpErrorResponse } from '@angular/common/http';
import { ErrorResponse } from '../models/auth.models';

/**
 * Reads a readable sentence off an HTTP error for the four screens built so
 * far (register, login, admin login, KYC submission).
 *
 * This is NOT the "Render Every Code in the Error Catalogues" story. That
 * story requires a single mapping covering every code in BOTH contracts
 * (trade-api.yaml and auth-api.yaml — eight codes in total), built as a
 * completeness-checked table, with its own three named unit tests. This
 * function only covers the codes the four screens built here can actually
 * receive from auth-service, plus the two universal fallbacks (status 0,
 * and an unrecognised code) — extend it into the real catalogue mapping
 * rather than building a second one alongside it.
 */
const KNOWN_AUTH_CODES: Record<string, string> = {
  'AUTH-401': 'The session has expired, or the sign-in was refused.',
  'AUTH-403': 'This account is not allowed to do that.',
  'AUTH-409': 'That username is already taken.',
  'VAL-422': 'One of the fields on this form is not acceptable.',
  'KYC-409': 'KYC details have already been submitted for this account.',
  'KYC-404': 'No KYC submission was found.',
};

export function readableAuthErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'Could not reach the sign-in service. Check that it is running and reachable from this browser.';
    }

    const body = error.error as ErrorResponse | undefined;
    if (body?.errorCode && KNOWN_AUTH_CODES[body.errorCode]) {
      return KNOWN_AUTH_CODES[body.errorCode];
    }
    if (body?.errorCode) {
      return `Something went wrong (${body.errorCode}). Please try again.`;
    }
  }

  return 'Something went wrong. Please try again.';
}
