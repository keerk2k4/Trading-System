import { Test, TestingModule } from '@nestjs/testing';
import { ThrottleService } from './ThrottleService';

describe('ThrottleService', () => {
  let service: ThrottleService;
  const testUsername = 'testuser';
  const testUsername2 = 'testuser2';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ThrottleService],
    }).compile();

    service = module.get<ThrottleService>(ThrottleService);
  });

  describe('Initial state', () => {
    it('should not throttle a new user', () => {
      const isThrottled = service.isThrottled(testUsername);
      expect(isThrottled).toBe(false);
    });

    it('should return 0 remaining time for new user', () => {
      const remaining = service.getThrottleTimeRemaining(testUsername);
      expect(remaining).toBe(0);
    });
  });

  describe('Recording failed attempts', () => {
    it('should allow first failed attempt', () => {
      service.recordFailedAttempt(testUsername);
      expect(service.isThrottled(testUsername)).toBe(false);
    });

    it('should allow up to 4 failed attempts', () => {
      for (let i = 0; i < 4; i++) {
        service.recordFailedAttempt(testUsername);
        expect(service.isThrottled(testUsername)).toBe(false);
      }
    });

    it('should throttle after 5 failed attempts', () => {
      for (let i = 0; i < 5; i++) {
        service.recordFailedAttempt(testUsername);
      }
      expect(service.isThrottled(testUsername)).toBe(true);
    });

    it('should have throttle time remaining after being throttled', () => {
      for (let i = 0; i < 5; i++) {
        service.recordFailedAttempt(testUsername);
      }
      const remaining = service.getThrottleTimeRemaining(testUsername);
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(900); // 15 minutes in seconds
    });
  });

  describe('Throttle reset', () => {
    it('should reset throttle on successful login', () => {
      for (let i = 0; i < 5; i++) {
        service.recordFailedAttempt(testUsername);
      }
      expect(service.isThrottled(testUsername)).toBe(true);

      service.resetThrottle(testUsername);
      expect(service.isThrottled(testUsername)).toBe(false);
    });

    it('should allow new attempts after reset', () => {
      for (let i = 0; i < 5; i++) {
        service.recordFailedAttempt(testUsername);
      }
      service.resetThrottle(testUsername);

      // Should not be throttled after one more attempt
      service.recordFailedAttempt(testUsername);
      expect(service.isThrottled(testUsername)).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('should provide throttle configuration', () => {
      const config = service.getConfiguration();

      expect(config.maxAttempts).toBe(5);
      expect(config.cooldownSeconds).toBe(900); // 15 minutes
      expect(config.resetIntervalSeconds).toBeGreaterThan(0);
      expect(config.description).toBeDefined();
    });
  });

  describe('Multiple users', () => {
    it('should track separate throttle state for different users', () => {
      for (let i = 0; i < 5; i++) {
        service.recordFailedAttempt(testUsername);
      }

      expect(service.isThrottled(testUsername)).toBe(true);
      expect(service.isThrottled(testUsername2)).toBe(false);
    });

    it('should allow one user to be throttled while another is not', () => {
      for (let i = 0; i < 5; i++) {
        service.recordFailedAttempt(testUsername);
      }

      // testUsername2 can still login
      service.recordFailedAttempt(testUsername2);
      expect(service.isThrottled(testUsername)).toBe(true);
      expect(service.isThrottled(testUsername2)).toBe(false);
    });
  });
});
