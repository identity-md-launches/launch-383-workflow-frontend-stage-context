import {
  createPublicClient,
  custom,
  defineChain,
  fallback,
  http,
  isAddress,
  keccak256,
  toHex,
  type Abi,
  type Address,
  type EIP1193Provider,
  type Transport,
} from "viem";
export type Provider = EIP1193Provider & {
  on?: (event: string, fn: (...args: any[]) => void) => void;
  removeListener?: (event: string, fn: (...args: any[]) => void) => void;
};
declare global {
  interface Window {
    ethereum?: Provider;
  }
}
export type Deployment = {
  version: number;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: {
    name: string;
    address: Address;
    abiHash: string;
    abiPath: string;
  }[];
  assets: { path: string; sha256: string }[];
  network: {
    chainId: number;
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    faucets: string[];
    uniswapV4: Record<string, Address>;
  };
  walletAddChain: {
    chainId: `0x${string}`;
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number };
    blockExplorerUrls: string[];
  };
};
function sorted(value: any): any {
  return Array.isArray(value)
    ? value.map(sorted)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, sorted(value[k])]),
        )
      : value;
}
const relative = (path: string) =>
  /^[\w./-]+$/.test(path) &&
  !path.startsWith("/") &&
  !path.split("/").includes("..");
async function json(path: string) {
  const response = await fetch(new URL(path, document.baseURI), {
    cache: "no-store",
  });
  if (!response.ok)
    throw Error(`Could not load ${path}. Reload the page to retry.`);
  return response.json();
}
export async function loadRuntime() {
  const deployment: Deployment = await json("imd-deployment.json");
  if (
    deployment.version !== 1 ||
    deployment.chainId !== deployment.network.chainId ||
    Number(deployment.walletAddChain.chainId) !== deployment.chainId ||
    !deployment.network.rpcUrls.length
  )
    throw Error("Deployment network configuration is invalid.");
  const abis: Record<string, Abi> = {};
  for (const contract of deployment.contracts) {
    if (!isAddress(contract.address) || !relative(contract.abiPath))
      throw Error("Invalid deployment contract or ABI path.");
    const abi = await json(contract.abiPath);
    if (
      !Array.isArray(abi) ||
      keccak256(toHex(JSON.stringify(sorted(abi)))).slice(2) !==
        contract.abiHash
    )
      throw Error(
        `ABI verification failed for ${contract.name}. Transactions are disabled.`,
      );
    abis[contract.name] = abi;
  }
  const shop = deployment.contracts.find((c) => c.name === "NFTPawnShop");
  const token = deployment.contracts.find((c) => c.name === "LaunchToken");
  if (!shop || !token) throw Error("Required deployed contracts are missing.");
  const chain = defineChain({
    id: deployment.chainId,
    name: deployment.network.name,
    nativeCurrency: deployment.network.nativeCurrency,
    rpcUrls: { default: { http: deployment.network.rpcUrls } },
    blockExplorers: {
      default: { name: "Explorer", url: deployment.network.explorer },
    },
    testnet: deployment.network.testnet,
  });
  const provider = window.ethereum;
  const transports: Transport[] = deployment.network.rpcUrls.map((url) =>
    http(url, { timeout: 8000, retryCount: 0 }),
  );
  if (provider) transports.push(custom(provider, { retryCount: 0 }));
  const client = createPublicClient({
    chain,
    transport: fallback(transports, { rank: false, retryCount: 0 }),
  });
  return { deployment, abis, shop, token, chain, client, provider };
}
export type Runtime = Awaited<ReturnType<typeof loadRuntime>>;
