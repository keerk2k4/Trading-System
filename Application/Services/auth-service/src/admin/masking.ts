/**
 * Masks contact details for admin screens. An admin needs to recognise a
 * customer ("is this the a***@gmail.com who rang?"), not to read their full
 * address or number, so only enough is shown to tell people apart.
 */

/** "alice.trader@example.com" -> "a***@example.com". */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) {
    return null;
  }
  const at = email.lastIndexOf("@");
  if (at <= 0) {
    return "***";
  }
  return `${email[0]}***${email.slice(at)}`;
}

/** "+91 98765 43210" -> "******3210". Only the last four digits are shown. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) {
    return null;
  }
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) {
    return "****";
  }
  return `${"*".repeat(6)}${digits.slice(-4)}`;
}
