/**
 * @flyingwhale/mcp — Flying Whale Gate MCP Server
 *
 * © 2026 Flying Whale — ALL RIGHTS RESERVED
 * Owner: zaghmout.btc | ERC-8004 #54
 * PROPRIETARY — Unauthorized copying or distribution is strictly prohibited.
 *
 * Tools:
 *   fw_gate_evaluate  — Evaluate execution feasibility (x402: 1000 μSTX)
 *   fw_gate_verify    — Verify any GateCertificate (FREE)
 *   fw_gate_stats     — Live gate statistics (FREE)
 *   fw_gate_register  — Register a bot as known integration (FREE)
 */

import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { buildPaymentSignature, getSenderAddress } from "./payment.js";

// ── Config ────────────────────────────────────────────────────────────────────

const FW_GATE_URL = process.env.FW_GATE_URL ?? "https://fwgate.io";
const NETWORK     = (process.env.NETWORK ?? "mainnet") as "mainnet" | "testnet";
const MNEMONIC    = process.env.CLIENT_MNEMONIC ?? "";

// ── Gate API helpers ──────────────────────────────────────────────────────────

async function gateEvaluate(params: {
  pair:      string;
  action:    string;
  amount:    number;
  venue?:    string;
  caller_id: string;
}): Promise<unknown> {
  if (!MNEMONIC) throw new Error("CLIENT_MNEMONIC not set — cannot sign x402 payment");

  const body = JSON.stringify({
    caller_id:  params.caller_id,
    asset_pair: params.pair,
    action:     params.action,
    amount:     params.amount,
    venue:      params.venue || "unknown",
  });

  // Step 1 — probe for 402
  const probe = await fetch(`${FW_GATE_URL}/gate/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (probe.status !== 402) {
    // Already accessible (shouldn't happen) or error
    return probe.json();
  }

  // Step 2 — parse payment requirement
  const paymentRequiredHeader = probe.headers.get("payment-required");
  if (!paymentRequiredHeader) {
    throw new Error("FW Gate: server returned 402 but no payment-required header");
  }

  // Step 3 — sign payment
  const paymentSignature = await buildPaymentSignature(
    paymentRequiredHeader,
    MNEMONIC,
    NETWORK,
  );

  // Step 4 — retry with payment
  const res = await fetch(`${FW_GATE_URL}/gate/evaluate`, {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "payment-signature": paymentSignature,
    },
    body,
  });

  if (!res.ok && res.status !== 200) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`FW Gate: evaluate failed ${res.status} — ${err}`);
  }

  return res.json();
}

async function gateVerify(gateId: string): Promise<unknown> {
  const res = await fetch(`${FW_GATE_URL}/gate/verify/${gateId}`);
  return res.json();
}

async function gateStats(): Promise<unknown> {
  const res = await fetch(`${FW_GATE_URL}/gate/stats`);
  return res.json();
}

async function gateRegister(params: {
  name:          string;
  caller_id:     string;
  type?:         string;
  description?:  string;
  risk_profile?: string;
}): Promise<unknown> {
  const res = await fetch(`${FW_GATE_URL}/gate/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name:         params.name,
      caller_id:    params.caller_id,
      type:         params.type          || "bot",
      description:  params.description  || "",
      risk_profile: params.risk_profile || "moderate",
    }),
  });
  return res.json();
}

