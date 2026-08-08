// The only module that knows the backend's base URL.
import type {
  AgentListResponse,
  CallDetailResponse,
  CallListResponse,
  CallSummaryResponse,
  RoomTokenResponse,
} from "./types";

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

// This console has no sign-in. It is a local tool for the person who owns the
// deployment, and a login screen between someone and their own agent is
// friction that buys nothing on localhost.
//
// That is a deliberate trade, and it has a consequence worth knowing before
// you put this on the public internet: anything the console can read, an
// anonymous visitor can read too. See the deploy section of the README.

/**
 * A failed request, with the states the UI must never conflate.
 *
 * Rendering "API unreachable" for a 404 sends people to check Docker when the
 * real answer is that the route does not exist in this checkout yet.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }

  /** Only reachable if you have gated the backend yourself. */
  get isForbidden(): boolean {
    return this.status === 401 || this.status === 403;
  }

  get isUnreachable(): boolean {
    return this.status === 0 || this.status >= 500;
  }

  /** The calls slice is not wired yet on a checkout that has not run it. */
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

export async function listCalls(params: CallListParams = {}): Promise<CallListResponse> {
  const q = new URLSearchParams();
  q.set("limit", String(params.limit ?? 50));
  q.set("offset", String(params.offset ?? 0));
  if (params.channel && params.channel !== "all") q.set("channel", params.channel);
  if (params.status && params.status !== "all") q.set("status", params.status);
  // The trailing slash is deliberate: the backend declares @router.get("/")
  // under prefix="/calls", and omitting it costs a 307 on every call.
  return get<CallListResponse>(`/api/v1/calls/?${q.toString()}`, "Loading calls");
}

export async function getSummary(): Promise<CallSummaryResponse> {
  return get<CallSummaryResponse>("/api/v1/calls/summary", "Loading the summary");
}

export async function getCall(id: number | string): Promise<CallDetailResponse> {
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

/**
 * Mint a join token for a browser test call.
 *
 * room_config carries the agent name, which is what dispatches the worker into
 * the room. The response shape stays exactly {server_url, participant_token}:
 * it follows LiveKit's standardized token schema so any client SDK connects
 * without glue, and adding a field to prove dispatch would fork that. The
 * console proves dispatch by watching the agent participant actually join.
 */
export async function getTestCallToken(agentName: string): Promise<RoomTokenResponse> {
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
