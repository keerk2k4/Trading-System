export class UserResponse {
  id!: string; // UUID (sub claim)
  username!: string;
  accountId!: number;
  roles!: string[]; // ["CUSTOMER"] or ["ADMIN"]
  createdOn?: string; // ISO 8601 timestamp
}
