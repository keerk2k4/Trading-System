import { maskEmail, maskPhone } from "./masking";

describe("maskEmail", () => {
  it("keeps the first letter and the domain", () => {
    expect(maskEmail("alice.trader@example.com")).toBe("a***@example.com");
  });

  it("hides an address it cannot parse completely", () => {
    expect(maskEmail("not-an-address")).toBe("***");
    expect(maskEmail("@example.com")).toBe("***");
  });

  it("passes on a missing address as null", () => {
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail("")).toBeNull();
  });
});

describe("maskPhone", () => {
  it("shows only the last four digits, whatever the formatting", () => {
    expect(maskPhone("+91 98765 43210")).toBe("******3210");
    expect(maskPhone("9876543210")).toBe("******3210");
  });

  it("hides a number too short to keep four digits of", () => {
    expect(maskPhone("1234")).toBe("****");
  });

  it("passes on a missing number as null", () => {
    expect(maskPhone(null)).toBeNull();
  });
});
