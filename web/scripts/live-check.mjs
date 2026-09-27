import { readFile, writeFile } from "node:fs/promises";
import { createPublicClient, http } from "viem";
const deployment = JSON.parse(
  await readFile(new URL("../../dist/imd-deployment.json", import.meta.url)),
);
const results = [];
for (const url of deployment.network.rpcUrls) {
  const client = createPublicClient({
    transport: http(url, { timeout: 10000, retryCount: 0 }),
  });
  try {
    const chainId = await client.getChainId();
    const contracts = [];
    for (const c of deployment.contracts) {
      const code = await client.getCode({ address: c.address });
      contracts.push({
        name: c.name,
        address: c.address,
        codeBytes: (code.length - 2) / 2,
        present: code !== "0x",
      });
    }
    const shop = deployment.contracts.find((c) => c.name === "NFTPawnShop");
    const abi = JSON.parse(
      await readFile(new URL("../../dist/" + shop.abiPath, import.meta.url)),
    );
    const block = await client.getBlock();
    const loanCount = await client.readContract({
      address: shop.address,
      abi,
      functionName: "loanCount",
      blockNumber: block.number,
    });
    results.push({
      url,
      chainId,
      contracts,
      block: block.number.toString(),
      timestamp: block.timestamp.toString(),
      loanCount: loanCount.toString(),
      pass: chainId === deployment.chainId && contracts.every((c) => c.present),
    });
    if (results.at(-1).pass) break;
  } catch (error) {
    results.push({
      url,
      error: error.shortMessage ?? error.message,
      pass: false,
    });
  }
}
const report = {
  observedAt: new Date().toISOString(),
  readOnly: true,
  results,
};
await writeFile(
  new URL("../../docs/evidence/live-rpc.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
if (!results.some((r) => r.pass)) process.exitCode = 1;
