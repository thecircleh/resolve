// Types used throughout the Resolve orchestrator.

export type PromptId =
  | "operating-spine"
  | "business-context-builder"
  | "situation-clarifier"
  | "sales-planning"
  | "decision-maker"
  | "business-planner"
  | "workflow-architect";

export type EntryPromptId = "situation-clarifier" | "sales-planning";

export type EnginePromptId =
  | "decision-maker"
  | "business-planner"
  | "workflow-architect";

export type LaneClassification =
  | "STRATEGIC"
  | "TACTICAL"
  | "OPERATIONAL"
  | "MIXED_STRATEGIC"
  | "MIXED_TACTICAL"
  | "MIXED_OPERATIONAL"
  | "MONITOR";

export type TierClassification = "QUICK_CALL" | "STANDARD" | "HIGH_STAKES";

// Structural signals the orchestrator watches for in model output.
// These are emitted by the model on their own lines and stripped
// before showing content to the user.
export type ControlSignal =
  | { type: "CONTINUING" }
  | { type: "BRIEFING_READY"; engine: EnginePromptId }
  | { type: "MONITOR_LOGGED" }
  | { type: "OUTPUT_DELIVERED" }
  | { type: "PROFILE_FINALIZED" };

// A message in the conversation as stored in DB and sent to the model.
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// The Required Output Standard (Standard and High Stakes tiers).
export interface ResolveOutput {
  executiveSummary: string;
  whatMattersMost: string;
  whatThisComesDownTo: string;
  recommendedNextStep: string;
  decisionConfidence: {
    level: "LOW" | "MEDIUM" | "HIGH";
    rationale: string;
  };
  valuesCheck: string;
  aQuestionToConsider: string;
  topThreeLeadershipTalkingPoints: string[];
  // Full raw text as produced by the engine, for display
  rawText: string;
}

// The Entry-prompt Briefing that hands off to an Engine.
export interface EntryBriefing {
  issueRestated: string;
  contextSummary: string;
  materialImpact: string;
  laneClassification: LaneClassification;
  laneRationale: string;
  tierClassification: TierClassification;
  tierRationale: string;
  whatTheLeaderHasTried: string;
  openQuestions: string;
  recommendedEngine: EnginePromptId;
  handoffNote: string;
  rawText: string;
}

// A Monitor-lane tracking note.
export interface MonitorNote {
  issue: string;
  whyMonitor: string;
  thresholdForResurfacing: string;
  logged: string;
  rawText: string;
}
