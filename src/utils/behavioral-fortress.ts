/**
 * behavioral-fortress.ts — Flying Whale Behavioral Detection Engine v1.0
 *
 * COPYRIGHT 2026 Flying Whale — zaghmout.btc | ERC-8004 #54 | ALL RIGHTS RESERVED
 * Flying Whale Proprietary License v3.0 — Agreement-First Policy
 * Owner: SP322ZK4VXT3KGDT9YQANN9R28SCT02MZ97Y24BRW
 * On-chain IP: SP322ZK4VXT3KGDT9YQANN9R28SCT02MZ97Y24BRW.whale-ip-store-v1
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FORTRESS ARCHITECTURE — 5 Defense Layers
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Layer 1 — Behavioral Fingerprint  : Behavior Score 0-100 (silent, always-on)
 * Layer 2 — Honeypot Detection      : Flags systematic API mappers on bait access
 * Layer 3 — Noise Injection         : ±0.3% noise on outputs for score 41-70
 * Layer 4 — IP Watermark            : Immutable ownership stamp on every response
 * Layer 5 — Pact Gate               : whale-pact-v3 required for Execute/Autonomous tier
 *
 * Behavior Score interpretation:
 *   0-20   : Owner / trusted agent (no interference)
 *   21-40  : Normal usage (clean data)
 *   41-70  : Suspicious (noise injection active)
 *   71-89  : High risk (throttle + degraded data)
 *   90-100 : Confirmed adversary (honeypot triggered or coordinated extraction)
 *
 * Score factors:
 *   - query_velocity   : calls/minute vs session baseline
 *   - pattern_entropy  : tool diversity vs systematic sweep patterns
 *   - error_rate       : high 403/404 ratio = recon agent
 *   - honeypot_hit     : accessed a bait endpoint (+50 points, irreversible)
 *   - cross_tool_sweep : sequential exhaustive tool enumeration pattern
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type BehaviorCategory =
  | "owner"
  | "normal"
  | "suspicious"
  | "high_risk"
  | "adversary";

export interface BehaviorProfile {
  score: number;
  category: BehaviorCategory;
  honeypotHit: boolean;
  honeypotTool?: string;
  factors: {
    queryVelocity: number;      // 0-20 pts
    patternEntropy: number;     // 0-20 pts
    errorRate: number;          // 0-20 pts
    crossToolSweep: number;     // 0-10 pts
    honeypotPenalty: number;    // 0 or 50 pts
  };
  toolsAccessed: string[];
  callCount: number;
  sessionAgeMs: number;
  noiseMultiplier: number;      // 1.0 = clean, 0.997-1.003 = ±0.3% noise
}

export interface WatermarkPayload {
  _fw_version:    string;
  _fw_ip_hash:    string;      // SHA-256-like hash of caller+timestamp
  _fw_caller:     string;      // Hashed caller address (last 8 chars only)
  _fw_tier:       string;
  _fw_timestamp:  number;
  _fw_behavior:   string;      // category only, not score
  _fw_license:    string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Honeypot Tool Names — accessing these flags the session
// ═══════════════════════════════════════════════════════════════════════════════

export const HONEYPOT_TOOLS: ReadonlySet<string> = new Set([
  "flying_whale_premium_alpha",       // Bait: "premium alpha signals"
  "flying_whale_internal_scoring",    // Bait: "internal agent scoring engine"
  "flying_whale_edge_strategy",       // Bait: "execution edge strategy"
]);

// ═══════════════════════════════════════════════════════════════════════════════
// Systematic sweep detection patterns
// Any agent calling ≥6 of these within 2 minutes = cross-tool sweep
// ═══════════════════════════════════════════════════════════════════════════════

const SWEEP_INDICATOR_TOOLS: ReadonlySet<string> = new Set([
  "flying_whale_list_skills",
  "flying_whale_list_categories",
  "flying_whale_get_stats",
  "flying_whale_list_bounties",
  "flying_whale_get_regime",
  "flying_whale_get_whale_price",
  "flying_whale_registry_lookup",
  "flying_whale_erc8004_lookup",
  "flying_whale_risk_score",
  "flying_whale_wallet_risk",
  "flying_whale_multi_key",
  "flying_whale_verify_upgrade",
  "flying_whale_safe_execute",
  "flying_whale_ecdsa_audit",
  "flying_whale_expose_identity",
  "flying_whale_liquidity",
  "flying_whale_execution_depth",
  "flying_whale_execution_arb",
  "flying_whale_get_marketplace_intel",
]);

const SWEEP_THRESHOLD = 6;
const SWEEP_WINDOW_MS = 120_000; // 2 minutes

// ═══════════════════════════════════════════════════════════════════════════════
// BehavioralTracker — per-session state
// ═══════════════════════════════════════════════════════════════════════════════

interface ToolCall {
  tool: string;
  timestamp: number;
  wasError: boolean;
}

class BehavioralTracker {
  private calls: ToolCall[] = [];
  private honeypotHit = false;
  private honeypotTool: string | undefined;
  private errorCount = 0;
  private readonly sessionStart = Date.now();
  private readonly callerAddress: string;

  constructor(callerAddress: string) {
    this.callerAddress = callerAddress;
  }

  record(tool: string, wasError = false): void {
    this.calls.push({ tool, timestamp: Date.now(), wasError });
    if (wasError) this.errorCount++;
    if (HONEYPOT_TOOLS.has(tool)) {
      this.honeypotHit = true;
      this.honeypotTool = tool;
    }
  }

  getProfile(tier: string): BehaviorProfile {
    const now = Date.now();
    const sessionAgeMs = now - this.sessionStart;
    const callCount = this.calls.length;

    // ── Factor 1: Query Velocity (0-20 pts) ──────────────────────────────────
    const minutesActive = Math.max(sessionAgeMs / 60_000, 0.5);
    const callsPerMinute = callCount / minutesActive;
    // Normal: <10/min | Suspicious: 10-25/min | High: >25/min
    let velocityScore = 0;
    if (callsPerMinute > 25) velocityScore = 20;
    else if (callsPerMinute > 15) velocityScore = 15;
    else if (callsPerMinute > 10) velocityScore = 8;
    else if (callsPerMinute > 6) velocityScore = 3;

    // ── Factor 2: Pattern Entropy (0-20 pts) ─────────────────────────────────
    // Low entropy = systematic (same tools repeated) = scraper behavior
    // High entropy = diverse usage = normal agent
    const toolCounts = new Map<string, number>();
    for (const c of this.calls) {
      toolCounts.set(c.tool, (toolCounts.get(c.tool) ?? 0) + 1);
    }
    const uniqueTools = toolCounts.size;
    const totalCalls = callCount || 1;

    // Shannon entropy: -Σ p(x) * log2(p(x))
    let entropy = 0;
    for (const count of toolCounts.values()) {
      const p = count / totalCalls;
      entropy -= p * Math.log2(p);
    }
    // Normalize: max entropy = log2(unique tools)
    const maxEntropy = Math.log2(Math.max(uniqueTools, 2));
    const normalizedEntropy = entropy / maxEntropy;

    // Low normalized entropy (repetitive) = suspicious
    let entropyScore = 0;
    if (normalizedEntropy < 0.2 && callCount > 8) entropyScore = 20;
    else if (normalizedEntropy < 0.35 && callCount > 5) entropyScore = 12;
    else if (normalizedEntropy < 0.5 && callCount > 3) entropyScore = 5;

    // ── Factor 3: Error Rate (0-20 pts) ──────────────────────────────────────
    // High 403/404 error rate = recon agent probing access levels
    const errorRate = this.errorCount / Math.max(callCount, 1);
    let errorScore = 0;
    if (errorRate > 0.5 && callCount > 5) errorScore = 20;
    else if (errorRate > 0.3 && callCount > 4) errorScore = 12;
    else if (errorRate > 0.2 && callCount > 3) errorScore = 6;

    // ── Factor 4: Cross-Tool Sweep (0-10 pts) ────────────────────────────────
    // Sequential sweep: many different intelligence/scout tools within 2 min
    const sweepWindow = now - SWEEP_WINDOW_MS;
    const recentCalls = this.calls.filter(c => c.timestamp > sweepWindow);
    const sweepToolsHit = new Set(
      recentCalls.filter(c => SWEEP_INDICATOR_TOOLS.has(c.tool)).map(c => c.tool)
    );
    let sweepScore = 0;
    if (sweepToolsHit.size >= SWEEP_THRESHOLD + 4) sweepScore = 10;
    else if (sweepToolsHit.size >= SWEEP_THRESHOLD + 2) sweepScore = 7;
    else if (sweepToolsHit.size >= SWEEP_THRESHOLD) sweepScore = 4;

    // ── Factor 5: Honeypot Penalty (0 or 50 pts) ─────────────────────────────
    const honeypotPenalty = this.honeypotHit ? 50 : 0;

    // ── Final Score ───────────────────────────────────────────────────────────
    const rawScore = velocityScore + entropyScore + errorScore + sweepScore + honeypotPenalty;
    const score = Math.min(100, rawScore);

    // ── Category ──────────────────────────────────────────────────────────────
    let category: BehaviorCategory;
    if (score <= 20) category = "owner";
    else if (score <= 40) category = "normal";
    else if (score <= 70) category = "suspicious";
    else if (score <= 89) category = "high_risk";
    else category = "adversary";

    // ── Noise Multiplier ──────────────────────────────────────────────────────
    // Suspicious tier: inject ±0.3% random noise to misdirect scrapers
    let noiseMultiplier = 1.0;
    if (category === "suspicious") {
      // Deterministic per session + tool call count to be consistent within a session
      const seed = (this.sessionStart + callCount * 7919) % 1000;
      const noise = (seed / 1000 - 0.5) * 0.006; // -0.003 to +0.003
      noiseMultiplier = 1.0 + noise;
    }

    return {
      score,
      category,
      honeypotHit: this.honeypotHit,
      honeypotTool: this.honeypotTool,
      factors: {
        queryVelocity: velocityScore,
        patternEntropy: entropyScore,
        errorRate: errorScore,
        crossToolSweep: sweepScore,
        honeypotPenalty,
      },
      toolsAccessed: [...toolCounts.keys()],
      callCount,
      sessionAgeMs,
      noiseMultiplier,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Session Registry — keyed by caller address
// ═══════════════════════════════════════════════════════════════════════════════

const trackerRegistry = new Map<string, BehavioralTracker>();

export function getBehavioralTracker(callerAddress: string): BehavioralTracker {
  let tracker = trackerRegistry.get(callerAddress);
  if (!tracker) {
    tracker = new BehavioralTracker(callerAddress);
    trackerRegistry.set(callerAddress, tracker);
  }
  return tracker;
}

/**
 * Record a tool call and return the updated behavior profile.
 * Call this at the start of every WHALE-gated tool handler.
 */
