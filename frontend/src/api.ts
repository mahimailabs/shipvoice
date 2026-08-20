// The only module that knows the backend's base URL, and the console's one seam
// to it. The demo build (VITE_DEMO) resolves this specifier to
// src/demo/fixtures.ts instead, so nothing below ships in that bundle. See the
// alias in vite.config.ts.
//
// Every call here is a read. The console shows what the deployment is running
// and what it has run; the configuration behind it lives in files and the
// environment, and is changed there. The one POST is the browser test call,
// which mints a room token rather than storing anything.
import type {
  AgentListResponse,
  AgentPromptRead,
  CallDetailResponse,
  CallListParams,
  CallListResponse,
  CallOverviewResponse,
  CallRollupResponse,
  CallSummaryResponse,
  DeploymentRead,
  LiveKitRead,
  RoomTokenResponse,
} from "./types";

export { ApiError } from "./api-error";
export type { CallListParams } from "./types";

import { ApiError } from "./api-error";

export const API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

/**
 * Turn a non-2xx into an ApiError.
 *
 * FastAPI puts the sentence worth reading in `detail`, and for some refusals
 * that sentence is the whole message. Prefer it, and keep the generic line for
 * a response that carries no detail at all. A validation error's detail is a
 * list rather than a string, so only a string is taken.
 */
async function guard(res: Response, what: string): Promise<void> {
  if (res.ok) return;
  let detail: string | null = null;
  try {
    const body: unknown = await res.json();
    if (body != null && typeof body === "object" && "detail" in body) {
      const value = (body as { detail: unknown }).detail;
      if (typeof value === "string" && value.trim().length > 0) detail = value;
    }
  } catch {
    // No body, or not JSON. The generic line below stands.
  }
  throw new ApiError(res.status, detail ?? `${what} failed (${res.status})`);
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

/**
 * The Overview page's own rollup.
 *
 * Fetched separately from the call list so a backend that predates this route
 * still renders the page: the figures fall back to dashes instead of taking the
 * whole screen down.
 */
export async function getCallOverview(): Promise<CallOverviewResponse> {
  return get<CallOverviewResponse>(
    "/api/v1/calls/overview",
    "Loading the overview",
  );
}

export async function getCall(
  id: number | string,
): Promise<CallDetailResponse> {
  return get<CallDetailResponse>(`/api/v1/calls/${id}`, "Loading the call");
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

/**
 * The agent's system prompt file. A file that is not on disk yet is a 200 with
 * exists false, never a 404, so a missing prompt reads as a missing file rather
 * than as a missing agent. Read only: the buyer edits the file.
 */
export async function getAgentPrompt(slug: string): Promise<AgentPromptRead> {
  return get<AgentPromptRead>(
    `/api/v1/agents/${encodeURIComponent(slug)}/prompt`,
    "Loading the prompt",
  );
}

export async function getDeployment(): Promise<DeploymentRead> {
  return get<DeploymentRead>("/api/v1/deployment", "Loading the deployment");
}

export async function getLiveKit(): Promise<LiveKitRead> {
  return get<LiveKitRead>("/api/v1/livekit", "Loading the LiveKit project");
}
