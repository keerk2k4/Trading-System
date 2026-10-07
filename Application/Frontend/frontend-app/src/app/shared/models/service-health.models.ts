// Service-health models.
//
// The wire shapes are the generated admin clients' (from
// Contracts/API-Schemas/auth-admin-api.yaml and trade-admin-api.yaml); these
// are what the admin "Service health" screen shows, one card per service.

// UP: running and its dependencies answer. DEGRADED: running, but its
// database or Kafka is failing. DOWN: no answer. UNKNOWN: could not be asked.
export type ServiceStatus = 'UP' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';

export interface ServiceFact {
  label: string;
  value: string;
}

export interface ServiceCard {
  /** e.g. `Auth service`, `Trade Executor`. */
  name: string;
  status: ServiceStatus;
  /** How long the check took; null when there was no answer. */
  responseMs: number | null;
  /** A sentence an admin can act on. */
  detail: string;
  /** Who ran the check, so an indirect check is never mistaken for a direct one. */
  checkedBy: string;
  /** Extra figures for the card, such as uptime. */
  facts: ServiceFact[];
}

export interface PlatformHealthView {
  /** `UP` when every service is up, otherwise `DEGRADED`. */
  overall: 'UP' | 'DEGRADED';
  checkedAt: Date;
  /** Always Auth service, Trade API, Kafka, Trade Executor, in that order. */
  services: ServiceCard[];
}
