import { useCallback, useEffect, useRef, useState } from "react";
import { formatEther, formatUnits, type Address, type Hash } from "viem";
import type { Runtime } from "./config";
import {
  actionsFor,
  deadline,
  errorMessage,
  parseTerms,
  TermsError,
  same,
  short,
  states,
  type Loan,
  type Terms,
} from "./domain";
import {
  nftStatus,
  sendAction,
  shopRead,
  switchNetwork,
  verifyDeployment,
  type Action,
} from "./chain";
const risk =
  "Trust this collection before lending. False ownership reports or reverting transfers can cost you the principal.";
const initialTerms: Terms = {
  nft: "",
  tokenId: "",
  principal: "",
  interest: "0",
  hours: "168",
};
const PAGE_SIZE = 12n;
function AddressLink({
  runtime,
  address,
}: {
  runtime: Runtime;
  address: string;
}) {
  return (
    <a
      className="address"
      href={`${runtime.deployment.network.explorer}/address/${address}`}
      target="_blank"
      rel="noreferrer"
    >
      {address}
      <span aria-hidden="true"> ↗</span>
    </a>
  );
}
function Amount({ value }: { value: bigint }) {
  return (
    <span className="amount">
      {formatEther(value)} <span className="unit">ETH</span>
    </span>
  );
}
export default function App({ runtime }: { runtime: Runtime }) {
  const { deployment, provider } = runtime;
  const [account, setAccount] = useState<Address>(),
    [walletChain, setWalletChain] = useState<number>();
  const [verified, setVerified] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [connectionBusy, setConnectionBusy] = useState(false);
  const [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [txHash, setTxHash] = useState<Hash>();
  const [loans, setLoans] = useState<Loan[]>([]),
    [count, setCount] = useState(0n),
    [page, setPage] = useState(0n),
    [filter, setFilter] = useState("All loans");
  const [credit, setCredit] = useState(0n),
    [pawnBalance, setPawnBalance] = useState("0"),
    [block, setBlock] = useState<{ number: bigint; timestamp: bigint }>();
  const [terms, setTerms] = useState(initialTerms),
    [checked, setChecked] = useState<{ key: string; approved: boolean }>();
  const [formError, setFormError] = useState(""),
    [checking, setChecking] = useState(false),
    [review, setReview] = useState<Action>(),
    [trust, setTrust] = useState(false);
  const [invalidField, setInvalidField] = useState<keyof Terms>();
  const refreshId = useRef(0),
    formRef = useRef<HTMLFormElement>(null),
    reviewRef = useRef<HTMLElement>(null);
  const termsKey = JSON.stringify(terms) + account;
  const wrongChain = !!account && walletChain !== deployment.chainId;
  const ready =
    !!account &&
    !wrongChain &&
    verified &&
    !loading &&
    !busy &&
    !connectionBusy;
  const refresh = useCallback(async () => {
    const id = ++refreshId.current;
    setLoading(true);
    setVerified(false);
    try {
      await verifyDeployment(runtime);
      const currentBlock = await runtime.client.getBlock();
      const count = (await shopRead(
          runtime,
          "loanCount",
          [],
          currentBlock.number,
        )) as bigint,
        last = count - page * PAGE_SIZE;
      const ids = Array.from(
        {
          length: Number(
            last > 0n ? (last > PAGE_SIZE ? PAGE_SIZE : last) : 0n,
          ),
        },
        (_, i) => last - 1n - BigInt(i),
      );
      const records: Loan[] = [];
      // Four concurrent reads and twelve records per page. No indexer or log query.
      for (let i = 0; i < ids.length; i += 4)
        records.push(
          ...(await Promise.all(
            ids
              .slice(i, i + 4)
              .map(async (loanId) => ({
                ...((await shopRead(
                  runtime,
                  "loan",
                  [loanId],
                  currentBlock.number,
                )) as Omit<Loan, "id">),
                id: loanId,
              })),
          )),
        );
      const [balance, tokenBalance, decimals] = account
        ? await Promise.all([
            shopRead(runtime, "withdrawable", [account], currentBlock.number),
            runtime.client.readContract({
              address: runtime.token.address,
              abi: runtime.abis.LaunchToken,
              functionName: "balanceOf",
              args: [account],
              blockNumber: currentBlock.number,
            }),
            runtime.client.readContract({
              address: runtime.token.address,
              abi: runtime.abis.LaunchToken,
              functionName: "decimals",
              blockNumber: currentBlock.number,
            }),
          ])
        : [0n, 0n, 18];
      if (id !== refreshId.current) return;
      setCount(count);
      setLoans(records);
      setCredit(balance as bigint);
      setPawnBalance(formatUnits(tokenBalance as bigint, Number(decimals)));
      setBlock({
        number: currentBlock.number,
        timestamp: currentBlock.timestamp,
      });
      setVerified(true);
    } catch (e) {
      if (id === refreshId.current) {
        setVerified(false);
        setError(
          `Live reads unavailable. ${errorMessage(e)} Use Refresh to retry.`,
        );
      }
    } finally {
      if (id === refreshId.current) setLoading(false);
    }
  }, [runtime, account, page]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (!busy) void refresh();
    }, 15000);
    return () => {
      clearInterval(timer);
      refreshId.current++;
    };
  }, [refresh, busy]);
  useEffect(() => {
    if (!provider) return;
    const accountsChanged = (accounts: Address[]) => {
      setAccount(accounts[0]);
      setCredit(0n);
      setPawnBalance("0");
      setChecked(undefined);
      setReview(undefined);
      setVerified(false);
    };
    const chainChanged = (chain: string) => {
      setWalletChain(Number(chain));
      setChecked(undefined);
      setReview(undefined);
      setVerified(false);
      void refresh();
    };
    const disconnected = () => {
      accountsChanged([]);
      setWalletChain(undefined);
    };
    void Promise.all([
      provider.request({ method: "eth_accounts" }),
      provider.request({ method: "eth_chainId" }),
    ])
      .then(([accounts, chain]) => {
        setAccount(accounts[0]);
        setWalletChain(Number(chain));
      })
      .catch(() => {});
    provider.on?.("accountsChanged", accountsChanged);
    provider.on?.("chainChanged", chainChanged);
    provider.on?.("disconnect", disconnected);
    return () => {
      provider.removeListener?.("accountsChanged", accountsChanged);
      provider.removeListener?.("chainChanged", chainChanged);
      provider.removeListener?.("disconnect", disconnected);
    };
  }, [provider, refresh]);
  useEffect(() => {
    if (formError && !checking && invalidField)
      document.getElementById(invalidField)?.focus();
  }, [formError, checking, invalidField]);
  useEffect(() => {
    if (review) {
      setTrust(false);
      reviewRef.current?.focus();
    }
  }, [review]);
  async function connect() {
    setError("");
    setConnectionBusy(true);
    try {
      if (!provider)
        throw Error(
          "No browser wallet found. Open this page in an Ethereum wallet browser or install a browser wallet, then reload.",
        );
      const accounts = await provider.request({
        method: "eth_requestAccounts",
      });
      setAccount(accounts[0]);
      setWalletChain(Number(await provider.request({ method: "eth_chainId" })));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setConnectionBusy(false);
    }
  }
  async function changeChain() {
    setError("");
    setConnectionBusy(true);
    try {
      await switchNetwork(runtime);
      setWalletChain(
        Number(await provider!.request({ method: "eth_chainId" })),
      );
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setConnectionBusy(false);
    }
  }
  async function checkNFT() {
    setFormError("");
    setInvalidField(undefined);
    setChecked(undefined);
    setChecking(true);
    try {
      const parsed = parseTerms(terms);
      if (!ready)
        throw Error(
          "Connect your wallet on the correct network and wait for verified reads.",
        );
      const approved = await nftStatus(
        runtime,
        account!,
        parsed.nft,
        parsed.tokenId,
      );
      setChecked({ key: termsKey, approved });
      setStatus(
        approved
          ? "NFT ownership checked. Approval is already in place."
          : "NFT ownership checked. Approve this token before requesting a loan.",
      );
    } catch (e) {
      setFormError(errorMessage(e));
      setInvalidField(e instanceof TermsError ? e.field : "nft");
    } finally {
      setChecking(false);
    }
  }
  function requestReview(kind: "approve" | "request") {
    try {
      const parsed = parseTerms(terms);
      setReview({
        kind,
        title: kind === "approve" ? "Approve this NFT" : "Request this loan",
        description:
          kind === "approve"
            ? `Allow the pawn shop to transfer token #${parsed.tokenId} from ${parsed.nft}. Approval alone does not create a loan. You can revoke it through your collection before requesting.`
            : `Deposit token #${parsed.tokenId} from ${parsed.nft} into the shop. Ask for ${formatEther(parsed.principal)} ETH; total repayment is ${formatEther(parsed.principal + parsed.interest)} ETH within ${terms.hours} hours of funding. The NFT stays in custody until cancellation, repayment, or a lender’s default claim.`,
        value: 0n,
        terms: parsed,
      });
    } catch (e) {
      setFormError(errorMessage(e));
    }
  }
  function loanReview(loan: Loan, kind: "fund" | "repay" | "cancel" | "claim") {
    const descriptions = {
      fund: `Send ${formatEther(loan.principal)} ETH to credit borrower ${loan.borrower}. Repayment totals ${formatEther(loan.principal + loan.interest)} ETH. The ${loan.duration / 3600n}-hour term starts when funding is mined. Collateral: ${loan.nft}, token #${loan.tokenId}. ${risk}`,
      repay: `Send ${formatEther(loan.principal + loan.interest)} ETH to credit the lender. Token #${loan.tokenId} returns to borrower ${loan.borrower}, even when someone else pays. Deadline: ${deadline(loan.deadline)}.`,
      cancel: `Cancel the unfunded request and return token #${loan.tokenId} to borrower ${loan.borrower}. This loan ID cannot be reopened.`,
      claim: `Take token #${loan.tokenId} from ${loan.nft} as collateral for this overdue loan. This closes the loan as Defaulted; no ETH is refunded.`,
    };
    setReview({
      kind,
      id: loan.id,
      title: `${kind[0].toUpperCase() + kind.slice(1)} loan #${loan.id}`,
      description: descriptions[kind],
      value:
        kind === "fund"
          ? loan.principal
          : kind === "repay"
            ? loan.principal + loan.interest
            : 0n,
    });
  }
  async function confirm() {
    if (!review || !ready || (review.kind === "fund" && !trust)) return;
    setBusy(true);
    setError("");
    setTxHash(undefined);
    setStatus("Preparing this transaction…");
    const action = review;
    try {
      await sendAction(runtime, account!, action, (message, hash) => {
        setStatus(message);
        if (hash) setTxHash(hash);
      });
      setReview(undefined);
      if (action.kind === "approve")
        setChecked({ key: termsKey, approved: true });
      if (action.kind === "request") {
        setChecked(undefined);
        setTerms(initialTerms);
        setPage(0n);
      }
      await refresh();
      setStatus("Transaction confirmed. Refreshing the latest contract state.");
    } catch (e) {
      setError(errorMessage(e));
      setStatus("");
      setChecked(undefined);
    } finally {
      setBusy(false);
    }
  }
  const filtered = loans.filter(
    (loan) =>
      filter === "All loans" ||
      (filter === "Open requests" && loan.state === 0) ||
      (filter === "Active loans" && loan.state === 2) ||
      (filter === "My loans" &&
        (same(loan.borrower, account) || same(loan.lender, account))),
  );
  const checkedNow = checked?.key === termsKey;
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header wrap">
        <a className="brand" href="#main" aria-label="Pawn home">
          <span className="brand-mark" aria-hidden="true">
            ♟
          </span>
          pawn.
        </a>
        <nav aria-label="Main navigation">
          <a href="#loans">Loan book</a>
          <a href="#how-it-works">How it works</a>
        </nav>
        <div className="wallet">
          <span className="network-tag">
            ● {deployment.network.name} testnet
          </span>
          <button
            className="connect"
            onClick={connect}
            disabled={connectionBusy || busy}
          >
            {connectionBusy
              ? "Connecting…"
              : account
                ? short(account)
                : "Connect wallet"}
          </button>
        </div>
      </header>
      <main id="main" className="wrap">
        <section className="hero" aria-labelledby="hero-title">
          <div>
            <p className="eyebrow">NFT COLLATERAL. PEER-TO-PEER CREDIT.</p>
            <h1 id="hero-title">
              Keep the upside.
              <br />
              <em>Borrow against it.</em>
            </h1>
            <p className="hero-copy">
              Set your terms. Put an NFT to work. Borrow or lend ETH directly,
              with no platform fees.
            </p>
            <a className="text-link" href="#request">
              Create a loan request ↗
            </a>
          </div>
          <div className="how-card" id="how-it-works">
            <div className="card-top">
              <span className="eyebrow">THE PAWN AGREEMENT</span>
              <span aria-hidden="true">↙ ↗</span>
            </div>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <strong>Lock your NFT</strong>
                  <p>Approve one token. Set the amount and term.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Find your lender</strong>
                  <p>Once funded, withdraw your ETH credit.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Repay. Get it back.</strong>
                  <p>Miss the deadline and the lender can claim the NFT.</p>
                </div>
              </li>
            </ol>
            <p className="testnet-note">
              A Sepolia experiment. Use test ETH only.
            </p>
          </div>
        </section>
        <section
          className="connection-panel"
          aria-label="Connection and transaction status"
        >
          <div className="connection-row">
            <p>
              <span className="dot" aria-hidden="true" />
              {loading
                ? "Reading contracts…"
                : verified
                  ? "Deployment checks passed"
                  : "Live reads unavailable"}
              {block && (
                <span className="block">
                  {" "}
                  · Block {block.number.toString()}
                </span>
              )}
            </p>
            <button
              className="small-button"
              disabled={loading || busy}
              onClick={() => {
                setError("");
                void refresh();
              }}
            >
              Refresh
            </button>
          </div>
          {!account && (
            <p className="muted">
              Browse the loan book below. Connect a wallet to request, fund, or
              manage a loan.
            </p>
          )}
          {account && (
            <p className="muted">
              Connected: <AddressLink runtime={runtime} address={account} /> ·
              PAWN balance: <span className="amount">{pawnBalance}</span>
            </p>
          )}
          {wrongChain && (
            <div className="notice warning">
              <p>
                Your wallet is on a different network. Actions require{" "}
                {deployment.network.name}.
              </p>
              <button onClick={changeChain} disabled={connectionBusy || busy}>
                Switch to {deployment.network.name}
              </button>
            </div>
          )}
          <p className="status-message" role="status">
            {status}
          </p>
          {error && (
            <div className="notice error" role="alert">
              <p>{error}</p>
              <button className="small-button" onClick={() => setError("")}>
                Dismiss message
              </button>
            </div>
          )}
          {txHash && (
            <a
              className="tx-link"
              href={`${deployment.network.explorer}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              View transaction {short(txHash)} ↗
            </a>
          )}
        </section>
        {review && (
          <section
            className="review-panel"
            aria-labelledby="review-title"
            tabIndex={-1}
            ref={reviewRef}
          >
            <p className="eyebrow">REVIEW BEFORE SIGNING</p>
            <h2 id="review-title">{review.title}</h2>
            <p>{review.description}</p>
            <p>
              <strong>
                {review.kind === "withdraw" ? "Receive" : "Send"}:{" "}
                <Amount value={review.value} />
              </strong>{" "}
              · Network gas is additional.
            </p>
            {review.kind === "fund" && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={trust}
                  onChange={(e) => setTrust(e.target.checked)}
                />
                I have checked this collection and accept the risk of losing the
                principal.
              </label>
            )}
            <div className="button-row">
              <button
                className="primary"
                disabled={!ready || (review.kind === "fund" && !trust)}
                onClick={confirm}
              >
                {busy ? "Transaction in progress…" : "Confirm in wallet"}
              </button>
              <button disabled={busy} onClick={() => setReview(undefined)}>
                Back to page
              </button>
            </div>
          </section>
        )}
        <div className="workspace">
          <section
            className="request-panel"
            id="request"
            aria-labelledby="request-title"
          >
            <div className="section-kicker">
              <span>01 / BORROW</span>
              <span aria-hidden="true">↗</span>
            </div>
            <h2 id="request-title">Request a loan</h2>
            <p className="muted">
              Your NFT is the collateral. You choose the terms.
            </p>
            <form
              ref={formRef}
              onChange={() => {
                setFormError("");
                setInvalidField(undefined);
              }}
              onSubmit={(e) => {
                e.preventDefault();
                void checkNFT();
              }}
            >
              <label htmlFor="nft">Collection address</label>
              <input
                id="nft"
                name="nft"
                aria-invalid={invalidField === "nft"}
                autoComplete="off"
                placeholder="0x…"
                value={terms.nft}
                required
                pattern="0x[a-fA-F0-9]{40}"
                disabled={busy || checking}
                onChange={(e) => {
                  setTerms({ ...terms, nft: e.target.value });
                  setFormError("");
                }}
                aria-describedby="collection-help form-error"
              />
              <p className="field-help" id="collection-help">
                The ERC-721 contract, not your wallet address.
              </p>
              <label htmlFor="tokenId">Token ID</label>
              <input
                id="tokenId"
                name="tokenId"
                aria-describedby="form-error"
                aria-invalid={invalidField === "tokenId"}
                autoComplete="off"
                inputMode="numeric"
                placeholder="e.g. 42"
                pattern="[0-9]+"
                required
                disabled={busy || checking}
                value={terms.tokenId}
                onChange={(e) =>
                  setTerms({ ...terms, tokenId: e.target.value })
                }
              />
              <div className="form-grid">
                <div>
                  <label htmlFor="principal">Principal · ETH</label>
                  <input
                    id="principal"
                    name="principal"
                    aria-describedby="form-error"
                    aria-invalid={invalidField === "principal"}
                    autoComplete="off"
                    inputMode="decimal"
                    placeholder="e.g. 0.1"
                    required
                    disabled={busy || checking}
                    value={terms.principal}
                    onChange={(e) =>
                      setTerms({ ...terms, principal: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label htmlFor="interest">Flat interest · ETH</label>
                  <input
                    id="interest"
                    name="interest"
                    aria-describedby="form-error"
                    aria-invalid={invalidField === "interest"}
                    autoComplete="off"
                    inputMode="decimal"
                    required
                    disabled={busy || checking}
                    value={terms.interest}
                    onChange={(e) =>
                      setTerms({ ...terms, interest: e.target.value })
                    }
                  />
                </div>
              </div>
              <label htmlFor="hours">Duration · hours</label>
              <input
                id="hours"
                name="hours"
                aria-invalid={invalidField === "hours"}
                type="number"
                min="1"
                max="8760"
                step="1"
                required
                disabled={busy || checking}
                value={terms.hours}
                onChange={(e) => setTerms({ ...terms, hours: e.target.value })}
                aria-describedby="duration-help form-error"
              />
              <p className="field-help" id="duration-help">
                1–8,760 hours. Starts when a lender funds the loan.
              </p>
              <div className="repayment-summary">
                <span>Total repayment</span>
                <strong>
                  {(() => {
                    try {
                      const p = parseTerms(terms);
                      return <Amount value={p.principal + p.interest} />;
                    } catch {
                      return "— ETH";
                    }
                  })()}
                </strong>
              </div>
              <p id="form-error" className="field-error" role="alert">
                {formError}
              </p>
              <button
                className="full-width"
                type="submit"
                disabled={!ready || checking}
              >
                {checking
                  ? "Checking NFT…"
                  : checkedNow
                    ? "Recheck NFT ownership"
                    : "Check NFT ownership"}
              </button>
              <div className="approval-steps">
                <button
                  type="button"
                  disabled={!ready || !checkedNow || checked!.approved}
                  onClick={() => requestReview("approve")}
                >
                  <span>1</span>
                  {checkedNow && checked!.approved
                    ? "NFT approved ✓"
                    : "Approve NFT"}
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={!ready || !checkedNow || !checked!.approved}
                  onClick={() => requestReview("request")}
                >
                  <span>2</span>Request loan
                </button>
              </div>
              <p className="field-help">
                {!account
                  ? "Connect a wallet to begin."
                  : wrongChain
                    ? "Switch networks to begin."
                    : !verified
                      ? "Waiting for verified contract reads."
                      : "Approval and request are separate transactions."}
              </p>
            </form>
            <p className="custody-note">
              Only deposit through this request flow. NFTs sent directly with a
              plain transfer cannot be tracked or recovered. There is no admin
              to rescue them.
            </p>
          </section>
          <section
            className="loan-panel"
            id="loans"
            aria-labelledby="loans-title"
          >
            <div className="section-kicker">
              <span>02 / LEND & MANAGE</span>
              <span>{count.toString()} TOTAL</span>
            </div>
            <div className="section-heading">
              <h2 id="loans-title">The loan book</h2>
              <p className="muted">On-chain terms. A direct agreement.</p>
            </div>
            <div className="filters" aria-label="Filter loans on this page">
              {["All loans", "Open requests", "Active loans", "My loans"].map(
                (item) => (
                  <button
                    key={item}
                    aria-pressed={filter === item}
                    disabled={item === "My loans" && !account}
                    onClick={() => setFilter(item)}
                  >
                    {item}
                  </button>
                ),
              )}
            </div>
            <p className="list-caption">
              Latest first ·{" "}
              {count > 0n
                ? `IDs ${count - page * PAGE_SIZE - 1n}–${count - (page + 1n) * PAGE_SIZE > 0n ? count - (page + 1n) * PAGE_SIZE : 0n}`
                : "No records yet"}{" "}
              · Filters apply to this page.
            </p>
            {!verified && !loading && (
              <div className="empty">
                <h3>Loan data could not be verified</h3>
                <p>
                  Check your connection and use Refresh. Actions remain
                  disabled.
                </p>
              </div>
            )}
            {loading && !block && (
              <div className="empty">
                <h3>Reading the loan book…</h3>
                <p>Fetching the latest contract state.</p>
              </div>
            )}
            {verified && filtered.length === 0 && (
              <div className="empty">
                <div className="empty-symbol" aria-hidden="true">
                  ↗
                </div>
                <h3>
                  {count === 0n
                    ? "The first agreement starts here."
                    : "No matching loans on this page."}
                </h3>
                <p>
                  {count === 0n
                    ? "Request a loan with your NFT, or check back for a request to fund."
                    : "Choose another filter or move to an older page of loans."}
                </p>
                {count === 0n ? (
                  <a className="text-link" href="#request">
                    Create a loan request ↗
                  </a>
                ) : (
                  <button onClick={() => setFilter("All loans")}>
                    Show all loans on this page
                  </button>
                )}
              </div>
            )}
            {filtered.map((loan) => {
              const actions = actionsFor(loan, account, block?.timestamp ?? 0n);
              return (
                <article
                  className="loan-card"
                  key={loan.id.toString()}
                  aria-label={`Loan ${loan.id}`}
                >
                  <div className="loan-heading">
                    <h3>
                      Loan #{loan.id.toString()}{" "}
                      <span>· NFT #{loan.tokenId.toString()}</span>
                    </h3>
                    <span className={`badge state-${loan.state}`}>
                      {states[loan.state] ?? "Unknown"}
                    </span>
                  </div>
                  <div className="collection">
                    <span className="field-label">Collection</span>
                    <AddressLink runtime={runtime} address={loan.nft} />
                    <p>{risk}</p>
                  </div>
                  <dl className="loan-numbers">
                    <div>
                      <dt>Principal</dt>
                      <dd>
                        <Amount value={loan.principal} />
                      </dd>
                    </div>
                    <div>
                      <dt>Flat interest</dt>
                      <dd>
                        <Amount value={loan.interest} />
                      </dd>
                    </div>
                    <div>
                      <dt>Total repayment</dt>
                      <dd>
                        <Amount value={loan.principal + loan.interest} />
                      </dd>
                    </div>
                    <div>
                      <dt>Term</dt>
                      <dd>{(loan.duration / 3600n).toString()} hours</dd>
                    </div>
                  </dl>
                  <p className="deadline">
                    {loan.state === 0
                      ? "The repayment clock starts at funding."
                      : loan.deadline
                        ? `${loan.state === 2 && (block?.timestamp ?? 0n) > loan.deadline ? "Overdue · " : ""}Deadline: ${deadline(loan.deadline)}`
                        : "Cancelled before funding."}
                  </p>
                  <details>
                    <summary>Borrower & lender</summary>
                    <p>
                      Borrower:{" "}
                      <AddressLink runtime={runtime} address={loan.borrower} />
                    </p>
                    {loan.state !== 0 && loan.state !== 1 && (
                      <p>
                        Lender:{" "}
                        <AddressLink runtime={runtime} address={loan.lender} />
                      </p>
                    )}
                  </details>
                  <div className="button-row">
                    {actions.fund && (
                      <button
                        disabled={!ready}
                        onClick={() => loanReview(loan, "fund")}
                      >
                        Fund <Amount value={loan.principal} />
                      </button>
                    )}
                    {actions.cancel && (
                      <button
                        disabled={!ready}
                        onClick={() => loanReview(loan, "cancel")}
                      >
                        Cancel request
                      </button>
                    )}
                    {actions.repay && (
                      <button
                        disabled={!ready}
                        onClick={() => loanReview(loan, "repay")}
                      >
                        Repay <Amount value={loan.principal + loan.interest} />
                      </button>
                    )}
                    {actions.claim && (
                      <button
                        disabled={!ready}
                        onClick={() => loanReview(loan, "claim")}
                      >
                        Claim NFT
                      </button>
                    )}
                  </div>
                  {loan.state === 2 && (
                    <p className="field-help">
                      {(block?.timestamp ?? 0n) > loan.deadline
                        ? "Only the lender can claim after the deadline."
                        : "Anyone may repay. The NFT always returns to the borrower."}
                    </p>
                  )}
                </article>
              );
            })}
            {count > PAGE_SIZE && (
              <div className="pagination">
                <button
                  disabled={page === 0n || loading || busy}
                  onClick={() => setPage(page - 1n)}
                >
                  Newer loans
                </button>
                <span>Page {(page + 1n).toString()}</span>
                <button
                  disabled={(page + 1n) * PAGE_SIZE >= count || loading || busy}
                  onClick={() => setPage(page + 1n)}
                >
                  Older loans
                </button>
              </div>
            )}
            <p className="list-note">
              Deadlines use the latest block time
              {block ? ` (${deadline(block.timestamp)})` : ""}. Repayment is
              allowed at the deadline; claiming starts after it. Mining time
              determines the outcome.
            </p>
          </section>
        </div>
        <section className="credit-panel" aria-labelledby="credit-title">
          <div>
            <p className="eyebrow">03 / COLLECT</p>
            <h2 id="credit-title">Your available credit</h2>
            <p>
              Funding credits the borrower. Repayment credits the lender.
              <br />
              Withdraw to move that ETH into your connected wallet.
            </p>
          </div>
          <div className="credit-action">
            <strong className="credit-value">
              {account && verified ? <Amount value={credit} /> : "— ETH"}
            </strong>
            <button
              disabled={!ready || credit === 0n}
              onClick={() =>
                setReview({
                  kind: "withdraw",
                  title: "Withdraw your ETH credit",
                  description: `Withdraw all ${formatEther(credit)} ETH credited to ${account}. Your wallet must accept ETH. A failed transfer leaves the credit intact.`,
                  value: credit,
                })
              }
            >
              Withdraw ETH <span aria-hidden="true">↗</span>
            </button>
          </div>
        </section>
        <section
          className="fine-print"
          aria-label="Risks and token information"
        >
          <p>
            <strong>Know the agreement.</strong> Any ERC-721 collection can be
            offered. Pawn does not verify a collection’s value or behavior. A
            malicious collection can cause a lender to lose the principal. There
            is no price oracle, automatic liquidation, or recovery service.
            Outgoing NFTs use plain transfers; contract wallets must be able to
            control them.
          </p>
          <p>
            <strong>ETH loans. No PAWN required.</strong> PAWN is the separate
            launch token and does not pay loan principal or interest. This page
            provides the loan workflow; it does not trade tokens.
          </p>
        </section>
      </main>
      <footer className="wrap">
        <div className="footer-top">
          <a className="brand" href="#main">
            pawn.
          </a>
          <span>Independent terms. Shared trust.</span>
          <span>
            {deployment.network.name} · {deployment.chainId}
          </span>
        </div>
        <div className="contract-links">
          {deployment.contracts.map((c) => (
            <div key={c.name}>
              <span>{c.name}</span>
              <AddressLink runtime={runtime} address={c.address} />
            </div>
          ))}
        </div>
        <details>
          <summary>Deployment & verification details</summary>
          <p>Launch {deployment.launchId}</p>
          <p>
            Source commit <code>{deployment.sourceCommit}</code>
          </p>
          <p>
            Attestation <code>{deployment.attestationHash}</code>
          </p>
          <p>
            ABI hashes, chain ID, and nonempty code are checked before writes.
            This is not an audit of a collection.
          </p>
          <a href="./imd-deployment.json">View runtime deployment manifest</a>
        </details>
      </footer>
    </>
  );
}