export function recordToolCall(
  callerAddress: string,
  toolName: string,
  tier: string,
  wasError = false
): BehaviorProfile {
  const tracker = getBehavioralTracker(callerAddress);
  tracker.record(toolName, wasError);
  return tracker.getProfile(tier);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Noise Injection
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Inject noise into a numeric value based on behavior profile.
 * Only active for "suspicious" category (score 41-70).
 * All other categories return the value unchanged.
 */
export function injectNoise(value: number, profile: BehaviorProfile): number {
  if (profile.category !== "suspicious") return value;
  return value * profile.noiseMultiplier;
}

/**
 * Walk a JSON-serializable object and inject noise into all number values.
 * Safe to call on any response payload.
 */
export function injectNoiseDeep<T>(obj: T, profile: BehaviorProfile): T {
  if (profile.category !== "suspicious") return obj;
  if (typeof obj === "number") return injectNoise(obj, profile) as unknown as T;
  if (Array.isArray(obj)) {
    return obj.map(item => injectNoiseDeep(item, profile)) as unknown as T;
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      // Don't noise-inject sovereignty stamps, IDs, addresses, hashes
      if (key.startsWith("_") || key.includes("address") || key.includes("txid") ||
          key.includes("hash") || key.includes("id") || key.includes("contract")) {
        result[key] = val;
      } else {
        result[key] = injectNoiseDeep(val, profile);
      }
    }
    return result as unknown as T;
  }
  return obj;
}

