// The console's data layer for the public preview.
//
// This module is a drop-in for src/api.ts: same names, same signatures, same
// types. The demo build resolves every `import ... from "../api"` here instead
// (see the alias in vite.config.ts), which is why no page in this repo carries
// an `if (DEMO)` around a fetch, and why the preview cannot drift from the
// console. It is the same console.
//
// Nothing in here touches the network. That is the point: the Lite backend has
// no authentication on any route, so a public deployment of it would let a
// stranger spend someone else's provider credits. AGENTS.md says never expose
// it, so the preview reads fixtures.
//
// The console has no writes left to refuse. One call still cannot be answered
// here: a test call needs a live LiveKit room and a microphone at the other
// end, so it refuses with one sentence saying why rather than hand back a token
// that reaches nobody.

import { ApiError } from "../api-error";
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
} from "../types";
import { utf8Bytes } from "../lib/format";
import {
  DEMO_AGENT,
  DEMO_AGENT_SLUG,
  DEMO_CALLS,
  DEMO_CALL_ROWS,
  DEMO_DEPLOYMENT,
  DEMO_LIVEKIT,
  DEMO_NOW,
  DEMO_PROMPT,
  deriveOverview,
  deriveRollup,
  deriveSummary,
} from "./data";

export { ApiError } from "../api-error";
export type { CallListParams } from "../types";

/**
 * There is no base URL, because there is no backend.
 *
 * The pages that print this only do so in their "the call log is not wired up"
 * state, which fixtures never reach. It is empty rather than a plausible host
 * so that nothing here can put an address on screen that nobody is listening
 * on.
 */
export const API_BASE = "";

/** The backend's own cap, so paging behaves the way it does against a server. */
const MAX_PAGE_SIZE = 200;

/**
 * What the one unanswerable call answers with.
 *
 * Status 0 is what api.ts raises when the request never reached anyone, and
 * that is exactly what happened: there is nothing to reach. The page surfaces
 * this sentence verbatim, so it has to explain itself with no other context.
 */
const NO_BACKEND =
  "This is a preview of the console running on sample data. There is no backend behind this page, so nothing here can be saved. Clone the repo to run the console against your own deployment.";

// ---------- reads ----------

export async function listCalls(
  params: CallListParams = {},
): Promise<CallListResponse> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), MAX_PAGE_SIZE);
  const offset = Math.max(params.offset ?? 0, 0);
  const channel = params.channel && params.channel !== "all" ? params.channel : null;
  const status = params.status && params.status !== "all" ? params.status : null;

  const matched = DEMO_CALL_ROWS.filter(
    (c) =>
      (channel == null || c.channel === channel) &&
      (status == null || c.status === status),
  );

  // total is the size of the filtered log, not of the page, which is what the
  // pager and the "of 40" counts read.
  return { calls: matched.slice(offset, offset + limit), total: matched.length };
}

export async function getSummary(): Promise<CallSummaryResponse> {
  return deriveSummary(
    DEMO_CALL_ROWS,
    DEMO_CALLS.reduce((sum, r) => sum + r.transcript.length, 0),
  );
}

export async function getCallOverview(): Promise<CallOverviewResponse> {
  return deriveOverview(DEMO_CALL_ROWS, DEMO_NOW);
}

export async function getCall(
  id: number | string,
): Promise<CallDetailResponse> {
  const wanted = Number(id);
  const found = DEMO_CALLS.find((r) => r.call.id === wanted);
  // The same 404 the backend raises, so a stale link renders the console's own
  // "not in the log" screen rather than a spinner that never resolves.
  if (!found) throw new ApiError(404, `No call ${id} in the log.`);
  return { call: found.call, transcript: found.transcript };
}

export async function listAgents(): Promise<AgentListResponse> {
  return { agents: [DEMO_AGENT] };
}

export async function getCallRollup(days = 7): Promise<CallRollupResponse> {
  return deriveRollup(DEMO_CALL_ROWS, DEMO_NOW, Math.min(Math.max(days, 1), 365));
}

/**
 * The prompt file, as the backend reports it.
 *
 * Nothing in the preview has to be softened for this one: the route is a read
 * everywhere, and what it describes is a file in the clone.
 */
export async function getAgentPrompt(slug: string): Promise<AgentPromptRead> {
  if (slug !== DEMO_AGENT_SLUG) {
    throw new ApiError(
      404,
      `No agent named '${slug}' here. This deployment runs one agent and it is called '${DEMO_AGENT_SLUG}'.`,
    );
  }
  return {
    slug: DEMO_AGENT_SLUG,
    path: DEMO_AGENT.prompt_path,
    content: DEMO_PROMPT,
    exists: true,
    byte_size: utf8Bytes(DEMO_PROMPT),
    warnings: [],
  };
}

export async function getDeployment(): Promise<DeploymentRead> {
  return DEMO_DEPLOYMENT;
}

export async function getLiveKit(): Promise<LiveKitRead> {
  return DEMO_LIVEKIT;
}

// ---------- the one call that needs a live room ----------

/**
 * A test call needs a LiveKit project and a microphone, so it cannot be
 * simulated honestly and this refuses rather than hand back a fake token.
 * Nothing in the preview reaches it: the Start button on the test call screen
 * is disabled, and says why. The annotation is what pins the signature to
 * api.ts's.
 */
export const getTestCallToken: (
  agentName: string,
) => Promise<RoomTokenResponse> = () =>
  Promise.reject(new ApiError(0, NO_BACKEND));