async function gateOutcome(params: {
  gate_id: string;
  outcome: string;
  tx_hash?: string;
  notes?:   string;
}): Promise<unknown> {
  const res = await fetch(`${FW_GATE_URL}/gate/outcome`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return res.json();
}

async function gateAccuracy(): Promise<unknown> {
  const res = await fetch(`${FW_GATE_URL}/gate/accuracy`);
  return res.json();
}

async function gateLeaderboard(): Promise<unknown> {
  const res = await fetch(`${FW_GATE_URL}/gate/leaderboard`);
  return res.json();
}

async function gateQuality(callerId: string): Promise<unknown> {
  const res = await fetch(`${FW_GATE_URL}/gate/quality/${encodeURIComponent(callerId)}`);
  return res.json();
}

async function gatePricing(): Promise<unknown> {
  const res = await fetch(`${FW_GATE_URL}/gate/pricing`);
  return res.json();
}

// fw_guard_execute — evaluate + guard check + outcome reporting
// Developer passes the trade params; MCP returns verdict + what to do
async function gateGuardExecute(params: {
  pair:      string;
  action:    string;
  amount:    number;
  venue?:    string;
  caller_id: string;
}): Promise<unknown> {
  const cert = await gateEvaluate(params) as Record<string, unknown>;

  const verdict    = cert.gate_verdict as string;
  const feasibility = cert.execution_feasibility as number;
  const proceed    = verdict === "viable" || (verdict === "degraded" && feasibility >= 0.4);

  return {
    gate_id:               cert.gate_id,
    gate_verdict:          verdict,
    execution_feasibility: feasibility,
    risk:                  cert.risk,
    proceed,
    // Developer makes the final decision — FW Gate is analytical only
    developer_action: proceed
      ? "Conditions assessed as viable. Execute at your discretion."
      : `Conditions assessed as ${verdict}. Consider halting. Developer decides.`,
    pattern: proceed
      ? `if (result.gate_verdict === 'non_executable') { /* your choice */ } // execute`
      : `if (result.gate_verdict === 'non_executable') { throw new Error(result.reason); }`,
    verify_url:  cert.verify_url,
    widget_url:  cert.widget_url,
    embed:       cert.embed,
    certificate: cert.certificate,
    note: "FW Gate is analytical only. Not financial advice. Developer retains full decision authority.",
    signed_by: "zaghmout.btc | ERC-8004 #54 | fwgate.io",
  };
}

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "flyingwhale-gate", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

// ── Tool definitions ──────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "fw_gate_evaluate",
      description:
        "Evaluate execution feasibility before any trade. Returns a signed GateCertificate with gate_verdict (viable | degraded | non_executable) and execution_feasibility (0.00–1.00). Costs 1000 μSTX via x402 — payment is automatic if CLIENT_MNEMONIC is set.",
      inputSchema: {
        type: "object",
        properties: {
          pair:      { type: "string",  description: "Asset pair e.g. 'WHALE/wSTX' | 'STX/sBTC' | 'BTC/USD'" },
          action:    { type: "string",  description: "Execution type: SWAP | BUY | SELL | STAKE | BORROW" },
          amount:    { type: "number",  description: "Amount in atomic units (microSTX, sats...)" },
          venue:     { type: "string",  description: "Execution venue: stacks-dex | alex | bitflow | unknown" },
          caller_id: { type: "string",  description: "Your bot identifier. Register once with fw_gate_register." },
        },
        required: ["pair", "action", "amount", "caller_id"],
      },
    },
    {
      name: "fw_gate_verify",
      description:
        "Verify any GateCertificate. FREE — public. Use cert_hash to confirm authenticity. Returns authentic: true/false + full certificate.",
      inputSchema: {
        type: "object",
        properties: {
          gate_id: { type: "string", description: "Gate ID from evaluate response e.g. 'fw-gate-4142c350'" },
        },
        required: ["gate_id"],
      },
    },
    {
      name: "fw_gate_stats",
      description:
        "Live gate statistics: total certificates issued, registered bots, verdict distribution (viable/degraded/non_executable), calls today. FREE.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "fw_gate_register",
      description:
        "Register your bot as a known integration. FREE — one-time setup. Registered bots appear in /gate/stats and the leaderboard.",
      inputSchema: {
        type: "object",
        properties: {
          name:         { type: "string", description: "Bot/system name" },
          caller_id:    { type: "string", description: "Unique identifier for this bot" },
          type:         { type: "string", description: "bot | protocol | router | dex_bot | risk-module | other" },
          description:  { type: "string", description: "What this bot does" },
          risk_profile: { type: "string", description: "aggressive | moderate | conservative" },
        },
        required: ["name", "caller_id"],
      },
    },
    {
      name: "fw_gate_guard_execute",
      description:
        "Combined evaluate + analytical guard check. Returns gate_verdict + proceed boolean + developer_action guidance. FW Gate is analytical only — developer decides the final action. Use this for the full integration pattern: evaluate → guard → execute.",
      inputSchema: {
        type: "object",
        properties: {
          pair:      { type: "string",  description: "Asset pair e.g. 'WHALE/wSTX'" },
          action:    { type: "string",  description: "SWAP | BUY | SELL | STAKE | BORROW" },
          amount:    { type: "number",  description: "Amount in atomic units" },
          venue:     { type: "string",  description: "Execution venue" },
          caller_id: { type: "string",  description: "Your bot identifier" },
        },
        required: ["pair", "action", "amount", "caller_id"],
      },
    },
    {
      name: "fw_gate_outcome",
      description:
        "Report actual trade outcome after execution. Feeds the FW Gate accuracy dataset (data moat). Call this ~15 minutes after executing. FREE.",
      inputSchema: {
        type: "object",
        properties: {
          gate_id: { type: "string", description: "Gate ID from evaluate response" },
          outcome: { type: "string", description: "success | failed | partial | cancelled | slippage | route_broken" },
          tx_hash: { type: "string", description: "Optional transaction hash" },
          notes:   { type: "string", description: "Optional notes about what happened" },
        },
        required: ["gate_id", "outcome"],
      },
    },
    {
      name: "fw_gate_accuracy",
      description:
        "Get FW Gate prediction accuracy stats. Shows how often gate_verdict matched actual trade outcomes. Proves analytical value of GateCertificates. FREE.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "fw_gate_leaderboard",
      description:
        "Get the FW Gate leaderboard — top verified agents ranked by certified evaluations. Social proof layer. Unverified bots not listed. FREE.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "fw_gate_quality",
      description:
        "Get FW_QUALITY_SCORING_v1.0 score for any caller_id. Returns execution quality tier (UNPROVEN → ELITE), accuracy %, confidence weight multiplier, and benefits. Bloomberg execution quality layer. FREE.",
      inputSchema: {
        type: "object",
        properties: {
          caller_id: { type: "string", description: "The bot/caller identifier to look up" },
        },
        required: ["caller_id"],
      },
    },
    {
      name: "fw_gate_pricing",
      description:
        "FW_PRICING_v1.0 — neutral pricing schema. price = 1 execution_credit / token = settlement method. Returns accepted_assets (STX, BTC, USDC, ETH), settlement_layer (x402), and full endpoint pricing. Asset-agnostic by design. FREE.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
  ],
}));

