# Pawn frontend

A one-page, static Vite / React / TypeScript interface for the deployed NFTPawnShop on Sepolia. Source lives here; the publishable export is [`../dist/`](../dist/). No server, indexer, API key, private credential, wallet key, or WalletConnect project ID is required.

## Install, build and preview

Use Node 22.12+ (worker: Node 24.21.0, npm 11.19.0).

```sh
cd web
npm ci
npm run typecheck
npm run build
npm run verify
npm run preview
```

`npm run build` typechecks, builds with Vite `base: './'`, then generates the deployment manifest **after** all assets and ABI files are in place. Open the preview URL printed by Vite. To test a gateway-like subpath from the repository root:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
# Open http://127.0.0.1:4173/dist/
```

For development, run `npm run build` once and then `npm run dev` inside `web/`. Vite's development middleware serves the same built manifest and ABIs; no alternate deployment map is injected. After changing deployment inputs, rebuild before using development mode.

Publish the **contents** of `dist/`, including `imd-deployment.json` and `abi/`. This is a hash-anchor page; no server rewrites are needed. The publisher must deliver the committed bytes without rebuilding, rewriting HTML, or omitting lazy-loaded JavaScript chunks. Fonts and decoration use local system fonts and CSS; no third-party font or image request is needed.

## Configuration and ABI provenance

- `deployment.handoff.json` and `network.json` are the supplied deployment and network inputs, preserved unchanged. They are build inputs only, not bundled address maps.
- `scripts/export.mjs` reads `docs/abi/<Contract>.json` **from Git commit `570e88afbb3873e43e4a982d84dd7a47d034792b`**, compares it byte-for-byte with the working export, and verifies canonical Keccak-256 against the handoff. Canonicalization recursively sorts object keys and preserves array order, then hashes compact UTF-8 JSON. It copies the raw compiler-produced ABI arrays into `dist/abi/`.
- The script preserves the complete contract set, addresses, ABI hashes, chain, launch ID, source commit, and attestation hash. `network` and `walletAddChain` are copied unchanged as JSON objects. Every other exported file gets a lowercase SHA-256 entry; the manifest excludes itself.
- `src/config.ts` fetches `imd-deployment.json` at runtime and fetches its ABI paths, checks ABI hashes and network consistency, and creates all clients from that data. There is no separate deployed address, chain, router, or RPC map in application code. The standard interface in `src/chain.ts` is only for visitor-selected ERC-721 collections.
- Rebuilding requires the pinned Git commit to remain available. The removed `.imd/reads/` inputs are not needed after delivery. Do not edit the attested identifiers to point to unrelated contracts.

The network contains Uniswap deployment data but this assigned ETH-loan workflow has no token trading, quote, swap, or liquidity control. PAWN is displayed separately and is never required for a loan. Nothing approves Permit2 or a router. An optional WalletConnect connector is not configured; browser wallets exposing EIP-1193 are supported. When several extensions compete for `window.ethereum`, use the intended wallet browser or its selected injected provider.

## Contract flows and safeguards

1. **Request:** enter collection, uint256 token ID, exact ETH principal, flat ETH interest, and 1–8,760 whole hours. Check `ownerOf`, collection code and approval. Approve just that NFT to the shop, wait for a successful receipt, then separately review and submit `request`. An existing token/operator approval is recognized. Editing terms or changing wallet/chain invalidates the UI check; ownership and approval are checked again before signing.
2. **Loan book:** `loanCount()` and `loan(id)` enumerate IDs newest first, in pages of 12 with at most four concurrent loan calls. Every page is reachable. Filters explicitly apply to the current page. All data comes from contract views, without a backend, indexer or local activity cache. No log queries are used, so no unbounded deployment-to-head scan is made. A snapshot uses a single block number; views refresh every 15 seconds, manually, and after mined writes. They are reread on account/network changes and transaction preparation.
3. **Fund:** anyone, including the borrower, can fund a Requested loan. The review requires acknowledgement of collection risk. The transaction sends exactly the principal and credits the borrower; ETH is then separately withdrawn.
4. **Repay:** anyone can repay a Funded loan through `block.timestamp == deadline`, sending exactly principal plus flat interest. Collateral always goes to the borrower; the lender receives a withdrawal credit.
5. **Claim / cancel:** only the lender can claim after `block.timestamp > deadline`; only the borrower can cancel a Requested loan. Closed records remain visible. Time and eligibility use the latest block timestamp, with a fresh read and simulation before signing. A transaction can still lose a mining race.
6. **Withdraw:** reads and withdraws the connected account's entire credit. A changed credit requires a new review. Contract wallets must accept ETH and be able to control NFTs received by plain transfer.

All writes require the correct wallet chain, connected account, verified ABI configuration, successful RPC chain/code checks and fresh eligibility. Public RPCs are tried in the supplied order with wallet-provider read fallback. `wallet_switchEthereumChain` uses the manifest's chain ID; unknown-chain error 4902 triggers `wallet_addEthereumChain` using the supplied parameters, then another switch. Every action is simulated and reviewed before the wallet receives a signing request. Statuses distinguish preparation, simulation, signature, receipt, rejection, revert and confirmation; explorer links remain available after submission. A timeout does not claim failure or success; check the explorer before retrying. Repriced transactions follow the replacement; a cancelled/different transaction is not reported as a successful loan action.

## Collection and custody risk

The shop cannot vouch for a collection. A fake ERC-721 can lie about ownership; a collection can revert transfers. Either can cost its lender the principal. That warning appears next to **each** loan's collection address and in the funding review. There is no price oracle or automatic liquidation. NFTs sent by plain `transferFrom` outside `request` are untracked and cannot be rescued; unsolicited safe transfers revert. No administrator can override terms or recover unsupported assets.

## Validation

```sh
cd web
PLAYWRIGHT_BROWSERS_PATH=/tmp/pawn-browsers npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/pawn-browsers npm test
node scripts/live-check.mjs
npm run verify
```

When Chromium is already installed, set `PAWN_CHROMIUM` to its executable instead. The worker used `/home/imd1/.cache/ms-playwright/chromium-1246/chrome-linux64/chrome`. Tests serve the **production export** at `/dist/`, mock EIP-1193 and RPC responses, and never broadcast. Reports and screenshots go to `docs/evidence/`; temporary Playwright results are ignored. `scripts/live-check.mjs` only performs public chain/code/view reads. See [`docs/VALIDATION.md`](../docs/VALIDATION.md) for coverage, actual results and limitations, and [`docs/DESIGN.md`](../docs/DESIGN.md) for the implemented design.

`web/.gitignore` has a 1 KiB path budget (actual 75 bytes) and excludes dependency and cache directories at every nesting level inside `web/`. No dependency archive, submodule or vendored registry is needed. Do not add `node_modules` to Git.

The worker's `.git` is mounted read-only, so staging/committing failed at `.git/index.lock`. The source, lockfile, export and evidence are present for the contributor submission process; no branch commit was created by the worker. Publishing, IPFS pinning and named-site checks remain the publisher's responsibility.
