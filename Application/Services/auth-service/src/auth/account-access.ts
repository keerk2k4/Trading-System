/**
 * Which trading-account statuses may hold a session (sign in, or refresh one).
 *
 * | Status    | Session | Orders |
 * |-----------|---------|--------|
 * | PENDING   | yes     | no     |
 * | ACTIVE    | yes     | yes    |
 * | SUSPENDED | yes     | no     |
 * | BLOCKED   | no      | no     |
 * | CLOSED    | no      | no     |
 *
 * Orders are not decided here: the Trade REST API accepts them from ACTIVE
 * accounts only (business rule 2). A suspended customer can sign in and see
 * their account, and has every order refused with ACC-403.
 *
 * This lists the statuses that are allowed, not the ones that are refused, so
 * a status added later (or a typo in the data) is refused until somebody
 * decides otherwise.
 */
const SIGN_IN_STATUSES = new Set(["PENDING", "ACTIVE", "SUSPENDED"]);

export function canSignIn(accountStatus: string | null | undefined): boolean {
  return SIGN_IN_STATUSES.has(accountStatus?.trim().toUpperCase() ?? "");
}
