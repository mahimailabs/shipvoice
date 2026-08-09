// Console domain types.
//
// There is no call domain here: this starter keeps no record of a call
// once it ends. That is ShipVoice Pro.

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