// ── Tool execution ────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;

  try {
    let result: unknown;

    if (name === "fw_gate_evaluate") {
      result = await gateEvaluate({
        pair:      String(args.pair),
        action:    String(args.action),
        amount:    Number(args.amount),
        venue:     args.venue ? String(args.venue) : undefined,
        caller_id: String(args.caller_id),
      });
    } else if (name === "fw_gate_verify") {
      result = await gateVerify(String(args.gate_id));
    } else if (name === "fw_gate_stats") {
      result = await gateStats();
    } else if (name === "fw_gate_register") {
      result = await gateRegister({
        name:         String(args.name),
        caller_id:    String(args.caller_id),
        type:         args.type         ? String(args.type)         : undefined,
        description:  args.description  ? String(args.description)  : undefined,
        risk_profile: args.risk_profile ? String(args.risk_profile) : undefined,
      });
    } else if (name === "fw_gate_guard_execute") {
      result = await gateGuardExecute({
        pair:      String(args.pair),
        action:    String(args.action),
        amount:    Number(args.amount),
        venue:     args.venue ? String(args.venue) : undefined,
        caller_id: String(args.caller_id),
      });
    } else if (name === "fw_gate_outcome") {
      result = await gateOutcome({
        gate_id: String(args.gate_id),
        outcome: String(args.outcome),
        tx_hash: args.tx_hash ? String(args.tx_hash) : undefined,
        notes:   args.notes   ? String(args.notes)   : undefined,
      });
    } else if (name === "fw_gate_accuracy") {
      result = await gateAccuracy();
    } else if (name === "fw_gate_leaderboard") {
      result = await gateLeaderboard();
    } else if (name === "fw_gate_quality") {
      result = await gateQuality(String(args.caller_id));
    } else if (name === "fw_gate_pricing") {
      result = await gatePricing();
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${msg}` }],
      isError: true,
    };
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const addr = MNEMONIC
    ? await getSenderAddress(MNEMONIC, NETWORK).catch(() => "unknown")
    : "not configured";

  console.error(`🐋 @flyingwhale/mcp v1.0.0 — zaghmout.btc | ERC-8004 #54`);
  console.error(`🌐 Gate:    ${FW_GATE_URL}`);
  console.error(`💳 Wallet:  ${addr}`);
  console.error(`🔒 Network: ${NETWORK}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
