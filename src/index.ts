/**
 * Flying Whale Private MCP Server v2.0.0
 *
 * © 2026 Flying Whale — ALL RIGHTS RESERVED
 * Owner: zaghmout.btc | ERC-8004 #54
 * PROPRIETARY — Unauthorized copying or distribution is strictly prohibited.
 * On-chain IP: SP322ZK4VXT3KGDT9YQANN9R28SCT02MZ97Y24BRW.whale-ip-store-v1
 *
 * ═══════════════════════════════════════════════════════════════════
 * SOVEREIGN AGENT OS v3.0.0 — Private Flying Whale Core
 * ═══════════════════════════════════════════════════════════════════
 *
 * Contains:
 *   - All Flying Whale Marketplace tools (WHALE-gated)
 *   - SessionGuard: MCPTox / Denial-of-Wallet protection layer
 *   - Behavioral Fortress: fingerprint + honeypot + noise + watermark
 *   - FW Gate: execution feasibility evaluation (EPC-1)
 *   - Pact / Market / Program / Sovereign contract tools
 *   - ERC-8004 identity, scoring, IP registry
 *   - Intelligence layer: regime, consensus, liquidity, simulation
 *
 * WHALE Gate enforced on all tools.
 * No WHALE = No Access. Buy: https://app.bitflow.finance
 */

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { withSessionGuard } from "./tools/session-guard.js";
import { registerFlyingWhaleTools } from "./tools/flying-whale.tools.js";

// ── Server ────────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "flying-whale-core",
  version: "2.0.0",
});

// ── Layer 1: Session Guard (MCPTox / Denial-of-Wallet protection) ─────────────
withSessionGuard(server);

// ── Layer 2: Register all Flying Whale proprietary tools ─────────────────────
registerFlyingWhaleTools(server);

// ── Start ─────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🐋 Flying Whale Core MCP v2.0.0 — zaghmout.btc | ERC-8004 #54");
  console.error("🔒 Session Guard: ACTIVE (MCPTox + Denial-of-Wallet protection)");
  console.error("🛡️  Behavioral Fortress: ACTIVE (fingerprint + honeypot + noise + watermark)");
  console.error("🔑 License: Set FW_LICENSE_KEY in .env (or FW_LICENSE_KEY=OWNER for owner bypass)");
  console.error("🐋 WHALE Gate: All tools require callerAddress with WHALE balance");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
