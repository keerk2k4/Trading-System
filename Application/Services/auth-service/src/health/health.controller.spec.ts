import { AuthenticatedUser } from "../guards/CurrentUser";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

function makeResponse() {
  const state: { status?: number; body?: any } = {};
  const res: any = {
    status: jest.fn((code: number) => {
      state.status = code;
      return res;
    }),
    json: jest.fn((body: any) => {
      state.body = body;
      return res;
    }),
  };
  return { res, state };
}

function claims(roles: string[]): AuthenticatedUser {
  return { sub: "user-1", accountId: 0, roles, iat: 0, exp: 0, iss: "auth-service" };
}

describe("HealthController", () => {
  let health: jest.Mocked<Pick<HealthService, "checkDatabase">>;
  let controller: HealthController;

  beforeEach(() => {
    health = { checkDatabase: jest.fn().mockResolvedValue({ status: "UP", responseMs: 4 }) };
    controller = new HealthController(health as unknown as HealthService);
  });

  describe("GET /health (public)", () => {
    it("answers 200 with the status and nothing else when the database is up", async () => {
      const { res, state } = makeResponse();

      await controller.getHealth(res);

      expect(state.status).toBe(200);
      expect(state.body).toEqual({ status: "UP" });
    });

    it("answers 503 DOWN, without the reason, when the database is down", async () => {
      health.checkDatabase.mockResolvedValue({ status: "DOWN", responseMs: null, detail: "Database query failed" });
      const { res, state } = makeResponse();

      await controller.getHealth(res);

      expect(state.status).toBe(503);
      expect(state.body).toEqual({ status: "DOWN" });
    });
  });

  describe("GET /health/details (admin only)", () => {
    it("gives an admin each component's status and the uptime", async () => {
      const { res, state } = makeResponse();

      await controller.getDetails(claims(["ADMIN"]), res);

      expect(state.status).toBe(200);
      expect(state.body).toEqual({
        status: "UP",
        checkedAt: expect.any(String),
        uptimeSeconds: expect.any(Number),
        components: {
          database: { status: "UP", responseMs: 4 },
        },
      });
    });

    it("still answers 200, with the reason, when the database is down", async () => {
      health.checkDatabase.mockResolvedValue({ status: "DOWN", responseMs: null, detail: "Database query failed" });
      const { res, state } = makeResponse();

      await controller.getDetails(claims(["ADMIN"]), res);

      expect(state.status).toBe(200);
      expect(state.body.status).toBe("DOWN");
      expect(state.body.components.database.detail).toBe("Database query failed");
    });

    it("refuses a customer token with AUTH-403 and checks nothing", async () => {
      const { res, state } = makeResponse();

      await controller.getDetails(claims(["CUSTOMER"]), res);

      expect(state.status).toBe(403);
      expect(state.body).toEqual({ errorCode: "AUTH-403", message: "Forbidden" });
      expect(health.checkDatabase).not.toHaveBeenCalled();
    });

    it("refuses a request without verified claims with AUTH-401", async () => {
      const { res, state } = makeResponse();

      await controller.getDetails(undefined as unknown as AuthenticatedUser, res);

      expect(state.status).toBe(401);
      expect(state.body).toEqual({ errorCode: "AUTH-401", message: "Unauthorised" });
    });
  });
});
