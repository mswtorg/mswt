import { describe, expect, it } from "vitest";
import { initials } from "@/lib/initials";

describe("initials", () => {
  it("uses the first and last word, skipping titles", () => {
    expect(initials("Munira Agbari")).toBe("MA");
    expect(initials("Tasneem Kutubuddin")).toBe("TK");
    expect(initials("Dr. Munira Shoaib Agbari")).toBe("MA");
    expect(initials("  smt  priya ")).toBe("P");
    expect(initials("")).toBe("");
  });
});
