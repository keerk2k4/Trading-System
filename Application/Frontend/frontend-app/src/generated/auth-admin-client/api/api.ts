export * from './admin.service';
import { AdminService } from './admin.service';
export * from './health.service';
import { HealthService } from './health.service';
export const APIS = [AdminService, HealthService];
