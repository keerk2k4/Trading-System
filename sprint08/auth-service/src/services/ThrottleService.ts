import { Injectable } from '@nestjs/common';

interface ThrottleEntry {
  attempts: number;
  lastAttempt: number;
  blockedUntil?: number;
}

@Injectable()
export class ThrottleService {
  // Configuration
  private readonly MAX_ATTEMPTS = 5; // Maximum failed attempts before throttle
  private readonly COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes cooldown
  private readonly RESET_INTERVAL_MS = 60 * 60 * 1000; // 1 hour - reset counter if no attempts

  // In-memory storage of throttle state per username
  private throttleMap = new Map<string, ThrottleEntry>();

  /**
   * Check if a user is currently throttled after failed login attempts.
   * @param username - The username
   * @returns true if throttled, false if not
   */
  isThrottled(username: string): boolean {
    const entry = this.throttleMap.get(username);

    if (!entry) {
      return false;
    }

    // If blocked period has expired, clear the entry
    if (entry.blockedUntil && Date.now() > entry.blockedUntil) {
      this.throttleMap.delete(username);
      return false;
    }

    // If there's an active block, return throttled
    return entry.blockedUntil !== undefined;
  }

  /**
   * Record a failed login attempt for a user.
   * @param username - The username
   */
  recordFailedAttempt(username: string): void {
    const now = Date.now();
    let entry = this.throttleMap.get(username);

    if (!entry) {
      // New entry
      entry = {
        attempts: 1,
        lastAttempt: now,
      };
      this.throttleMap.set(username, entry);
      return;
    }

    // Reset counter if more than RESET_INTERVAL has passed since last attempt
    if (now - entry.lastAttempt > this.RESET_INTERVAL_MS) {
      entry.attempts = 1;
      entry.lastAttempt = now;
      entry.blockedUntil = undefined;
      return;
    }

    // Increment attempt counter
    entry.attempts++;
    entry.lastAttempt = now;

    // If max attempts reached, set the block
    if (entry.attempts >= this.MAX_ATTEMPTS) {
      entry.blockedUntil = now + this.COOLDOWN_MS;
    }
  }

  /**
   * Clear the throttle state for a user (e.g., after successful login).
   * @param username - The username
   */
  resetThrottle(username: string): void {
    this.throttleMap.delete(username);
  }

  /**
   * Get the time remaining (in seconds) before throttle expires for a user.
   * Returns 0 if not throttled.
   * @param username - The username
   * @returns Seconds remaining, or 0 if not throttled
   */
  getThrottleTimeRemaining(username: string): number {
    const entry = this.throttleMap.get(username);

    if (!entry || !entry.blockedUntil) {
      return 0;
    }

    const remaining = entry.blockedUntil - Date.now();
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }

  /**
   * Get configuration for documentation.
   */
  getConfiguration() {
    return {
      maxAttempts: this.MAX_ATTEMPTS,
      cooldownSeconds: this.COOLDOWN_MS / 1000,
      resetIntervalSeconds: this.RESET_INTERVAL_MS / 1000,
      description: `After ${this.MAX_ATTEMPTS} failed login attempts within ${this.RESET_INTERVAL_MS / 1000}s, the user is throttled for ${this.COOLDOWN_MS / 1000}s. A successful login resets the counter for that user.`,
    };
  }
}
