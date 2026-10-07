// Admin customer models.
//
// A customer's identity (name, username, masked contacts, KYC) comes from the
// Auth service and their trading account from the Trade REST API; the admin
// customer screens join the two on the Auth user id. Wire shapes are the
// generated admin clients' (Contracts/API-Schemas/*-admin-api.yaml).

import { AdminUserResponse } from '../../../generated/auth-admin-client';
import {
  AccountStatus,
  AdminAccountDetail,
  AdminAccountSummary
} from '../../../generated/trade-admin-client';

export type CustomerProfile = AdminUserResponse;
export type CustomerAccount = AdminAccountSummary;
export type CustomerAccountDetail = AdminAccountDetail;
export type CustomerAccountStatus = AccountStatus;

export const ACCOUNT_STATUSES: CustomerAccountStatus[] = ['PENDING', 'ACTIVE', 'SUSPENDED', 'BLOCKED', 'CLOSED'];

/** One row of the customer list: who they are, and their trading account if they have one. */
export interface CustomerRow {
  userId: string;
  /** Null when the Auth service had no customer for this account's user id. */
  profile: CustomerProfile | null;
  /** Null for a customer with no trading account (yet). */
  account: CustomerAccount | null;
}

export interface CustomerSearch {
  /** Name or username, at least 2 characters. */
  query?: string;
  status?: CustomerAccountStatus | null;
  accountNumber?: string;
}

/** The detail page: the account, and the customer it belongs to. */
export interface CustomerDetailView {
  detail: CustomerAccountDetail;
  profile: CustomerProfile | null;
}
