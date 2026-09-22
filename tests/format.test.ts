import { expect, it } from "vitest";
import { compactAmount } from "../apps/web/lib/format.js";
it("keeps exact integer digits and marks omitted fractional precision", () => {
  expect(compactAmount("900719925474099312345.123456789")).toBe(
    "900,719,925,474,099,312,345.123456…",
  );
  expect(compactAmount("10.000000")).toBe("10");
  expect(compactAmount("0.000000000000000001")).toBe("0.000000000000000001");
  expect(compactAmount("-1200.250000")).toBe("-1,200.25");
});
