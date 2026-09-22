import { test, expect } from "@playwright/test";
const ADDRESS = "0x91bd00000000000000000000000000000000a821";
const HASH = `0x${"a2".repeat(32)}`;

test("readable amounts preserve precision and storage warnings stay visible", async ({
  page,
}) => {
  const snapshot = await (await page.request.get("/api/explorer")).json();
  const exact = "9007199254740993.123456789";
  await page.route("**/api/explorer", (route) =>
    route.fulfill({
      json: {
        ...snapshot,
        retention: {
          capBytes: 400000000,
          databaseBytes: 284000000,
          prunedBlocks: 10,
          prunedThrough: "100",
          state: "blocked",
          checkedAt: new Date().toISOString(),
        },
        recentTransactions: [
          { ...snapshot.recentTransactions[0], amount: exact },
        ],
      },
    }),
  );
  await page.goto("/explorer");
  await expect(page.locator(".feed-value")).toHaveCount(1);
  await expect(page.locator(".feed-value")).toHaveText(
    "9,007,199,254,740,993.123456… USDC",
  );
  await expect(page.locator(".feed-value")).toHaveAttribute(
    "title",
    `${exact} USDC · Open for exact values`,
  );
  await expect(
    page.getByText(
      "Storage protection is pausing ingestion until space can be reclaimed.",
    ),
  ).toBeVisible();
  await expect(page.locator(".retention-notice")).not.toHaveAttribute(
    "open",
    "",
  );
  await page.locator(".retention-notice summary").click();
  await expect(
    page.getByText(/Retained coverage begins at block/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Transfers", exact: true }).click();
  await expect(page.locator(".feed-row")).toHaveCount(1);
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Explorer", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});
test("interactive normalization and explorer refresh, filters, and outage recovery", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Self transfer", exact: true })
    .click();
  await expect(
    page.getByText("One audit record. Zero transfer balance change."),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "View Live Demo", exact: true })
    .first()
    .click();
  await expect(page.locator(".feed-row")).toHaveCount(3);
  await page.getByRole("button", { name: "Pause live updates" }).click();
  await expect(page.getByText("Refresh paused", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fee only", exact: true }).click();
  await expect(page.getByText("No transactions in this view")).toBeVisible();
  await page.getByRole("button", { name: "All activity", exact: true }).click();
  const snapshot = await (await page.request.get("/api/explorer")).json();
  const newTx = {
    ...snapshot.recentTransactions[0],
    hash: `0x${"dd".repeat(32)}`,
    blockNumber: "291295",
  };
  await page.route(
    "**/api/explorer",
    (route) =>
      route.fulfill({
        json: {
          ...snapshot,
          recentTransactions: [newTx, ...snapshot.recentTransactions],
        },
      }),
    { times: 1 },
  );
  await page.getByRole("button", { name: "Refresh explorer" }).click();
  await expect(page.locator(".feed-row")).toHaveCount(4);
  await page.route(
    "**/api/explorer",
    (route) => route.fulfill({ status: 503, json: { error: "Unavailable" } }),
    { times: 1 },
  );
  await page.getByRole("button", { name: "Refresh explorer" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Live refresh unavailable" }),
  ).toBeVisible();
  await expect(page.locator(".feed-row")).toHaveCount(4);
  await page.getByRole("button", { name: "Refresh explorer" }).click();
  await expect(page.locator(".feed-row")).toHaveCount(3);
});
test("desktop search, address history, canonical explanation, and status", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.locator(".home, .detail:not(.loading), .explorer-page"),
  ).toHaveCSS("opacity", "1");
  await page.screenshot({ path: ".local/landing-desktop.png", fullPage: true });
  await expect(
    page.getByRole("heading", {
      name: /Every USDC movement on Arc\.\s*Counted once\./,
    }),
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
  await expect(
    page.locator(".home, .detail:not(.loading), .explorer-page"),
  ).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: ".local/transaction-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Network status" }).click();
  await expect(
    page.getByText("Local demonstration", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Validation has not run")).toBeVisible();
  expect(errors).toEqual([]);
});
test("mobile layout, unknown records, and sample navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    "/",
    `/address/${ADDRESS}`,
    `/tx/${HASH}`,
    "/status",
    "/validation",
    "/explorer",
  ]) {
    await page.goto(path);
    await expect(
      page.locator(".home, .detail:not(.loading), .explorer-page"),
    ).toHaveCSS("opacity", "1");
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

test("load more appends stable cursor history, preserves rows on failure and retries", async ({
  page,
}) => {
  await page.goto(`/address/${ADDRESS}?limit=1`);
  await expect(page.locator(".transaction-row")).toHaveCount(1);
  await page.route(
    "**/api/ledger/**",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary ledger outage" }),
      }),
    { times: 1 },
  );
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Temporary ledger outage" }),
  ).toBeVisible();
  await expect(page.locator(".transaction-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.locator(".transaction-row")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(
    "End of indexed history",
  );
});

test("explain metadata and database state stay explicit", async ({ page }) => {
  await page.goto(`/tx/${HASH}`);
  await expect(page.locator(".normalization-metrics")).toContainText(
    "Canonical source",
  );
  await expect(page.locator(".normalization-metrics")).toContainText(
    "EIP-7708",
  );
  await expect(page.locator(".normalization-metrics")).toContainText(
    "Matched records2",
  );
  await expect(page.locator(".normalization-metrics")).toContainText(
    "Duplicate representations removed1",
  );
  await page.goto("/status");
  await expect(
    page
      .locator(".status-metric")
      .filter({ hasText: "Database" })
      .getByText("NOT CONFIGURED", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Latest Arc block", { exact: true }),
  ).toBeVisible();
});

test("landing copy, API examples, copy controls, FAQ and reduced-motion layout", async ({
  page,
  context,
}) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect(page).toHaveTitle("ArcLedger: One Ledger for Arc USDC");
  await expect(
    page.getByRole("heading", { name: /Every USDC movement on Arc/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Star on GitHub" }),
  ).toHaveAttribute("href", "https://github.com/anoop04singh/ArcLedger");
  await page
    .getByRole("button", { name: "GET /v1/tx/:txHash", exact: false })
    .click();
  await expect(page.locator(".api-json pre")).toContainText(
    "duplicateRepresentationsRemoved",
  );
  await page
    .getByRole("button", { name: "Copy endpoint", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        navigator.clipboard
          .readText()
          .then((text) => text.replace(/\r\n/g, "\n")),
      ),
    )
    .toBe("GET /v1/tx/:txHash");
  await page
    .getByRole("button", { name: "Copy commands", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        navigator.clipboard
          .readText()
          .then((text) => text.replace(/\r\n/g, "\n")),
      ),
    )
    .toBe("npm ci\nnpm run dev");
  const faq = page.getByRole("button", {
    name: "How much history does the live demo keep?",
  });
  await faq.click();
  await expect(faq).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("region", {
      name: "How much history does the live demo keep?",
    }),
  ).toContainText("400 MB");
  await faq.press("Enter");
  await expect(faq).toHaveAttribute("aria-expanded", "false");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const selector of [
    ".signature-scene",
    ".representation-pair",
    ".api-playground",
    ".install-terminal",
    ".faq-list",
  ]) {
    await page.locator(selector).scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
  expect(browserErrors).toEqual([]);
});