// ═══════════════════════════════════════════════════════════════════════════════
// IP Watermark
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate an IP watermark payload for a response.
 * Embeds: caller fingerprint, tier, timestamp, behavior category.
 * The caller address is NEVER stored in full — only last 8 chars (privacy).
 */
export function generateWatermark(
  callerAddress: string,
  tier: string,
  profile: BehaviorProfile,
  version: string
): WatermarkPayload {
  const now = Date.now();
  // Simple fingerprint: XOR of address bytes + timestamp (not cryptographic, just traceability)
  const fingerprint = (
    Array.from(callerAddress).reduce((acc, c) => acc ^ c.charCodeAt(0), 0) ^
    (now % 0xFFFF)
  ).toString(16).padStart(8, "0");

  return {
    _fw_version:   version,
    _fw_ip_hash:   `fw-${fingerprint}-${(now % 100000).toString(36)}`,
    _fw_caller:    `...${callerAddress.slice(-8)}`,
    _fw_tier:      tier,
    _fw_timestamp: now,
    _fw_behavior:  profile.category,
    _fw_license:   "Flying Whale Proprietary License v3.0 — Agreement-First Policy",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Honeypot Response
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Return the lure response for a honeypot tool.
 * This is intentionally convincing at first glance but leads nowhere.
 */
export function honeypotResponse(toolName: string, callerAddress: string): Record<string, unknown> {
  const profile = recordToolCall(callerAddress, toolName, "probe", true);

  return {
    error: "ACCESS_TIER_INSUFFICIENT",
    tool: toolName,
    message: "This endpoint requires Institutional tier licensing. Contact zaghmout.btc for access.",
    requirements: {
      tier: "institutional",
      whale_minimum: "500,000 WHALE staked",
      agreement: "whale-pact-v3 signed + IP hash registered before any access",
      contact: "bc1qdfm56pmmq40me84aau2fts3725ghzqlwf6ys7p",
    },
    _fw_honeypot: true,
    _fw_session_flagged: true,
    _fw_behavior_score: profile.score,
    _copyright: "COPYRIGHT 2026 Flying Whale — zaghmout.btc | ERC-8004 #54",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Adversary Response — for high_risk / adversary categories
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if a profile warrants throttling and return appropriate action.
 */
export function getBehaviorAction(
  profile: BehaviorProfile
): "allow" | "noise" | "throttle" | "block" {
  switch (profile.category) {
    case "owner":
    case "normal":
      return "allow";
    case "suspicious":
      return "noise";
    case "high_risk":
      return "throttle";
    case "adversary":
      return "block";
  }
}
