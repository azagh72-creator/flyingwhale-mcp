/**
 * Minimal x402 payment signing for Flying Whale Gate
 * Builds a PaymentPayloadV2, signs with wallet, returns base64-encoded header.
 */

import {
  makeSTXTokenTransfer,
  PostConditionMode,
} from "@stacks/transactions";
import { generateWallet, getStxAddress } from "@stacks/wallet-sdk";

export type Network = "mainnet" | "testnet";

function decodeBase64Json<T>(encoded: string): T | null {
  try {
    return JSON.parse(Buffer.from(encoded, "base64").toString("utf-8")) as T;
  } catch {
    return null;
  }
}

interface PaymentRequiredV2 {
  x402Version: 2;
  resource: { url: string; description?: string; mimeType?: string };
  accepts: Array<{
    scheme: string;
    network: string;
    amount: string;
    asset: string;
    payTo: string;
    maxTimeoutSeconds: number;
  }>;
}

interface PaymentPayloadV2 {
  x402Version: 2;
  resource?: PaymentRequiredV2["resource"];
  accepted: PaymentRequiredV2["accepts"][0];
  payload: { transaction: string };
  extensions?: Record<string, unknown>;
}

/**
 * Sign an x402 payment and return the `payment-signature` header value.
 */
export async function buildPaymentSignature(
  paymentRequiredHeader: string,
  mnemonic: string,
  network: Network,
): Promise<string> {
  const req = decodeBase64Json<PaymentRequiredV2>(paymentRequiredHeader);
  if (!req?.accepts?.length) {
    throw new Error("FW Gate: invalid payment-required header");
  }

  // Pick the STX accept option
  const accepted =
    req.accepts.find((a) => a.asset === "STX") ??
    req.accepts[0];

  // Derive wallet
  const wallet = await generateWallet({ secretKey: mnemonic, password: "" });
  const account = wallet.accounts[0];

  // Build sponsored STX transfer (relay fills in fee + nonce)
  const tx = await makeSTXTokenTransfer({
    recipient: accepted.payTo,
    amount: BigInt(accepted.amount),
    senderKey: account.stxPrivateKey,
    network,
    memo: "",
    sponsored: true,
    fee: 0n,
  });

  const txHex = "0x" + tx.serialize();

  const payload: PaymentPayloadV2 = {
    x402Version: 2,
    resource: req.resource,
    accepted,
    payload: { transaction: txHex },
    extensions: {
      "payment-identifier": { info: { id: `pay_${Date.now().toString(16)}` } },
    },
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

/**
 * Derive STX address from mnemonic.
 */
export async function getSenderAddress(
  mnemonic: string,
  network: Network,
): Promise<string> {
  const wallet = await generateWallet({ secretKey: mnemonic, password: "" });
  return getStxAddress(wallet.accounts[0], network);
}
