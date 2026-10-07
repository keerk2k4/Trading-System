// True when `error` is a Postgres unique violation (SQLSTATE 23505) on the
// given index. Used as the race-proof backstop behind the explicit
// "already taken" checks: two requests can both pass the check, but only one
// insert can win the UNIQUE index.
export function isUniqueViolation(error: unknown, indexName: string): boolean {
  const pgError = error as { code?: string; constraint?: string } | null;
  return pgError?.code === "23505" && pgError.constraint === indexName;
}
