// Resolve Orchestrator — production-hardened.
//
// Responsibilities:
// 1. Assemble the system prompt for the active Resolve prompt:
//    Operating Spine + Business Context Profile + active prompt + control
//    signal discipline. The seven master prompts stay server-side.
// 2. Inject a per-deployment canary token into the assembled prompt so any
//    leaked prompt text is traceable to this deployment. The canary is
//    injected at load time — the controlled prompt documents themselves are
//    never modified.
// 3. Call Claude with prompt caching enabled. The Spine + Profile + prompt
//    block is stable within a session, so caching cuts input cost by
//    roughly 60-70% on every turn after the first.
// 4. Retry transient API failures with exponential backoff.
// 5. Support both buffered and streaming responses.
// 6. Report token usage for spend accounting.

import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import type { PromptId, ChatMessage } from "./types";
import { getPrompt, getSpineContext } from "./prompts";
import { parseResponse, type ParsedResponse } from "./signals";
import { log } from "@/lib/logger";

// ----- Anthropic client -----------------------------------------------

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    }
    anthropicClient = new Anthropic({ apiKey, maxRetries: 0 }); // we do our own retries
  }
  return anthropicClient;
}

function getModel(): string {
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";
}

// ----- Canary token -----------------------------------------------------
//
// A short deterministic token derived from AUTH_SECRET. It is embedded in
// an innocuous system-note line inside every assembled prompt. If prompt
// text ever surfaces publicly, the token identifies the deployment it
// leaked from. Deterministic derivation means no extra env var to manage.

function getCanaryToken(): string {
  const secret = process.env.AUTH_SECRET || "dev";
  return createHash("sha256")
    .update("resolve-canary:" + secret)
    .digest("hex")
    .slice(0, 12);
}

// ----- Control-signal instructions ------------------------------------

const CONTROL_SIGNAL_INSTRUCTIONS = `

---

## CONTROL-SIGNAL DISCIPLINE (System-Internal — Do Not Discuss With Leader)

At the end of every response you produce, on a new line by itself, emit exactly one control signal in this format:

\`[[RESOLVE_STATE:VALUE]]\`

Where VALUE is one of:

- \`CONTINUING\` — You are still working through the current phase and expect the leader's next reply.
- \`BRIEFING_READY|ENGINE:decision_maker\` — You have just produced the Entry briefing and are handing off to the Strategic engine.
- \`BRIEFING_READY|ENGINE:business_planner\` — Handing off to the Tactical engine.
- \`BRIEFING_READY|ENGINE:workflow_architect\` — Handing off to the Operational engine.
- \`MONITOR_LOGGED\` — You have produced a Monitor-lane tracking note and the session ends.
- \`OUTPUT_DELIVERED\` — You have produced the full Required Output Standard (or the Quick Call output) and the session's core work is complete.
- \`PROFILE_FINALIZED\` — (Business Context Builder only) You have produced the finalized Resolve Business Context Profile.

The control signal is invisible to the leader — the interface strips it before display. You do not mention it. You do not explain it. You always emit exactly one, and it is always on the last line of your response.

If you are unsure which signal applies, emit \`CONTINUING\`.
`;

// ----- Prompt assembly ------------------------------------------------

function embedProfile(profileText: string | null | undefined): string {
  if (!profileText || profileText.trim().length === 0) {
    return "";
  }
  return `\n\n---\n\n## LOADED CONTEXT — Resolve Business Context Profile\n\nThe following Profile has been previously built with this leader. Read it and adapt vocabulary, examples, tone, and follow-up questions accordingly. Do not re-ask questions this Profile already answers.\n\n${profileText}\n\n---\n\n`;
}

interface AssembleOptions {
  activePrompt: PromptId;
  profileText?: string | null;
  includeSpine?: boolean; // default true
}

function assembleSystemPrompt(opts: AssembleOptions): string {
  const parts: string[] = [];

  // Canary — an innocuous provenance line.
  parts.push(`<!-- resolve-build:${getCanaryToken()} -->`);

  if (opts.includeSpine !== false) {
    parts.push(
      "# INHERITED DISCIPLINE — Operating Spine\n\n" + getSpineContext(),
    );
  }

  parts.push(embedProfile(opts.profileText));
  parts.push("# ACTIVE PROMPT\n\n" + getPrompt(opts.activePrompt));
  parts.push(CONTROL_SIGNAL_INSTRUCTIONS);

  return parts.filter((s) => s.length > 0).join("\n\n");
}

// ----- Retry with exponential backoff ----------------------------------

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 750;

function isRetryable(err: unknown): boolean {
  if (err instanceof Anthropic.APIError) {
    // Retry on rate limits, overloaded, and transient server errors.
    return (
      err.status === 429 ||
      err.status === 500 ||
      err.status === 502 ||
      err.status === 503 ||
      err.status === 529
    );
  }
  // Network-level failures (fetch errors) are retryable.
  return err instanceof Error && err.name === "APIConnectionError";
}

