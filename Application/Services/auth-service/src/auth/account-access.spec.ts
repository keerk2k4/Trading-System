import { canSignIn } from "./account-access";

describe("canSignIn", () => {
  it.each(["PENDING", "ACTIVE", "SUSPENDED"])("lets a %s account hold a session", (status) => {
    expect(canSignIn(status)).toBe(true);
  });

  it.each(["BLOCKED", "CLOSED"])("refuses a %s account", (status) => {
    expect(canSignIn(status)).toBe(false);
  });

  it("refuses any status nobody has decided about, and a missing one", () => {
    expect(canSignIn("FROZEN")).toBe(false);
    expect(canSignIn("")).toBe(false);
    expect(canSignIn(null)).toBe(false);
    expect(canSignIn(undefined)).toBe(false);
  });

  it("ignores case and surrounding spaces, as the Trade API may send either", () => {
    expect(canSignIn(" suspended ")).toBe(true);
    expect(canSignIn("blocked")).toBe(false);
  });
});
