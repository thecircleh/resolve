// Control-signal parser.
//
// Every prompt is instructed to end its response with exactly one control
// line in the format:
//
//   [[RESOLVE_STATE:VALUE]]
//
// Where VALUE is one of:
//   CONTINUING
//   BRIEFING_READY|ENGINE:decision_maker
//   BRIEFING_READY|ENGINE:business_planner
//   BRIEFING_READY|ENGINE:workflow_architect
//   MONITOR_LOGGED
//   OUTPUT_DELIVERED
//   PROFILE_FINALIZED
//
// This module parses that line out of the model's output and returns
// both the cleaned text (safe to display) and the parsed signal.

import type { ControlSignal, EnginePromptId } from "./types";

const SIGNAL_PATTERN = /\[\[RESOLVE_STATE:([^\]]+)\]\]/;

export interface ParsedResponse {
  displayText: string;
  signal: ControlSignal;
}

export function parseResponse(rawText: string): ParsedResponse {
  const match = rawText.match(SIGNAL_PATTERN);

  // Default to CONTINUING if no signal found. This means the model forgot
  // to emit a signal; we treat the session as still active on the current
  // prompt. Not ideal but safe.
  if (!match) {
    return {
      displayText: rawText.trim(),
      signal: { type: "CONTINUING" },
    };
  }

  const signalValue = match[1].trim();
  const displayText = rawText.replace(SIGNAL_PATTERN, "").trim();

  if (signalValue === "CONTINUING") {
    return { displayText, signal: { type: "CONTINUING" } };
  }

  if (signalValue === "MONITOR_LOGGED") {
    return { displayText, signal: { type: "MONITOR_LOGGED" } };
  }

  if (signalValue === "OUTPUT_DELIVERED") {
    return { displayText, signal: { type: "OUTPUT_DELIVERED" } };
  }

  if (signalValue === "PROFILE_FINALIZED") {
    return { displayText, signal: { type: "PROFILE_FINALIZED" } };
  }

  if (signalValue.startsWith("BRIEFING_READY|ENGINE:")) {
    const engineRaw = signalValue.split("BRIEFING_READY|ENGINE:")[1].trim();
    const engineMap: Record<string, EnginePromptId> = {
      decision_maker: "decision-maker",
      business_planner: "business-planner",
      workflow_architect: "workflow-architect",
    };
    const engine = engineMap[engineRaw];
    if (engine) {
      return {
        displayText,
        signal: { type: "BRIEFING_READY", engine },
      };
    }
  }

  // Unrecognized signal — default to CONTINUING.
  return {
    displayText,
    signal: { type: "CONTINUING" },
  };
}
