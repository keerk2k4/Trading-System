import { Test, TestingModule } from '@nestjs/testing';
import { TokenService } from './TokenService';
import * as jwt from 'jsonwebtoken';

describe('TokenService - JWT Contract', () => {
  let service: TokenService;
  const testSecret = 'test-jwt-secret-key-min-32-chars';
  const testUserId = '8f14e45f-ceea-4c1b-9d3b-1a2b3c4d5e6f';
  const testAccountId = 42;
  const testRoles = ['CUSTOMER'];

  beforeAll(() => {
    // Set environment variables for testing
    process.env.JWT_SECRET = testSecret;
    process.env.JWT_ISSUER = 'auth-service';
    process.env.JWT_ACCESS_TOKEN_EXPIRY_SECONDS = '900';
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TokenService],
    }).compile();

    service = module.get<TokenService>(TokenService);
  });

  describe('Access token generation', () => {
    it('should generate a valid HS256 signed JWT', () => {
      const token = service.createAccessToken(testUserId, testAccountId, testRoles);

      // Decode the header to verify algorithm
      const decoded = jwt.decode(token, { complete: true });
      expect(decoded).not.toBeNull();
      expect(decoded!.header.alg).toBe('HS256');
    });

    it('should contain exactly the six contract claims', () => {
      const token = service.createAccessToken(testUserId, testAccountId, testRoles);
      const decoded = jwt.decode(token) as any;

      const payloadKeys = Object.keys(decoded).sort();
      const expectedKeys = ['sub', 'accountId', 'roles', 'iat', 'exp', 'iss'].sort();

      expect(payloadKeys).toEqual(expectedKeys);
    });

    it('should not contain email claim', () => {
      const token = service.createAccessToken(testUserId, testAccountId, testRoles);
      const decoded = jwt.decode(token) as any;

      expect(decoded.email).toBeUndefined();
    });

    it('should not contain username claim', () => {
      const token = service.createAccessToken(testUserId, testAccountId, testRoles);
      const decoded = jwt.decode(token) as any;

      expect(decoded.username).toBeUndefined();
    });

    it('should not contain password or password hash', () => {
      const token = service.createAccessToken(testUserId, testAccountId, testRoles);
      const decoded = jwt.decode(token) as any;

      expect(decoded.password).toBeUndefined();
      expect(decoded.passwordHash).toBeUndefined();
    });

    it('should set sub to the user UUID', () => {
      const token = service.createAccessToken(testUserId, testAccountId, testRoles);
      const decoded = jwt.decode(token) as any;

      expect(decoded.sub).toBe(testUserId);
      expect(typeof decoded.sub).toBe('string');
    });

    it('should set accountId to the numeric trading account ID', () => {
      const token = service.createAccessToken(testUserId, testAccountId, testRoles);
      const decoded = jwt.decode(token) as any;

      expect(decoded.accountId).toBe(testAccountId);
      expect(typeof decoded.accountId).toBe('number');
    });

    it('should set roles to the provided array', () => {
      const token = service.createAccessToken(testUserId, testAccountId, testRoles);
      const decoded = jwt.decode(token) as any;

      expect(Array.isArray(decoded.roles)).toBe(true);
      expect(decoded.roles).toEqual(testRoles);
    });

    it('should set roles to non-empty array for ADMIN', () => {
      const adminRoles = ['ADMIN'];
      const token = service.createAccessToken(testUserId, testAccountId, adminRoles);
      const decoded = jwt.decode(token) as any;

      expect(Array.isArray(decoded.roles)).toBe(true);
      expect(decoded.roles.length).toBeGreaterThan(0);
      expect(decoded.roles).toContain('ADMIN');
    });

    it('should set iat to current time as epoch seconds', () => {
      const beforeTime = Math.floor(Date.now() / 1000);
      const token = service.createAccessToken(testUserId, testAccountId, testRoles);
      const afterTime = Math.floor(Date.now() / 1000);
      const decoded = jwt.decode(token) as any;

      expect(typeof decoded.iat).toBe('number');
      expect(decoded.iat).toBeGreaterThanOrEqual(beforeTime);
      expect(decoded.iat).toBeLessThanOrEqual(afterTime);
    });

    it('should set exp to iat + 900 seconds (15 minutes)', () => {
      const token = service.createAccessToken(testUserId, testAccountId, testRoles);
      const decoded = jwt.decode(token) as any;

      expect(typeof decoded.exp).toBe('number');
      expect(decoded.exp).toBe(decoded.iat + 900);
    });

    it('should set iss to "auth-service"', () => {
      const token = service.createAccessToken(testUserId, testAccountId, testRoles);
      const decoded = jwt.decode(token) as any;

      expect(decoded.iss).toBe('auth-service');
    });

    it('should be verifiable with JWT_SECRET using HS256', () => {
      const token = service.createAccessToken(testUserId, testAccountId, testRoles);

      const verified = jwt.verify(token, testSecret, {
        algorithms: ['HS256'],
        issuer: 'auth-service',
      });

      expect(verified).toBeDefined();
      expect((verified as any).sub).toBe(testUserId);
    });

    it('should fail verification with wrong secret', () => {
      const token = service.createAccessToken(testUserId, testAccountId, testRoles);
      const wrongSecret = 'wrong-secret-key';

      expect(() => {
        jwt.verify(token, wrongSecret, { algorithms: ['HS256'] });
      }).toThrow();
    });

    it('should fail verification with wrong issuer', () => {
      const token = service.createAccessToken(testUserId, testAccountId, testRoles);

      expect(() => {
        jwt.verify(token, testSecret, {
          algorithms: ['HS256'],
          issuer: 'wrong-issuer',
        });
      }).toThrow();
    });
  });

  describe('Token verification', () => {
    it('should verify a valid token', () => {
      const token = service.createAccessToken(testUserId, testAccountId, testRoles);
      const result = service.verifyAccessToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();
      expect(result.payload!.sub).toBe(testUserId);
    });

    it('should reject an expired token', () => {
      // Create a token that expired 1 second ago
      const expiredToken = jwt.sign(
        {
          sub: testUserId,
          accountId: testAccountId,
          roles: testRoles,
          iat: Math.floor(Date.now() / 1000) - 1000,
          exp: Math.floor(Date.now() / 1000) - 1, // Expired 1 second ago
          iss: 'auth-service',
        },
        testSecret,
        { algorithm: 'HS256' }
      );

      const result = service.verifyAccessToken(expiredToken);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject a token with wrong signature', () => {
      const token = service.createAccessToken(testUserId, testAccountId, testRoles);
      // Tamper with the token
      const tamperedToken = token.substring(0, token.length - 5) + 'xxxxx';

      const result = service.verifyAccessToken(tamperedToken);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject a token with wrong issuer', () => {
      const wrongIssuerToken = jwt.sign(
        {
          sub: testUserId,
          accountId: testAccountId,
          roles: testRoles,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 900,
          iss: 'wrong-issuer',
        },
        testSecret,
        { algorithm: 'HS256' }
      );

      const result = service.verifyAccessToken(wrongIssuerToken);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Token decoding', () => {
    it('should decode a token without verification', () => {
      const token = service.createAccessToken(testUserId, testAccountId, testRoles);
      const decoded = service.decodeToken(token);

      expect(decoded).not.toBeNull();
      expect(decoded!.sub).toBe(testUserId);
      expect(decoded!.accountId).toBe(testAccountId);
    });

    it('should return null for invalid token format', () => {
      const invalidToken = 'not.a.valid.token';
      const decoded = service.decodeToken(invalidToken);

      expect(decoded).toBeNull();
    });
  });

  describe('Expiry configuration', () => {
    it('should return 900 seconds for access token expiry', () => {
      const expiry = service.getAccessTokenExpiry();
      expect(expiry).toBe(900);
    });

    it('should return 604800 seconds (7 days) for refresh token expiry', () => {
      const expiry = service.getRefreshTokenExpiry();
      expect(expiry).toBe(604800);
    });
  });
});
