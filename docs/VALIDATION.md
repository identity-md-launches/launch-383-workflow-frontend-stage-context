# Frontend validation — 2026-09-27

## Outcome and scope

Implementation, static export, worker build/typecheck, browser inspection and mocked interaction validation are complete for the NFTPawnShop frontend. **Repository commit creation is blocked by the worker mount:** `git add -- ...` failed with `Unable to create .../.git/index.lock: Read-only file system`. The source, lockfile, production export and evidence remain present for the contributor submission process. No request for permission can change this worker's read-only Git metadata.

The assignment also asks for a repository-root `DESIGN.md`, while its overriding allowlist only permits `web/**`, `dist/**`, `docs/**` and explicitly `web/.gitignore`. The design deliverable is therefore [docs/DESIGN.md](DESIGN.md). No root build configuration or deployed Solidity source was edited. Existing implementation-derived ABIs remain untouched.

The approved workflow is a small ETH-loan page. PAWN is only the launch token: no swap, quote or liquidity behavior is specified in that workflow, and none is added. The complete network block, including its unused Uniswap addresses, is preserved. All borrower/lender actions are included; public reads work disconnected. Whole-hour duration entry is an intentional valid subset of the contract's 1-hour to 365-day range.

## Inputs and implementation plan applied

Read the supplied workflow, deployment and network handoffs, both protected Solidity test definitions, the Better Interface contents/workflow and all six domain cores, and the actual Solidity implementation/ABI handoff. The frontend does not change or redeploy those contracts.

Implemented in this order: validate the pinned ABI/deployment inputs; build runtime config loading and read/write guards; expose NFT approval/request and the complete loan/credit lifecycle; create the responsive interface; exercise the export with mocked wallets and live public reads; fix observed issues; regenerate and verify the manifest; document design, coverage and byte budgets. No private keys were accessed, no real transaction was broadcast, and no publication was attempted.

## Executed checks

| Check | Result / evidence |
| --- | --- |
| `npm install` plus locked upgrades and `npm audit fix` | Normal registry dependencies under `web/`; no vendored registry. Final lockfile present. |
| `npm run build` | Pass, exit 0. TypeScript + Vite + final manifest generation. [build.txt](evidence/build.txt) |
| `npm run typecheck` | Pass, exit 0, including application and interaction-test TypeScript. [typecheck.txt](evidence/typecheck.txt) |
| `npm run verify` | Pass, exit 0; complete export inventory, final-byte SHA-256, pinned raw ABIs, canonical Keccak and network equality. [manifest-check.txt](evidence/manifest-check.txt) |
| `PAWN_CHROMIUM=/home/imd1/.cache/ms-playwright/chromium-1246/chrome-linux64/chrome npm test` | **14 passed**, production files served at `http://127.0.0.1:4173/dist/`. [interactions.json](evidence/interactions.json) |
| `npm audit --json` | Zero reported vulnerabilities at check time. [dependency-audit.json](evidence/dependency-audit.json) |
| `node scripts/live-check.mjs` | Pass, read-only Sepolia chain/code/`loanCount` reads through the supplied PublicNode endpoint. [live-rpc.json](evidence/live-rpc.json) |
| Assigned browser tool, production `/dist/` | Live disconnected page rendered at 1,440×1,000 and 390×844. Observed verified state and zero live loans; no final console errors. [live-browser.json](evidence/live-browser.json), [browser-console.txt](evidence/browser-console.txt) |
| Accessibility and layout | Axe scan: no violations in rendered mocked desktop/mobile states for enabled WCAG 2 A/AA, 2.1 AA and 2.2 AA tags. No horizontal overflow at 1,440, 768, 390 or 320 px. 2× CSS zoom and RTL structural smoke tests passed. [accessibility.json](evidence/accessibility.json) |
| Rendered color measurements | Nine active text pairs ≥4.5:1, three focus pairs ≥3:1. [contrast.json](evidence/contrast.json) |

Final rebuilds after the last source change produce the same export hashes as the 14-test run. The manifest is regenerated only after the export is complete. The runtime uses this exact file, and loads the referenced ABI arrays.

### Interaction coverage

