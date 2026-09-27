import {
  createWalletClient,
  custom,
  parseAbi,
  type Abi,
  type Address,
  type Hash,
} from "viem";
import type { Runtime } from "./config";
import { actionsFor, same, type Loan } from "./domain";
export const nftAbi = parseAbi([
  "function ownerOf(uint256) view returns (address)",
  "function getApproved(uint256) view returns (address)",
  "function isApprovedForAll(address,address) view returns (bool)",
  "function approve(address,uint256)",
]);
export type Action = {
  kind:
    "approve" | "request" | "fund" | "repay" | "cancel" | "claim" | "withdraw";
  title: string;
  description: string;
  value: bigint;
  id?: bigint;
  terms?: {
    nft: Address;
    tokenId: bigint;
    principal: bigint;
    interest: bigint;
    duration: bigint;
  };
};
export const shopRead = (
  r: Runtime,
  functionName: string,
  args: readonly unknown[] = [],
  blockNumber?: bigint,
) =>
  r.client.readContract({
    address: r.shop.address,
    abi: r.abis.NFTPawnShop,
    functionName,
    args,
    blockNumber,
  });
export async function verifyDeployment(r: Runtime) {
  if ((await r.client.getChainId()) !== r.deployment.chainId)
    throw Error(
      "RPC returned the wrong chain. Transactions are disabled. Retry the connection.",
    );
  for (const c of r.deployment.contracts) {
    const code = await r.client.getCode({ address: c.address });
    if (!code || code === "0x")
      throw Error(
        `No deployed code found for ${c.name}. Transactions are disabled.`,
      );
  }
}
export async function nftStatus(
  r: Runtime,
  account: Address,
  nft: Address,
  tokenId: bigint,
) {
  const code = await r.client.getCode({ address: nft });
  if (!code || code === "0x")
    throw Error(
      "No NFT contract at this address. Check the collection and network.",
    );
  const read = (functionName: string, args: readonly unknown[]) =>
    r.client.readContract({
      address: nft,
      abi: nftAbi as Abi,
      functionName,
      args,
    });
  const owner = (await read("ownerOf", [tokenId])) as Address;
  if (!same(owner, account))
    throw Error(
      "This wallet does not own that NFT. Check the token ID or change wallets.",
    );
  const [approved, operator] = await Promise.all([
    read("getApproved", [tokenId]),
    read("isApprovedForAll", [account, r.shop.address]),
  ]);
  return same(approved as Address, r.shop.address) || operator === true;
}
export async function switchNetwork(r: Runtime) {
  if (!r.provider)
    throw Error(
      "Open this page in a browser with an Ethereum wallet, then reload.",
    );
  try {
    await r.provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: r.deployment.walletAddChain.chainId }],
    });
  } catch (error: any) {
    const code =
      error.code ?? error.cause?.code ?? error.data?.originalError?.code;
    if (
      code !== 4902 &&
      !/unknown chain|unrecognized chain|chain.*not.*added/i.test(
        error.message ?? "",
      )
    )
      throw error;
    await r.provider.request({
      method: "wallet_addEthereumChain",
      params: [r.deployment.walletAddChain],
    });
    await r.provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: r.deployment.walletAddChain.chainId }],
    });
  }
}
export async function sendAction(
  r: Runtime,
  account: Address,
  action: Action,
  update: (message: string, hash?: Hash) => void,
) {
  const provider = r.provider;
  if (!provider)
    throw Error(
      "No browser wallet found. Open this page in your wallet browser and reload.",
    );
  const assertWallet = async () => {
    const [chain, accounts] = await Promise.all([
      provider.request({ method: "eth_chainId" }),
      provider.request({ method: "eth_accounts" }),
    ]);
    if (Number(chain) !== r.deployment.chainId || !same(accounts[0], account))
      throw Error(
        "Wallet or network changed. Reconnect and review the action again.",
      );
  };
  await assertWallet();
  await verifyDeployment(r);
  update("Checking the latest contract state…");
  const block = await r.client.getBlock();
  let address = r.shop.address,
    abi = r.abis.NFTPawnShop,
    functionName: string = action.kind,
    args: readonly unknown[] = [];
  if (action.kind === "approve" || action.kind === "request") {
    const terms = action.terms!,
      approved = await nftStatus(r, account, terms.nft, terms.tokenId);
    if (action.kind === "approve") {
      address = terms.nft;
      abi = nftAbi;
      functionName = "approve";
      args = [r.shop.address, terms.tokenId];
    } else {
      if (!approved)
        throw Error(
          "Approve this NFT first, wait for confirmation, then check it again.",
        );
      args = [
        terms.nft,
        terms.tokenId,
        terms.principal,
        terms.interest,
        terms.duration,
      ];
    }
  } else if (action.kind === "withdraw") {
    const credit = (await shopRead(
      r,
      "withdrawable",
      [account],
      block.number,
    )) as bigint;
    if (credit === 0n)
      throw Error("No ETH credit remains. Refresh the balances.");
    if (credit !== action.value)
      throw Error(
        "Your credit changed. Refresh and review the withdrawal again.",
      );
  } else {
    const loan = {
      ...((await shopRead(r, "loan", [action.id!], block.number)) as Omit<
        Loan,
        "id"
      >),
      id: action.id!,
    };
    if (!actionsFor(loan, account, block.timestamp)[action.kind])
      throw Error(
        "This action is no longer available. Refresh the loans and check the deadline or wallet role.",
      );
    const expected =
      action.kind === "fund"
        ? loan.principal
        : action.kind === "repay"
          ? loan.principal + loan.interest
          : 0n;
    if (action.value !== expected)
      throw Error("The amount changed. Refresh and review again.");
    args = [action.id!];
  }
  update("Simulating the transaction…");
  const { request } = await r.client.simulateContract({
    address,
    abi,
    functionName,
    args,
    account,
    value: action.kind === "withdraw" ? 0n : action.value,
  });
  await assertWallet();
  update("Confirm the transaction in your wallet…");
  const hash = await createWalletClient({
    chain: r.chain,
    transport: custom(provider),
  }).writeContract({ ...request, account, chain: r.chain });
  update("Submitted. Waiting for a receipt…", hash);
  let receipt;
  let actionReplaced = false;
  try {
    receipt = await r.client.waitForTransactionReceipt({
      hash,
      timeout: 120_000,
      onReplaced: (replacement) => {
        if (replacement.reason !== "repriced") actionReplaced = true;
        update(
          "Transaction replaced. Waiting for confirmation…",
          replacement.transaction.hash,
        );
      },
    });
  } catch {
    throw Error(
      "Transaction submitted, but its receipt is not confirmed here. Check the explorer before trying again; refresh state when it is mined.",
    );
  }
  if (actionReplaced)
    throw Error("The original action was cancelled or replaced with a different transaction. Check the replacement in the explorer and refresh the loans before trying again.");
  if (receipt.status !== "success")
    throw Error(
      "Transaction reverted on-chain. No contract change was applied; gas may have been spent. Refresh and review the current state.",
    );
  update(
    "Confirmed on-chain. Refreshing balances and loans…",
    receipt.transactionHash,
  );
  return receipt.transactionHash;
}
