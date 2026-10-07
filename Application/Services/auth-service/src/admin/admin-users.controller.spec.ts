import { AuthenticatedUser } from "../guards/CurrentUser";
import { AdminUserRepository } from "../repositories/AdminUserRepository";
import { AdminUsersController } from "./admin-users.controller";

const ID_A = "11111111-2222-4333-8444-555555555555";
const ID_B = "66666666-7777-4888-9999-aaaaaaaaaaaa";

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
  return { sub: "admin-1", accountId: 0, roles, iat: 0, exp: 0, iss: "auth-service" };
}

describe("AdminUsersController", () => {
  let users: jest.Mocked<Pick<AdminUserRepository, "searchCustomers" | "findCustomersByIds">>;
  let controller: AdminUsersController;
  const customer = { userId: ID_A, username: "alice.trader", firstName: "Alice", lastName: "Trader", email: "a***@example.com", phone: null, kycStatus: "APPROVED" };

  beforeEach(() => {
    users = {
      searchCustomers: jest.fn().mockResolvedValue([customer]),
      findCustomersByIds: jest.fn().mockResolvedValue([customer]),
    };
    controller = new AdminUsersController(users as unknown as AdminUserRepository);
  });

  it("searches customers by name for an admin", async () => {
    const { res, state } = makeResponse();

    await controller.findUsers(claims(["ADMIN"]), "  alice ", undefined, res);

    expect(state.status).toBe(200);
    expect(state.body).toEqual([customer]);
    expect(users.searchCustomers).toHaveBeenCalledWith("alice");
  });

  it("fetches customers by id, from a comma list or repeated parameters, dropping anything that is not an id", async () => {
    const { res } = makeResponse();

    await controller.findUsers(claims(["ADMIN"]), undefined, [`${ID_A},not-an-id`, ID_B, ID_A], res);

    expect(users.findCustomersByIds).toHaveBeenCalledWith([ID_A, ID_B]);
  });

  it("refuses a customer token with AUTH-403 and looks nothing up", async () => {
    const { res, state } = makeResponse();

    await controller.findUsers(claims(["CUSTOMER"]), "alice", undefined, res);

    expect(state.status).toBe(403);
    expect(state.body).toEqual({ errorCode: "AUTH-403", message: "Forbidden" });
    expect(users.searchCustomers).not.toHaveBeenCalled();
  });

  it("refuses a request without verified claims with AUTH-401", async () => {
    const { res, state } = makeResponse();

    await controller.findUsers(undefined as unknown as AuthenticatedUser, "alice", undefined, res);

    expect(state.status).toBe(401);
  });

  it.each([
    ["neither query nor ids", undefined, undefined],
    ["both query and ids", "alice", ID_A],
    ["a one-letter query", "a", undefined],
    ["a query over 100 characters", "x".repeat(101), undefined],
  ])("answers VAL-422 for %s", async (_label, query, ids) => {
    const { res, state } = makeResponse();

    await controller.findUsers(claims(["ADMIN"]), query, ids, res);

    expect(state.status).toBe(422);
    expect(state.body).toEqual({ errorCode: "VAL-422", message: "Invalid input" });
    expect(users.searchCustomers).not.toHaveBeenCalled();
    expect(users.findCustomersByIds).not.toHaveBeenCalled();
  });

  it("does not echo a database error back to the caller", async () => {
    users.searchCustomers.mockRejectedValue(new Error("relation auth.kyc does not exist on db.internal"));
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { res, state } = makeResponse();

    await controller.findUsers(claims(["ADMIN"]), "alice", undefined, res);

    expect(state.body).toEqual({ errorCode: "VAL-422", message: "Invalid input" });
  });
});
