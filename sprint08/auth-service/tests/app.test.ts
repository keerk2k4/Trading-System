import request from "supertest";
import app from "../src/app.js";
import { query, closePool } from "../src/database.js";

describe("Health API", () => {
  it("should return UP", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("UP");
  });
});

describe("Auth API - Login", () => {
  beforeAll(async () => {
    // Setup test data
    // This would require seeding the database with test users
  });

  afterAll(async () => {
    // Cleanup and close pool
    await closePool();
  });

  it("should return 422 for invalid input", async () => {
    const response = await request(app)
      .post("/auth/login")
      .send({
        username: "test",
        // password missing
      });

    expect(response.status).toBe(422);
    expect(response.body.errorCode).toBe("VAL-422");
    expect(response.body.message).toBe("Invalid input");
  });

  it("should return 401 for unknown user", async () => {
    const response = await request(app)
      .post("/auth/login")
      .send({
        username: "nonexistent_user_12345",
        password: "correct horse battery staple",
      });

    expect(response.status).toBe(401);
    expect(response.body.errorCode).toBe("AUTH-401");
    expect(response.body.message).toBe("Unauthorised");
  });

  it("should return 401 for wrong password", async () => {
    // Assumes test user exists in database
    const response = await request(app)
      .post("/auth/login")
      .send({
        username: "alice_trader",
        password: "wrong_password_123",
      });

    expect(response.status).toBe(401);
    expect(response.body.errorCode).toBe("AUTH-401");
    expect(response.body.message).toBe("Unauthorised");
  });

  it("should return 200 with access token on successful login", async () => {
    // Assumes test user exists in database
    const response = await request(app)
      .post("/auth/login")
      .send({
        username: "alice_trader",
        password: "correct horse battery staple",
      });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeDefined();
    expect(response.body.tokenType).toBe("Bearer");
    expect(response.body.expiresIn).toBe(900);
    expect(response.body.refreshToken).toBeUndefined(); // No refresh token on login
  });
});

describe("Auth API - Refresh", () => {
  it("should return 422 for invalid input", async () => {
    const response = await request(app)
      .post("/auth/refresh")
      .send({
        // refreshToken missing
      });

    expect(response.status).toBe(422);
    expect(response.body.errorCode).toBe("VAL-422");
  });

  it("should return 401 for invalid refresh token", async () => {
    const response = await request(app)
      .post("/auth/refresh")
      .send({
        refreshToken: "invalid_refresh_token_12345",
      });

    expect(response.status).toBe(401);
    expect(response.body.errorCode).toBe("AUTH-401");
  });
});

describe("Auth API - Get Me", () => {
  it("should return 401 without bearer token", async () => {
    const response = await request(app).get("/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.errorCode).toBe("AUTH-401");
  });

  it("should return 401 with malformed bearer token", async () => {
    const response = await request(app)
      .get("/auth/me")
      .set("Authorization", "InvalidFormat token_here");

    expect(response.status).toBe(401);
    expect(response.body.errorCode).toBe("AUTH-401");
  });

  it("should return 401 with invalid token", async () => {
    const response = await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer invalid.token.here");

    expect(response.status).toBe(401);
    expect(response.body.errorCode).toBe("AUTH-401");
  });
});

describe("Auth API - Guard Tests", () => {
  it("should reject expired access token", async () => {
    // TODO: Create an expired token and test that it's rejected
    // This requires signing a token with past expiry
  });

  it("should reject token with wrong signature", async () => {
    // TODO: Create a token signed with wrong secret and test rejection
  });
});