async function withRetries<T>(fn: () => Promise<T>, context: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt === MAX_ATTEMPTS) {
        log.error("llm_call_failed", {
          context,
          attempt,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      log.warn("llm_call_retrying", { context, attempt, delayMs: delay });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// ----- Token usage ------------------------------------------------------

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

function usageFromResponse(u: Anthropic.Usage | undefined): TokenUsage {
  return {
    inputTokens: u?.input_tokens ?? 0,
    outputTokens: u?.output_tokens ?? 0,
    cacheReadTokens:
      (u as { cache_read_input_tokens?: number })?.cache_read_input_tokens ?? 0,
    cacheWriteTokens:
      (u as { cache_creation_input_tokens?: number })
        ?.cache_creation_input_tokens ?? 0,
  };
}

// ----- Buffered turn ----------------------------------------------------

export interface RunTurnInput {
  activePrompt: PromptId;
  profileText?: string | null;
  conversation: ChatMessage[];
  includeSpine?: boolean;
}

export interface RunTurnOutput {
  displayText: string;
  signal: ParsedResponse["signal"];
  rawText: string;
  usage: TokenUsage;
}

export async function runTurn(input: RunTurnInput): Promise<RunTurnOutput> {
  const systemPrompt = assembleSystemPrompt({
    activePrompt: input.activePrompt,
    profileText: input.profileText,
    includeSpine: input.includeSpine,
  });

  const client = getClient();
  const model = getModel();

  const response = await withRetries(
    () =>
      client.messages.create({
        model,
        max_tokens: 4096,
        // Prompt caching: mark the (stable) system prompt as cacheable.
        system: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: input.conversation.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    `runTurn:${input.activePrompt}`,
  );

  const rawText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  const parsed = parseResponse(rawText);

  return {
    displayText: parsed.displayText,
    signal: parsed.signal,
    rawText,
    usage: usageFromResponse(response.usage),
  };
}

// ----- Streaming turn ---------------------------------------------------
//
// Streams text deltas via onDelta as they arrive. The control signal is
// suppressed from the streamed output: we hold back a small tail buffer so
// the "[[RESOLVE_STATE:...]]" line never reaches the client, then parse it
// from the full text at the end.

export interface RunTurnStreamInput extends RunTurnInput {
  onDelta: (text: string) => void | Promise<void>;
}

export async function runTurnStream(
  input: RunTurnStreamInput,
): Promise<RunTurnOutput> {
  const systemPrompt = assembleSystemPrompt({
    activePrompt: input.activePrompt,
    profileText: input.profileText,
    includeSpine: input.includeSpine,
  });

  const client = getClient();
  const model = getModel();

  // Hold back enough characters that a control signal split across deltas
  // can never partially escape to the client.
  const TAIL_HOLDBACK = 64;

  return withRetries(async () => {
    const stream = client.messages.stream({
      model,
      max_tokens: 4096,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: input.conversation.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    let full = "";
    let emitted = 0; // how many chars of `full` have been sent to client

    stream.on("text", (delta) => {
      full += delta;
      // Emit everything except the last TAIL_HOLDBACK chars.
      const safeUpTo = Math.max(emitted, full.length - TAIL_HOLDBACK);
      if (safeUpTo > emitted) {
        const chunk = full.slice(emitted, safeUpTo);
        emitted = safeUpTo;
        void input.onDelta(chunk);
      }
    });

    const finalMessage = await stream.finalMessage();

    const rawText = full;
    const parsed = parseResponse(rawText);

    // Flush the remaining tail, minus the control signal (parseResponse
    // already stripped it from displayText).
    if (parsed.displayText.length > emitted) {
      const rest = parsed.displayText.slice(emitted);
      await input.onDelta(rest);
    }

    return {
      displayText: parsed.displayText,
      signal: parsed.signal,
      rawText,
      usage: usageFromResponse(finalMessage.usage),
    };
  }, `runTurnStream:${input.activePrompt}`);
}

// ----- Cost estimation (for admin dashboard) ---------------------------
//
// Prices per million tokens. Update if Anthropic pricing changes.
// Defaults are for Claude Sonnet-class models.

const PRICE_INPUT_PER_M = parseFloat(process.env.PRICE_INPUT_PER_M || "3");
const PRICE_OUTPUT_PER_M = parseFloat(process.env.PRICE_OUTPUT_PER_M || "15");
const PRICE_CACHE_READ_PER_M = parseFloat(
  process.env.PRICE_CACHE_READ_PER_M || "0.3",
);
const PRICE_CACHE_WRITE_PER_M = parseFloat(
  process.env.PRICE_CACHE_WRITE_PER_M || "3.75",
);

export function estimateCostUsd(u: {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}): number {
  return (
    (u.inputTokens / 1_000_000) * PRICE_INPUT_PER_M +
    (u.outputTokens / 1_000_000) * PRICE_OUTPUT_PER_M +
    (u.cacheReadTokens / 1_000_000) * PRICE_CACHE_READ_PER_M +
    (u.cacheWriteTokens / 1_000_000) * PRICE_CACHE_WRITE_PER_M
  );
}