The tests use an injected EIP-1193 wallet and ABI-encoded mocked JSON-RPC responses, intercepting external requests. They assert actual outgoing function arguments and ETH values, simulate receipts and state changes, and never use funds.

1. Disconnected and missing-wallet states; disabled primary actions, actionable missing-wallet message, keyboard skip link and narrow reflow.
2. Wrong chain: switching fails with 4902, exact supplied `walletAddChain` parameters are offered, then switching succeeds.
3. Ownership check → individual NFT approval → receipt → separate request. Exact 18-decimal principal, flat interest, token ID and duration are asserted.
4. Fund, repay, lender claim, borrower cancel and full credit withdrawal; exact ETH values and zero value on nonpayable calls. Collection acknowledgement is required before funding.
5. Repayment at the exact deadline, no claim at equality, claim after the deadline, and stale repayment prevented by a fresh block check.
6. Simulation revert blocks submission; wallet rejection is recoverable; reverted receipt retains the explorer link and does not report success.
7. Account change clears pending review and previous role eligibility.
8. Missing deployed code and altered ABI both disable transactions/fail configuration loading.
9. Exact amount parsing rejects scientific notation, excess precision, zero principal, negative interest, fractional/out-of-range hours and oversized token IDs.
10. Desktop/mobile populated-loan accessibility scan, screenshots, reduced-motion preference, visible focus, 2× CSS zoom and RTL smoke checks.
11. Fourteen loans paginate into 12 and 2; every ID can be reached and page-local filter emptiness is recoverable.
12. Invalid principal focuses the correct field with `aria-invalid`; correction preserves inputs; existing approval works; changing token ID invalidates it.
13. Initial wallet-connection rejection displays a useful message and can be retried without losing read-only loan data.
14. Computed foreground/background and focus contrast measurements from the rendered page.

### Browser evidence

- [desktop.png](evidence/desktop.png), [mobile.png](evidence/mobile.png): mocked connected state, with Requested, Funded and overdue records and credited ETH. These are **test fixtures**, not live loans.
- [desktop-live.png](evidence/desktop-live.png), [mobile-live.png](evidence/mobile-live.png): real public RPC, disconnected wallet, actual empty loan book at observation time.
- The worker visually inspected desktop and mobile screenshots, full address wrapping, form hierarchy and list/collateral terms. Production assets, configuration, both ABI files and lazy application module loaded under `/dist/`. No external font/image resources were needed.

## Better Interface consolidated review

| Domain | Coverage and applied checks | Limitations |
| --- | --- | --- |
| Accessibility — Checked | Native controls/disclosures, bound labels, skip link, accessible action names, field-specific errors/focus, status/alert roles, 3 px focus, disabled prerequisite states, reduced motion; axe and keyboard skip/focus tests | No human screen-reader session or full keyboard-only wallet extension flow; automated checks are not WCAG certification |
| Layout — Checked | Source grids/logical properties and reading order; desktop/mobile, 320 px reflow, 2× CSS zoom and RTL smoke; long addresses wrap and controls stay inset | No native browser zoom, translated copy or device safe-area session |
| Writing — Checked | Consistent principal/flat-interest/repayment/credit terms; explicit transaction consequences; per-loan collection risk, custody warning, actionable empty/error states | No user research or localization review |
| Typography — Checked | Actual system stacks, descending heading hierarchy, 16 px inputs, 12 px minimum captions, unitless leading, numeric stability and wrapped addresses; rendered desktop/mobile views | System glyphs vary by OS; no downloaded font is claimed to have loaded |
| Colors — Checked | Token roles, actual rendered contrast, text-labeled statuses; dark-panel focus fix and remeasurement | Single light theme only; inactive controls excluded from active contrast assertions |
| UI — Checked | Normal/hover/press/disabled/loading/empty/error/success/review states; native disclosure; primary/neutral actions; 120 ms motion guard | No animation-panel slow replay (only brief button transitions); forced-colors style source-reviewed but no native assistive-technology session |

### Findings, repairs and rechecks

