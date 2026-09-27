import {
  BaseError,
  isAddress,
  maxUint256,
  parseEther,
  zeroAddress,
  type Address,
} from "viem";
export type Loan = {
  id: bigint;
  borrower: Address;
  lender: Address;
  nft: Address;
  tokenId: bigint;
  principal: bigint;
  interest: bigint;
  duration: bigint;
  deadline: bigint;
  state: number;
};
export const states = [
  "Requested",
  "Cancelled",
  "Funded",
  "Repaid",
  "Defaulted",
];
export const same = (a?: string, b?: string) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();
export const short = (value: string) =>
  `${value.slice(0, 6)}…${value.slice(-4)}`;
export function errorMessage(error: unknown) {
  const source =
    error instanceof BaseError
      ? error.shortMessage
      : error instanceof Error
        ? error.message
        : error && typeof error === "object" && "message" in error
          ? String(error.message)
          : String(error);
  if (/reject|denied|4001/i.test(source))
    return "Request declined in your wallet. Nothing was submitted. You can try again.";
  return source.slice(0, 450);
}
export type Terms = {
  nft: string;
  tokenId: string;
  principal: string;
  interest: string;
  hours: string;
};
export class TermsError extends Error {
  constructor(
    message: string,
    public field: keyof Terms,
  ) {
    super(message);
  }
}
export function parseTerms(values: Terms) {
  if (!isAddress(values.nft) || values.nft === zeroAddress)
    throw new TermsError("Enter a valid NFT collection address.", "nft");
  if (!/^\d+$/.test(values.tokenId) || BigInt(values.tokenId) > maxUint256)
    throw new TermsError(
      "Enter a whole token ID within uint256 range.",
      "tokenId",
    );
  for (const key of ["principal", "interest"] as const)
    if (!/^\d+(\.\d{1,18})?$/.test(values[key]))
      throw new TermsError(
        `Enter ${key} in ETH with at most 18 decimal places.`,
        key,
      );
  const principal = parseEther(values.principal),
    interest = parseEther(values.interest);
  if (principal <= 0n || principal + interest > maxUint256)
    throw new TermsError(
      "Principal must be positive and total repayment must fit uint256.",
      "principal",
    );
  if (
    !/^\d+$/.test(values.hours) ||
    BigInt(values.hours) < 1n ||
    BigInt(values.hours) > 8760n
  )
    throw new TermsError(
      "Choose a whole number of hours from 1 to 8,760 (365 days).",
      "hours",
    );
  return {
    nft: values.nft as Address,
    tokenId: BigInt(values.tokenId),
    principal,
    interest,
    duration: BigInt(values.hours) * 3600n,
  };
}
export function actionsFor(
  loan: Loan,
  account: Address | undefined,
  timestamp: bigint,
) {
  return {
    fund: loan.state === 0,
    cancel: loan.state === 0 && same(account, loan.borrower),
    repay: loan.state === 2 && timestamp <= loan.deadline,
    claim:
      loan.state === 2 &&
      timestamp > loan.deadline &&
      same(account, loan.lender),
  };
}
export function deadline(value: bigint) {
  if (value > 8640000000000n) return `Unix time ${value} seconds`;
  return new Date(Number(value) * 1000)
    .toISOString()
    .replace("T", " ")
    .replace(".000Z", " UTC");
}
