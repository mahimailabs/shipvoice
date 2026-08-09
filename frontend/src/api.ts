// The only module that knows the backend's base URL.
import type {
  AgentListResponse,
  CallDetailResponse,
  CallListResponse,
  CallRollupResponse,
  CallSummaryResponse,
  DeploymentRead,
  LiveKitRead,
  LiveKitWrite,
  RoomTokenResponse,
} from "./types";

export const API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }

  get isForbidden(): boolean {
    return this.status === 401 || this.status === 403;
  }

  get isUnreachable(): boolean {
    return this.status === 0 || this.status >= 500;
  }

  get isMissing(): boolean {
    return this.status === 404;
  }
}

async function guard(res: Response, what: string): Promise<void> {
  if (res.ok) return;
  throw new ApiError(res.status, `${what} failed (${res.status})`);
}

async function get<T>(path: string, what: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`);
  } catch {
    throw new ApiError(0, `${what} could not reach the backend`);
  }
  await guard(res, what);
  return (await res.json()) as T;
}

export interface CallListParams {
  limit?: number;
  offset?: number;
  channel?: string;
  status?: string;
}

export async function listCalls(
  params: CallListParams = {},
): Promise<CallListResponse> {
  const q = new URLSearchParams();
  q.set("limit", String(params.limit ?? 50));
  q.set("offset", String(params.offset ?? 0));
  if (params.channel && params.channel !== "all")
    q.set("channel", params.channel);
  if (params.status && params.status !== "all") q.set("status", params.status);

  return get<CallListResponse>(
    `/api/v1/calls/?${q.toString()}`,
    "Loading calls",
  );
}

export async function getSummary(): Promise<CallSummaryResponse> {
  return get<CallSummaryResponse>(
    "/api/v1/calls/summary",
    "Loading the summary",
  );
}

export async function getCall(
  id: number | string,
): Promise<CallDetailResponse> {
  return get<CallDetailResponse>(`/api/v1/calls/${id}`, "Loading the call");
}

export async function deleteCall(id: number | string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/v1/calls/${id}`, { method: "DELETE" });
  } catch {
    throw new ApiError(0, "Could not reach the backend");
  }
  await guard(res, "Deleting the call");
}

export async function listAgents(): Promise<AgentListResponse> {
  return get<AgentListResponse>("/api/v1/agents", "Loading agents");
}

/** Per-agent and per-channel call counts over a trailing window. */
export async function getCallRollup(days = 7): Promise<CallRollupResponse> {
  return get<CallRollupResponse>(
    `/api/v1/calls/rollup?days=${days}`,
    "Loading the call rollup",
  );
}

export async function getTestCallToken(
  agentName: string,
): Promise<RoomTokenResponse> {
  const room = `console-${Math.random().toString(16).slice(2, 14)}`;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/v1/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room_name: room,
        participant_identity: `console-${Math.random().toString(16).slice(2, 10)}`,
        room_config: { agents: [{ agent_name: agentName }] },
      }),
    });
  } catch {
    throw new ApiError(0, "Could not reach the backend");
  }
  await guard(res, "Starting the test call");
  return (await res.json()) as RoomTokenResponse;
}

export async function getDeployment(): Promise<DeploymentRead> {
  return get<DeploymentRead>("/api/v1/deployment", "Loading the deployment");
}

export async function getLiveKit(): Promise<LiveKitRead> {
  return get<LiveKitRead>("/api/v1/livekit", "Loading the LiveKit project");
}

export async function saveLiveKit(payload: LiveKitWrite): Promise<LiveKitRead> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/v1/livekit`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new ApiError(0, "Could not reach the backend");
  }
  await guard(res, "Saving the LiveKit project");
  return (await res.json()) as LiveKitRead;
}