| Severity / domain | Source location | Observed issue and fix | Recheck |
| --- | --- | --- | --- |
| Medium / UI | `web/index.html:8` | Browser requested missing `/favicon.ico`; added an inline local SVG favicon. | Final browser console has zero errors. |
| High / UI, writing | `web/src/App.tsx:341` | Starting a second action left the prior success visible while asynchronous preparation started. Set the new preparation status synchronously. | Sequential approval/request and five-action lifecycle tests pass. |
| Medium / accessibility | `web/src/App.tsx:226`, `web/src/domain.ts:52` | Invalid terms initially focused the collection regardless of the failing field, while it was still disabled. Added field-aware errors and focus after validation settles. | Precision-error test asserts principal focus and `aria-invalid`; corrected flow passes. |
| Medium / writing | `web/src/domain.ts:32` | A plain EIP-1193 error object displayed `[object Object]` on connect rejection. Extract its message and give retry guidance. | Initial connect rejection/retry test passes. |
| Medium / colors, accessibility | `web/src/styles.css:610` | Blue focus on dark withdrawal background measured 2.08:1. Locally use the light surface token. | Rendered focus remeasured at 13.10:1; contrast test passes. |
| Low / typography | `web/src/styles.css:176`, `web/src/styles.css:503` | Supporting metadata had several sub-12 px declarations. Raised captions and labels to 0.75rem. | Final screenshots, axe and 320 px reflow tests pass. |
| High / transaction feedback | `web/src/chain.ts:219` | Source review found that a successful cancellation/replacement receipt could be described as a completed loan action. Track replacement reason and report changed/cancelled actions separately. | Typecheck/build pass; replacement callback path is source-reviewed, not browser-exercised. |

No known unresolved primary-action defect remains from these checks. Findings are local worker observations, not independent security or network certification.

## Integrity and delivery limits

The deployed source commit is `570e88afbb3873e43e4a982d84dd7a47d034792b`. Both pinned ABI hashes match the handoff. The manifest copies the exact two-contract set and network object. Export paths are local relative paths, with Vite `./` base; it includes every non-manifest export file and excludes itself from hashing. The export is about 532 KB, seven assets plus manifest, far below the 128-asset, 8 MiB/file and HTTP response-budget limits. No source maps, dependency archives, registries or package caches are published.

`web/.gitignore` is the sole changed ignore path; budget **1 KiB**, actual **75 bytes**. Its directory patterns apply at any nesting depth inside `web/`. Dependencies remain ignored; the export is not ignored. The complete prospective submission-size and scope check is recorded in [submission-budget.json](evidence/submission-budget.json). The local Git commit could not be created due to the read-only `.git` mount; the temporary bundle used for sizing is scratch evidence only, not a branch commit or delivered dependency artifact.

## Unperformed checks and remaining limitations

- No live wallet signing, approval, loan funding, repayment, claim, cancel, withdrawal or gas estimation against a funded account. Those workflows were tested with mocks; live reads confirm the chain, nonempty code and current zero-loan state only.
- Presence of code is not a byte-for-byte deployed-runtime audit. ABI hashes are implementation-derived and handoff-verified; arbitrary NFT collections remain explicitly untrusted.
- No public-RPC outage/rate-limit soak, long-lived tab, deep reorg, receipt timeout, replacement/cancellation callback, real extension disconnect or competing-wallet-provider integration test. The implementation rereads state, follows receipts and retains actionable errors, but those branches are not all browser-verified.
- No Safari, Firefox, native mobile browser, native screen reader or full keyboard-only extension session. CSS zoom/RTL checks are structural smoke tests, not native zoom/localization certification.
- No event history/indexer UI; authoritative views are sufficient for the requested lists. Since no logs are requested, deployment-block log chunking is not applicable. Pagination filters the current page and says so explicitly.
- No token swap/quote/approval flow; PAWN is not part of lending. No WalletConnect project ID was supplied.
- No site publishing, IPFS pinning, DNS/ENS naming, fixed-CID/named-copy HTTP checks or control-plane publication verification. Those belong to the publisher after source delivery.

Completion: **frontend deliverables and worker validation complete; main-repository commit blocked by read-only Git metadata; root design-file location replaced with the authorized docs path.**
