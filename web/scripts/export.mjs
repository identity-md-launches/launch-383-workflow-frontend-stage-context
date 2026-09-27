import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { keccak256, toHex, isAddress } from "viem";
const root = fileURLToPath(new URL("../../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(root + path, "utf8"));
const handoff = await read("web/deployment.handoff.json");
const chain = await read("web/network.json");
const canonical = (value) => JSON.stringify(sort(value));
function sort(value) {
  return Array.isArray(value)
    ? value.map(sort)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, sort(value[key])]),
        )
      : value;
}
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
if (
  handoff.version !== 1 ||
  handoff.chainId !== chain.network.chainId ||
  Number(chain.walletAddChain.chainId) !== handoff.chainId
)
  throw Error("Invalid handoff/network binding");
const config = {
  version: 1,
  launchId: handoff.launchId,
  chainId: handoff.chainId,
  sourceCommit: handoff.sourceCommit,
  attestationHash: handoff.attestationHash,
  contracts: [],
  assets: [],
  network: chain.network,
  walletAddChain: chain.walletAddChain,
};
for (const contract of handoff.contracts) {
  if (
    !/^[A-Za-z0-9_]+$/.test(contract.name) ||
    !isAddress(contract.address) ||
    !/^[a-f0-9]{64}$/.test(contract.abiHash)
  )
    throw Error("Invalid contract record");
  const file = `docs/abi/${contract.name}.json`;
  const pinned = execFileSync(
    "git",
    ["show", `${handoff.sourceCommit}:${file}`],
    { cwd: root },
  );
  const abi = JSON.parse(pinned);
  if (
    !Array.isArray(abi) ||
    keccak256(toHex(canonical(abi))).slice(2) !== contract.abiHash
  )
    throw Error(`ABI hash mismatch: ${contract.name}`);
  if (!pinned.equals(await readFile(root + file)))
    throw Error(`Working ABI differs from pinned source: ${file}`);
  const abiPath = `abi/${contract.name}.json`;
  if (!process.argv.includes("--verify")) {
    await mkdir(root + "dist/abi", { recursive: true });
    await writeFile(root + "dist/" + abiPath, pinned);
  }
  config.contracts.push({
    name: contract.name,
    address: contract.address,
    abiHash: contract.abiHash,
    abiPath,
  });
}
async function walk(dir, prefix = "") {
  const files = [];
  for (const name of (await readdir(dir)).sort()) {
    const path = prefix + name;
    const info = await stat(dir + "/" + name);
    if (info.isDirectory())
      files.push(...(await walk(dir + "/" + name, path + "/")));
    else if (path !== "imd-deployment.json") files.push(path);
  }
  return files;
}
let total = 0;
for (const path of await walk(root + "dist")) {
  const bytes = await readFile(root + "dist/" + path);
  total += bytes.length;
  if (bytes.length > 8388608) throw Error("Asset over 8 MiB");
  config.assets.push({ path, sha256: hash(bytes) });
}
if (
  !config.assets.some((a) => a.path === "index.html") ||
  config.assets.length > 128 ||
  total > 7 * 1024 * 1024
)
  throw Error("Export budget exceeded or missing index");
if (process.argv.includes("--verify")) {
  const actual = await read("dist/imd-deployment.json");
  if (canonical(actual) !== canonical(config))
    throw Error("Manifest/configuration/asset mismatch");
} else
  await writeFile(
    root + "dist/imd-deployment.json",
    JSON.stringify(config, null, 2) + "\n",
  );
console.log(
  JSON.stringify(
    {
      result: "PASS",
      pinnedSource: handoff.sourceCommit,
      abiHashes: config.contracts.map((c) => ({
        name: c.name,
        hash: c.abiHash,
      })),
      assets: config.assets.length,
      assetBytes: total,
      networkUnchanged: true,
    },
    null,
    2,
  ),
);
