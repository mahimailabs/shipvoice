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

export interface AgentSummary {
  slug: string;
  agent_name: string;
  business_name: string | null;
  active: boolean;
  prompt_path: string;
  stt: string | null;
  llm: string | null;
  tts: string | null;
}

export interface AgentListResponse {
  agents: AgentSummary[];
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
