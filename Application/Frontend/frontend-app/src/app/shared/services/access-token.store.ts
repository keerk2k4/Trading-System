import { signal } from '@angular/core';

// The access token lives only in memory: it is never written to
// localStorage/sessionStorage, so it disappears on reload and the bootstrap
// silent refresh (the HttpOnly refresh cookie) fetches a new one.
// A module-level signal because two readers need it: MockAuthService, which
// owns it, and the generated auth client's credentials callback in
// api-clients.ts, which is configured once with a plain value and cannot
// inject a service.
export const accessTokenStore = signal<string | null>(null);
