import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { parseEther } from "viem";
import { mockWallet, nft, other } from "./wallet";
import chainConfig from "../network.json" with { type: "json" };
import { actionsFor, parseTerms } from "../src/domain";
const loaded = async (page: any) => {
  await page.goto("./");
  await expect(
    page.getByText("Deployment checks passed", { exact: false }),
  ).toBeVisible();
};
const confirm = async (page: any) => {
  await page
    .getByRole("button", { name: "Confirm in wallet", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm in wallet", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Transaction confirmed");
};
test("disconnected controls, no-wallet feedback, keyboard and mobile reflow", async ({
  page,
}) => {
  await mockWallet(page, { noWallet: true, empty: true });
  await loaded(page);
  await expect(
    page.getByRole("button", { name: "Check NFT ownership" }),
  ).toBeDisabled();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "No browser wallet found",
  );
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
});
test("wrong chain offers the exact add-chain configuration before switching again", async ({
  page,
}) => {
  const state = await mockWallet(page, { wrongChain: true });
  await loaded(page);
  await expect(
    page.getByRole("button", { name: "Check NFT ownership" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Switch to Sepolia" }).click();
  await expect(
    page.getByRole("button", { name: "Check NFT ownership" }),
  ).toBeEnabled();
  expect(
    state.calls.find((c) => c.method === "wallet_addEthereumChain").params,
  ).toEqual([chainConfig.walletAddChain]);
  expect(
    state.calls.filter((c) => c.method === "wallet_switchEthereumChain"),
  ).toHaveLength(2);
});
test("explicit NFT approval followed by request; exact ETH and duration encoding", async ({
  page,
}) => {
  const state = await mockWallet(page);
  await loaded(page);
  await page.getByLabel("Collection address").fill(nft);
  await page.getByLabel("Token ID", { exact: true }).fill("42");
  await page
    .getByLabel("Principal · ETH", { exact: true })
    .fill("0.100000000000000001");
  await page.getByLabel("Flat interest · ETH").fill("0.01");
  await page.getByRole("button", { name: "Check NFT ownership" }).click();
  await expect(
    page.getByRole("button", { name: "2Request loan" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "1Approve NFT" }).click();
  await confirm(page);
  expect(state.sent[0].kind).toBe("approve");
  expect(state.sent[0].args[1]).toBe(42n);
  await page.getByRole("button", { name: "2Request loan" }).click();
  await expect(
    page.getByRole("region", { name: "Request this loan" }),
  ).toContainText("0.110000000000000001 ETH");
  await confirm(page);
  expect(state.sent[1].kind).toBe("request");
  expect(state.sent[1].args.slice(1)).toEqual([
    42n,
    100000000000000001n,
    parseEther("0.01"),
    604800n,
  ]);
  expect(BigInt(state.sent[1].tx.value ?? "0x0")).toBe(0n);
  await expect(
    page.getByRole("article", { name: "Loan 5", exact: true }),
  ).toContainText("Requested");
});
test("fund, repay, claim, cancel and withdraw use eligibility and exact values", async ({
  page,
}) => {
  const state = await mockWallet(page);
  await loaded(page);
  await page
    .getByRole("article", { name: "Loan 1", exact: true })
    .getByRole("button", { name: "Fund 0.1 ETH" })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm in wallet", exact: true }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await confirm(page);
  expect(state.sent.at(-1).kind).toBe("fund");
  expect(BigInt(state.sent.at(-1).tx.value)).toBe(parseEther("0.1"));
  await page
    .getByRole("article", { name: "Loan 2", exact: true })
    .getByRole("button", { name: "Repay 0.11 ETH" })
    .click();
  await confirm(page);
  expect(state.sent.at(-1).kind).toBe("repay");
  expect(BigInt(state.sent.at(-1).tx.value)).toBe(parseEther("0.11"));
  await page
    .getByRole("article", { name: "Loan 3", exact: true })
    .getByRole("button", { name: "Claim NFT" })
    .click();
  await confirm(page);
  await page
    .getByRole("article", { name: "Loan 0", exact: true })
    .getByRole("button", { name: "Cancel request" })
    .click();
  await confirm(page);
  await page.getByRole("button", { name: "Withdraw ETH" }).click();
  await confirm(page);
  expect(state.sent.map((s) => s.kind)).toEqual([
    "fund",
    "repay",
    "claim",
    "cancel",
    "withdraw",
  ]);
  for (const sent of state.sent.slice(2))
    expect(BigInt(sent.tx.value ?? "0x0")).toBe(0n);
  await expect(
    page.getByRole("button", { name: "Withdraw ETH" }),
  ).toBeDisabled();
});
test("repay at the exact deadline, claim only after; fresh simulation blocks stale actions", async ({
  page,
}) => {
  const state = await mockWallet(page);
  await loaded(page);
  const loan = page.getByRole("article", { name: "Loan 4", exact: true });
  await expect(
    loan.getByRole("button", { name: "Repay 0.11 ETH" }),
  ).toBeEnabled();
  await expect(loan.getByRole("button", { name: "Claim NFT" })).toHaveCount(0);
  await loan.getByRole("button", { name: "Repay 0.11 ETH" }).click();
  state.now++;
  await page
    .getByRole("button", { name: "Confirm in wallet", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("no longer available");
  expect(state.sent).toHaveLength(0);
  await page.getByRole("button", { name: "Back to page" }).click();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(loan.getByRole("button", { name: "Claim NFT" })).toBeEnabled();
});
test("simulation revert, wallet rejection and on-chain revert retain recoverable feedback", async ({
  page,
}) => {
  const state = await mockWallet(page);
  await loaded(page);
  await page
    .getByRole("article", { name: "Loan 0", exact: true })
    .getByRole("button", { name: "Cancel request" })
    .click();
  state.revert = true;
  await page
    .getByRole("button", { name: "Confirm in wallet", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("mock transfer blocked");
  expect(state.sent).toHaveLength(0);
  state.revert = false;
  state.reject = true;
  await page
    .getByRole("button", { name: "Confirm in wallet", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("declined");
  expect(state.sent).toHaveLength(0);
  state.reject = false;
  state.receiptRevert = true;
  await page
    .getByRole("button", { name: "Confirm in wallet", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("reverted on-chain");
  await expect(
    page.getByRole("link", { name: /View transaction/ }),
  ).toBeVisible();
});
test("account changes remove previous eligibility and pending reviews", async ({
  page,
}) => {
  const state = await mockWallet(page);
  await loaded(page);
  await page
    .getByRole("article", { name: "Loan 0", exact: true })
    .getByRole("button", { name: "Cancel request" })
    .click();
  state.account = other;
  await page.evaluate(
    (other) => (window as any).__emit("accountsChanged", [other]),
    other,
  );
  await expect(
    page.getByRole("heading", { name: "Cancel loan #0" }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("article", { name: "Loan 0", exact: true })
      .getByRole("button", { name: "Cancel request" }),
  ).toHaveCount(0);
});
test("missing code and altered ABI fail closed", async ({ page }) => {
  await mockWallet(page, { noCode: true });
  await page.goto("./");
  await expect(page.getByRole("alert")).toContainText("No deployed code");
  await expect(
    page.getByRole("button", { name: "Check NFT ownership" }),
  ).toBeDisabled();
  await page.route("**/abi/NFTPawnShop.json", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Deployment unavailable" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "ABI verification failed",
  );
});
test("exact parsing rejects precision loss, overflow, and invalid duration", () => {
  const base = {
    nft,
    tokenId: "42",
    principal: "0.1",
    interest: "0",
    hours: "1",
  };
  expect(
    parseTerms({ ...base, principal: "0.000000000000000001" }).principal,
  ).toBe(1n);
  for (const patch of [
    { principal: "1e-3" },
    { principal: "0.0000000000000000001" },
    { principal: "0" },
    { interest: "-1" },
    { hours: "0" },
    { hours: "8761" },
    { hours: "1.5" },
    { tokenId: "1.2" },
    { tokenId: (2n ** 256n).toString() },
  ])
    expect(() => parseTerms({ ...base, ...patch })).toThrow();
});
test("rendered loan states pass axe; responsive, zoom, RTL, focus and screenshots", async ({
  page,
}) => {
  await mockWallet(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loaded(page);
  await mkdir("../docs/evidence", { recursive: true });
  const desktop = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(desktop.violations).toEqual([]);
  await page.screenshot({
    path: "../docs/evidence/desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  const mobile = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(mobile.violations).toEqual([]);
  await page.screenshot({
    path: "../docs/evidence/mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    document.body.style.zoom = "2";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.evaluate(() => {
    document.body.style.zoom = "1";
    document.documentElement.dir = "rtl";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.evaluate(() => {
    document.documentElement.dir = "ltr";
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Refresh", exact: true }).focus();
  expect(
    await page
      .getByRole("button", { name: "Refresh", exact: true })
      .evaluate((el) => getComputedStyle(el).outlineWidth),
  ).toBe("3px");
  expect(errors).toEqual([]);
  await writeFile(
    "../docs/evidence/accessibility.json",
    JSON.stringify(
      {
        desktopViolations: desktop.violations,
        mobileViolations: mobile.violations,
        viewports: [1440, 390, 320],
        cssZoom: 2,
        rtl: true,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
});
test("pagination visits every loan ID in bounded pages and filters by current page", async ({
  page,
}) => {
  const state = await mockWallet(page);
  state.loans = Array.from({ length: 14 }, (_, i) => ({
    ...state.loans[0],
    id: BigInt(i),
    tokenId: BigInt(i),
  }));
  await loaded(page);
  await expect(page.getByRole("article")).toHaveCount(12);
  await expect(
    page.getByRole("article", { name: "Loan 13", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Older loans" }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  await expect(
    page.getByRole("article", { name: "Loan 0", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Older loans" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Active loans", exact: true }).click();
  await expect(page.getByText("No matching loans on this page.")).toBeVisible();
});
test("field errors focus the invalid amount, preserve input and invalidate stale approvals", async ({
  page,
}) => {
  const state = await mockWallet(page);
  state.approved = true;
  await loaded(page);
  await page.getByLabel("Collection address").fill(nft);
  await page.getByLabel("Token ID", { exact: true }).fill("42");
  await page
    .getByLabel("Principal · ETH", { exact: true })
    .fill("0.0000000000000000001");
  await page.getByRole("button", { name: "Check NFT ownership" }).click();
  await expect(page.locator("#form-error")).toContainText(
    "at most 18 decimal places",
  );
  await expect(
    page.getByLabel("Principal · ETH", { exact: true }),
  ).toBeFocused();
  await expect(
    page.getByLabel("Principal · ETH", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Principal · ETH", { exact: true }).fill("0.1");
  await page.getByRole("button", { name: "Check NFT ownership" }).click();
  await expect(
    page.getByRole("button", { name: "2Request loan" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "1NFT approved" }),
  ).toBeDisabled();
  await page.getByLabel("Token ID", { exact: true }).fill("43");
  await expect(
    page.getByRole("button", { name: "2Request loan" }),
  ).toBeDisabled();
  expect(state.sent).toHaveLength(0);
});
test("wallet connection rejection can be retried without losing read-only data", async ({
  page,
}) => {
  const state = await mockWallet(page, { connected: false });
  state.reject = true;
  await loaded(page);
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.getByRole("alert")).toContainText("declined");
  state.reject = false;
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(
    page.getByRole("button", { name: "Check NFT ownership" }),
  ).toBeEnabled();
  await expect(page.getByRole("article")).toHaveCount(5);
});
test('rendered text and focus pairs meet measured contrast thresholds', async({page})=>{
 await mockWallet(page);await loaded(page)
 const pairs=await page.evaluate(()=>{
  function rgb(s:string){return (s.match(/[\d.]+/g)??[]).slice(0,3).map(Number)}
  function luminosity(s:string){return rgb(s).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0)}
  function contrast(a:string,b:string){const x=luminosity(a),y=luminosity(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
  function background(el:Element|null):string{if(!el)return 'rgb(255, 255, 255)';const bg=getComputedStyle(el).backgroundColor;return bg==='rgba(0, 0, 0, 0)'||bg==='transparent'?background(el.parentElement):bg}
  const selectors=['.hero h1','.hero-copy','.how-card li p','.request-panel label','.collection p','.badge.state-2','.connect','.credit-panel p:not(.eyebrow)','.credit-value']
  const rows=selectors.map(selector=>{const el=document.querySelector(selector)!;const fg=getComputedStyle(el).color,bg=background(el);return{selector,foreground:fg,background:bg,ratio:contrast(fg,bg),minimum:4.5}})
  for(const selector of ['.full-width','.connect','.credit-action button']){const el=document.querySelector<HTMLElement>(selector)!;el.focus();const fg=getComputedStyle(el).outlineColor,bg=background(el.parentElement);rows.push({selector:selector+' focus',foreground:fg,background:bg,ratio:contrast(fg,bg),minimum:3})}
  return rows
 })
 for(const pair of pairs)expect(pair.ratio, pair.selector).toBeGreaterThanOrEqual(pair.minimum)
 await writeFile('../docs/evidence/contrast.json',JSON.stringify(pairs,null,2)+'\n')
})
