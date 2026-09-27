import { type Page } from "@playwright/test";
import {
  decodeFunctionData,
  encodeFunctionResult,
  parseEther,
  toHex,
  zeroAddress,
  type Abi,
  type Address,
} from "viem";
import handoff from "../deployment.handoff.json" with { type: "json" };
import chainConfig from "../network.json" with { type: "json" };
import shopJson from "../../docs/abi/NFTPawnShop.json" with { type: "json" };
import tokenJson from "../../docs/abi/LaunchToken.json" with { type: "json" };
import { nftAbi } from "../src/chain";
import type { Loan } from "../src/domain";
const shopAbi = shopJson as Abi,
  tokenAbi = tokenJson as Abi;
export const me = "0x1111111111111111111111111111111111111111" as Address;
export const other = "0x2222222222222222222222222222222222222222" as Address;
export const nft = "0x3333333333333333333333333333333333333333" as Address;
const shop = handoff.contracts.find((c) => c.name === "NFTPawnShop")!.address;
const token = handoff.contracts.find((c) => c.name === "LaunchToken")!.address;
const blockHash = "0x" + "ab".repeat(32),
  txHash = "0x" + "cd".repeat(32);
export async function mockWallet(
  page: Page,
  options: {
    connected?: boolean;
    wrongChain?: boolean;
    noWallet?: boolean;
    empty?: boolean;
    noCode?: boolean;
  } = {},
) {
  const state = {
    connected: options.connected ?? true,
    account: me,
    chain: options.wrongChain ? "0x1" : chainConfig.walletAddChain.chainId,
    added: !options.wrongChain,
    approved: false,
    reject: false,
    revert: false,
    receiptRevert: false,
    noCode: options.noCode ?? false,
    credit: parseEther("0.2"),
    now: 1790480000n,
    sent: [] as any[],
    calls: [] as any[],
    block: 12000000n,
    loans: [] as Loan[],
  };
  const make = (
    id: bigint,
    borrower: Address,
    status: number,
    deadline: bigint,
  ): Loan => ({
    id,
    borrower,
    lender: status === 2 ? me : zeroAddress,
    nft,
    tokenId: 42n + id,
    principal: parseEther("0.1"),
    interest: parseEther("0.01"),
    duration: 604800n,
    deadline,
    state: status,
  });
  state.loans = options.empty
    ? []
    : [
        make(0n, me, 0, 0n),
        make(1n, other, 0, 0n),
        make(2n, other, 2, state.now + 3600n),
        make(3n, other, 2, state.now - 1n),
        make(4n, other, 2, state.now),
      ];
  const currentBlock = () => ({
    number: toHex(state.block),
    hash: blockHash,
    parentHash: blockHash,
    nonce: "0x0000000000000000",
    sha3Uncles: blockHash,
    logsBloom: "0x" + "00".repeat(256),
    transactionsRoot: blockHash,
    stateRoot: blockHash,
    receiptsRoot: blockHash,
    miner: zeroAddress,
    difficulty: "0x0",
    totalDifficulty: "0x0",
    extraData: "0x",
    size: "0x100",
    gasLimit: "0x1c9c380",
    gasUsed: "0x5208",
    timestamp: toHex(state.now),
    transactions: [],
    uncles: [],
    baseFeePerGas: "0x1",
  });
  const decode = (tx: any) => {
    const abi =
      tx.to.toLowerCase() === shop.toLowerCase()
        ? shopAbi
        : tx.to.toLowerCase() === token.toLowerCase()
          ? tokenAbi
          : nftAbi;
    return { abi, ...decodeFunctionData({ abi, data: tx.data }) };
  };
  function result(tx: any) {
    const { abi, functionName, args = [] } = decode(tx);
    if (functionName === "loanCount")
      return encodeFunctionResult({
        abi,
        functionName,
        result: BigInt(state.loans.length),
      });
    if (functionName === "loan")
      return encodeFunctionResult({
        abi,
        functionName,
        result: state.loans[Number(args[0])],
      });
    if (functionName === "withdrawable")
      return encodeFunctionResult({ abi, functionName, result: state.credit });
    if (functionName === "decimals")
      return encodeFunctionResult({ abi, functionName, result: 18 });
    if (functionName === "balanceOf")
      return encodeFunctionResult({
        abi,
        functionName,
        result: parseEther("25"),
      });
    if (functionName === "ownerOf")
      return encodeFunctionResult({ abi, functionName, result: state.account });
    if (functionName === "getApproved")
      return encodeFunctionResult({
        abi,
        functionName,
        result: state.approved ? shop : zeroAddress,
      });
    if (functionName === "isApprovedForAll")
      return encodeFunctionResult({ abi, functionName, result: false });
    if (state.revert)
      throw { code: 3, message: "execution reverted: mock transfer blocked" };
    return functionName === "request"
      ? encodeFunctionResult({
          abi,
          functionName,
          result: BigInt(state.loans.length),
        })
      : "0x";
  }
  async function rpc(
    method: string,
    params: any[] = [],
    wallet = false,
  ): Promise<any> {
    state.calls.push({ method, params, wallet });
    if (method === "eth_chainId")
      return wallet ? state.chain : chainConfig.walletAddChain.chainId;
    if (method === "eth_accounts")
      return state.connected ? [state.account] : [];
    if (method === "eth_requestAccounts") {
      if (state.reject)
        throw { code: 4001, message: "User rejected the request" };
      state.connected = true;
      return [state.account];
    }
    if (method === "wallet_switchEthereumChain") {
      if (!state.added) throw { code: 4902, message: "Unknown chain" };
      state.chain = params[0].chainId;
      return null;
    }
    if (method === "wallet_addEthereumChain") {
      state.added = true;
      return null;
    }
    if (method === "eth_getCode") return state.noCode ? "0x" : "0x60006000";
    if (method === "eth_blockNumber") return toHex(state.block);
    if (method === "eth_getBlockByNumber") return currentBlock();
    if (method === "eth_call") return result(params[0]);
    if (method === "eth_estimateGas") return "0x186a0";
    if (method === "eth_getBalance") return toHex(parseEther("10"));
    if (method === "eth_sendTransaction") {
      if (state.reject)
        throw { code: 4001, message: "User rejected the request" };
      const tx = params[0],
        decoded = decode(tx),
        args = decoded.args ?? [],
        kind = decoded.functionName;
      state.sent.push({ kind, tx, args });
      state.block++;
      if (!state.receiptRevert) {
        if (kind === "approve") state.approved = true;
        if (kind === "request") {
          const l = make(BigInt(state.loans.length), state.account, 0, 0n);
          l.nft = args[0] as Address;
          l.tokenId = args[1] as bigint;
          l.principal = args[2] as bigint;
          l.interest = args[3] as bigint;
          l.duration = args[4] as bigint;
          state.loans.push(l);
          state.approved = false;
        }
        if (kind === "fund") {
          const l = state.loans[Number(args[0])];
          l.state = 2;
          l.lender = state.account;
          l.deadline = state.now + l.duration;
        }
        if (kind === "repay") state.loans[Number(args[0])].state = 3;
        if (kind === "claim") state.loans[Number(args[0])].state = 4;
        if (kind === "cancel") state.loans[Number(args[0])].state = 1;
        if (kind === "withdraw") state.credit = 0n;
      }
      return txHash;
    }
    if (method === "eth_getTransactionReceipt")
      return {
        transactionHash: txHash,
        transactionIndex: "0x0",
        blockHash,
        blockNumber: toHex(state.block),
        from: state.account,
        to: shop,
        cumulativeGasUsed: "0x5208",
        gasUsed: "0x5208",
        contractAddress: null,
        logs: [],
        logsBloom: "0x" + "00".repeat(256),
        status: state.receiptRevert ? "0x0" : "0x1",
        effectiveGasPrice: "0x1",
        type: "0x2",
      };
    throw { code: -32601, message: `Unexpected mocked RPC method: ${method}` };
  }
  await page.route("https://**/*", async (route) => {
    const request = route.request().postDataJSON();
    const handle = async (q: any) => {
      try {
        return {
          jsonrpc: "2.0",
          id: q.id,
          result: await rpc(q.method, q.params),
        };
      } catch (error) {
        return { jsonrpc: "2.0", id: q.id, error };
      }
    };
    await route.fulfill({
      json: Array.isArray(request)
        ? await Promise.all(request.map(handle))
        : await handle(request),
    });
  });
  if (!options.noWallet) {
    await page.exposeFunction(
      "__pawnMockRpc",
      async (method: string, params: any[]) => {
        try {
          return { result: await rpc(method, params, true) };
        } catch (error) {
          return { error };
        }
      },
    );
    await page.addInitScript(() => {
      const events: Record<string, Function[]> = {};
      (window as any).ethereum = {
        request: async ({ method, params = [] }: any) => {
          const response = await (window as any).__pawnMockRpc(method, params);
          if (response.error) throw response.error;
          return response.result;
        },
        on: (event: string, fn: Function) => {
          (events[event] ??= []).push(fn);
        },
        removeListener: (event: string, fn: Function) => {
          events[event] = (events[event] ?? []).filter((f) => f !== fn);
        },
      };
      (window as any).__emit = (event: string, value: any) =>
        events[event]?.forEach((fn) => fn(value));
    });
  }
  return state;
}
