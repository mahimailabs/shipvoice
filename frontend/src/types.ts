export type CallChannel = "web" | "sip";
export type CallStatus = "active" | "completed" | "failed";

export interface CallRead {
  id: number;
  room_name: string;
  caller: string | null;
  channel: CallChannel;
  agent_name: string | null;
  business_name: string | null;
  status: CallStatus;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  turn_count: number;
}

export interface CallListResponse {
  calls: CallRead[];
  total: number;
}

export interface TurnRead {
  id: number;
  role: "user" | "agent";
  text: string;
  spoken_at: string;
}

export interface CallDetailResponse {
  call: CallRead;
  transcript: TurnRead[];
}

export interface CallSummaryResponse {
  total_calls: number;
  total_minutes: number;
  total_turns: number;
}

/** How many calls failed in a trailing window, and out of how many. */
export interface CallOverviewFailed {
  count: number;
  of: number;
  window_hours: number;
}

/**
 * When the agent last reported a call to the backend.
 *
 * Null on both fields means no report has ever landed. That is unknown, not a
 * healthy silence, so the Overview says so rather than drawing a green light.
 */
export interface CallOverviewLastReport {
  at: string | null;
  seconds_ago: number | null;
}

/**
 * The Overview rollup: only the figures this deployment actually measures.
 *
 * There is deliberately no cost, no billing, and no campaign here. Nothing in
 * this repo prices a minute, so a field for it would only ever carry a guess.
 */
export interface CallOverviewResponse {
  calls_today: number;
  metered_minutes: number;
  active: number;
  failed: CallOverviewFailed;
  last_report: CallOverviewLastReport;
}

/**
 * How the worker is wired. Two shapes only: one agent handling the call, or a
 * supervisor routing to specialists. Anything else is not something this
 * backend can report.
 */
export type AgentPattern = "sequential" | "supervisor";

export interface AgentSummary {
  slug: string;
  agent_name: string;
  business_name: string | null;
  active: boolean;
  prompt_path: string;
  stt: string | null;
  llm: string | null;
  tts: string | null;
  /** Where the agent was declared on disk, for example agent/src/agent.py. */
  declared_in: string;
  pattern: AgentPattern;
}

export interface AgentListResponse {
  agents: AgentSummary[];
}

export interface RollupByAgent {
  agent_name: string;
  calls: number;
}

export interface RollupByChannel {
  /**
   * A plain string, not CallChannel. The rollup counts what is already in the
   * log, and one old row with an unexpected value must not take the count down.
   */
  channel: string;
  calls: number;
}

/** Counts over a trailing window. A missing agent here is a measured zero. */
export interface CallRollupResponse {
  days: number;
  total: number;
  by_agent: RollupByAgent[];
  by_channel: RollupByChannel[];
}

/** Matches the backend's standardized LiveKit token shape exactly. */
export interface RoomTokenResponse {
  server_url: string;
  participant_token: string;
}

export interface DeploymentRead {
  project_name: string;
  env: string;
  livekit_url: string | null;
}

/** The LiveKit project. The secret is never sent, only whether one is set. */
export interface LiveKitRead {
  url: string | null;
  api_key_hint: string | null;
  secret_set: boolean;
  source: "database" | "environment";
  /** False when no service token is set, which is the shipped default. */
  worker_follows: boolean;
}

export interface LiveKitWrite {
  url: string;
  api_key: string;
  /** Blank means keep the stored secret: the console cannot read it back. */
  api_secret?: string;
}

/**
 * The agent's system prompt, as the file on disk.
 *
 * There is no database behind this and no revision history: the file is the
 * single source of truth, and every field here describes that one file.
 */
export interface AgentPromptRead {
  slug: string;
  /** Display path, always agent/prompts/instructions.md. */
  path: string;
  /** Empty string when exists is false. */
  content: string;
  /** False when the file is not on disk yet. The agent then uses its default. */
  exists: boolean;
  /** CONSOLE_WRITES_ENABLED, and the target is writable. */
  editable: boolean;
  /** Why editable is false. Null when it is true. */
  read_only_reason: string | null;
  /** utf-8 byte length of content. */
  byte_size: number;
  /** The cap a save enforces. */
  max_bytes: number;
  /** Non-blocking notes about the prompt. Never an error, never a refusal. */
  warnings: string[];
}
