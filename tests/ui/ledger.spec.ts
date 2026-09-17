import { test, expect } from "@playwright/test";
const ADDRESS = "0x91bd00000000000000000000000000000000a821";
const HASH = `0x${"a2".repeat(32)}`;
test("desktop search, address history, canonical explanation, and status", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".home, .detail")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: ".local/landing-desktop.png", fullPage: true });
  await expect(
    page.getByRole("heading", { name: "One dollar. One ledger." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Search ledger" }).click();
  await expect(page.locator("#search-error")).toContainText("Enter a valid");
  await page
    .getByRole("textbox", { name: "Search address or transaction hash" })
    .fill(ADDRESS);
  await page.getByRole("button", { name: "Search ledger" }).click();
  await expect(page).toHaveURL(new RegExp(`/address/${ADDRESS}`));
  await expect(page.getByText("174.99958", { exact: false })).toBeVisible();
  await expect(
    page.getByText("Transaction history", { exact: true }),
  ).toBeVisible();
  await page.locator(`a[href="/tx/${HASH}"]`).click();
  await expect(
    page.getByText("ACTUAL ECONOMIC MOVEMENT", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "1 canonical movement · 1 duplicate representations matched",
    ),
  ).toBeVisible();
  await expect(page.locator(".home, .detail")).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: ".local/transaction-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Network status" }).click();
  await expect(
    page.getByText("Local demonstration", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Balance reconciliation has not run"),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("mobile layout, unknown records, and sample navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", `/address/${ADDRESS}`, `/tx/${HASH}`, "/status"]) {
    await page.goto(path);
    await expect(page.locator(".home, .detail")).toHaveCSS("opacity", "1");
    await page.screenshot({
      path: `.local/mobile-${path.split("/")[1] || "home"}.png`,
      fullPage: true,
    });
    await expect(page.locator("footer")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto(`/tx/0x${"ff".repeat(32)}`);
  await expect(
    page.getByText("Transaction not indexed in current coverage"),
  ).toBeVisible();
  await page.goto(`/address/0x${"ff".repeat(20)}`);
  await expect(
    page.getByRole("heading", { name: "No indexed transactions" }),
  ).toBeVisible();
});
