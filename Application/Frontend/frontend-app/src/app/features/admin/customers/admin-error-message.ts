import { HttpErrorResponse } from '@angular/common/http';

/**
 * A sentence an admin can act on, for a failed customer or account call.
 * Branches on `errorCode`, never on the server's `message`.
 */
export function adminErrorMessage(err: HttpErrorResponse): string {
  if (err.status === 0) {
    return 'Unable to connect to the server. Check your connection and try again.';
  }
  switch (err.error?.errorCode) {
    case 'AUTH-401':
      return 'Your session has expired. Please sign in again.';
    case 'AUTH-403':
      return 'This page needs an admin sign-in.';
    case 'ACC-404':
      return 'That account could not be found.';
    case 'ACC-409':
      return "That status change isn't allowed from the account's current status. It may have just been changed by another admin, so the account has been reloaded.";
    case 'VAL-422':
      return 'Those details were not accepted. Check the status and give a reason.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
