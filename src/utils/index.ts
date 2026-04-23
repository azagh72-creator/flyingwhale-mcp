/**
 * Flying Whale MCP — Minimal Response Utilities
 *
 * © 2026 Flying Whale — ALL RIGHTS RESERVED
 * Owner: zaghmout.btc | ERC-8004 #54
 */

export * from "./behavioral-fortress.js";

export function createJsonResponse(data: unknown): {
  content: Array<{ type: "text"; text: string }>;
} {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function createErrorResponse(error: unknown): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  const msg = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: "text",
        text: `Error: ${msg}`,
      },
    ],
    isError: true,
  };
}
