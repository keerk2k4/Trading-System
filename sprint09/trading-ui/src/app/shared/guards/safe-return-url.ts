// Validates the `returnUrl` query param the auth guards hand to the sign-in
// screen. Anyone can craft a sign-in link with any returnUrl on it, so a
// value that sends the user off this origin would turn our sign-in page into
// an open redirect (sign in on the real site, land on a look-alike). Only a
// path on this origin is accepted; anything else falls back to `fallback`.
export function safeReturnUrl(candidate: unknown, fallback: string, origin = window.location.origin): string {
  if (typeof candidate !== 'string') {
    return fallback;
  }

  // Must be a path: exactly one leading '/'. '//evil.example' is a
  // protocol-relative URL, and browsers treat '\' as '/', so '/\evil.example'
  // is one too. Control characters (tab, newline) are stripped by the URL
  // parser, which would turn '/\t/evil.example' into '//evil.example'.
  if (
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\') ||
    /[\u0000-\u001F\u007F]/.test(candidate)
  ) {
    return fallback;
  }

  // Belt and braces: resolve it against our origin and confirm it stayed here.
  let resolved: URL;
  try {
    resolved = new URL(candidate, origin);
  } catch {
    return fallback;
  }
  if (resolved.origin !== origin) {
    return fallback;
  }

  return resolved.pathname + resolved.search + resolved.hash;
}
