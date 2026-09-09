// Prompt loader.
//
// The seven master prompts live as separate .md files in ./prompts/.
// This module reads them at server startup and holds them in memory.
//
// They MUST stay server-side. Do not import this module from any
// client component. Do not include the prompt text in any API response.

import { readFileSync } from "fs";
import { join } from "path";
import type { PromptId } from "./types";

const PROMPT_DIR = join(process.cwd(), "src", "resolve", "prompts");

function loadPrompt(id: PromptId): string {
  const filePath = join(PROMPT_DIR, `${id}.md`);
  return readFileSync(filePath, "utf-8");
}

// Cache prompts in memory. In serverless environments each cold start will
// re-read, which is fine — files are small and reads are fast.
const prompts: Record<PromptId, string> = {
  "operating-spine": loadPrompt("operating-spine"),
  "business-context-builder": loadPrompt("business-context-builder"),
  "situation-clarifier": loadPrompt("situation-clarifier"),
  "sales-planning": loadPrompt("sales-planning"),
  "decision-maker": loadPrompt("decision-maker"),
  "business-planner": loadPrompt("business-planner"),
  "workflow-architect": loadPrompt("workflow-architect"),
};

export function getPrompt(id: PromptId): string {
  return prompts[id];
}

// The Operating Spine is always loaded as inherited discipline for
// any Entry or Engine session.
export function getSpineContext(): string {
  return prompts["operating-spine"];
}
