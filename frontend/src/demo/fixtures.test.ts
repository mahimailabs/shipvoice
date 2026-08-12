import { afterEach, describe, expect, it, vi } from "vitest";
import * as real from "../api";
import * as fixtures from "./fixtures";
import { ApiError } from "../api-error";
import { DEMO_NOW } from "./data";
import type { CallRead } from "../types";

// The demo build swaps src/api.ts for src/demo/fixtures.ts at the module level
// (vite.config.ts), and TypeScript never sees that swap: the demo build still
// type-checks the pages against the real module. So the two things that keep
// the preview from breaking silently are here.
//
//   1. The contract. Fixtures must export everything api.ts exports, with
//      compatible signatures. Adding a fourteenth call to api.ts and using it
//      on a page must fail here rather than on shipvoice.dev.
//   2. The arithmetic. Every figure the Overview prints is folded out of the
//      same call list the log renders, so a reader who counts the rows and
//      compares them with "Calls today" gets the same answer.

/**
 * Compile-time half of the contract, and the load-bearing one.
 *
 * `tsc -b` type-checks src, so a fixtures module that has fallen behind api.ts
 * fails `pnpm build` and `pnpm build:demo`, not just `pnpm test`.
 */
const _contract: typeof real = fixtures;
void _contract;

const ALL = 500;

async function everyCall(): Promise<CallRead[]> {
  const { calls } = await fixtures.listCalls({ limit: ALL });
  return calls;
}

describe("the demo seam matches the real api module", () => {
  it("exports every runtime name api.ts exports", () => {
    const missing = Object.keys(real).filter((name) => !(name in fixtures));
    expect(missing).toEqual([]);
  });

  it("exports all thirteen calls plus the error type and the base", () => {
    // Named rather than counted, so a rename shows up as the name that went
    // missing instead of as an off-by-one.
    for (const name of [
      "listCalls",
      "getSummary",
      "getCallOverview",
      "getCall",
      "deleteCall",
      "listAgents",
      "getCallRollup",
      "getTestCallToken",
      "getAgentPrompt",
      "putAgentPrompt",
      "getDeployment",
      "getLiveKit",
      "saveLiveKit",
    ]) {
      expect(typeof (fixtures as Record<string, unknown>)[name]).toBe(
        "function",
      );
    }
    expect(typeof fixtures.API_BASE).toBe("string");
  });

  it("raises the same ApiError class the pages branch on", async () => {
    // Two copies of the class would make `e instanceof ApiError` answer false
    // across the seam, and every page's refusal handling would go quiet.
    expect(fixtures.ApiError).toBe(real.ApiError);
    await expect(fixtures.getCall(999_999)).rejects.toBeInstanceOf(ApiError);
  });

  it("never puts a backend address in the preview's base", () => {
    expect(fixtures.API_BASE).not.toMatch(/localhost|http/);
  });

  it("makes no request, on any of the thirteen", async () => {
    // The reason the preview exists as fixtures rather than as a deployment:
    // the Lite backend has no authentication on any route, so a public one
    // would let a stranger rewrite the prompt and spend someone else's
    // provider credits. One request from this module and that is back.
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const xhr = vi.spyOn(XMLHttpRequest.prototype, "open");

    const calls = [
      fixtures.listCalls(),
      fixtures.getSummary(),
      fixtures.getCallOverview(),
      fixtures.getCall(1),
      fixtures.getCallRollup(),
      fixtures.listAgents(),
      fixtures.getAgentPrompt("assistant"),
      fixtures.getDeployment(),
      fixtures.getLiveKit(),
      fixtures.deleteCall(1),
      fixtures.putAgentPrompt("assistant", "x"),
      fixtures.saveLiveKit({ url: "wss://x", api_key: "k" }),
      fixtures.getTestCallToken("assistant"),
    ];
    await Promise.allSettled(calls);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the preview refuses every write, and says why", () => {
  const writes: [string, () => Promise<unknown>][] = [
    ["deleteCall", () => fixtures.deleteCall(1)],
    ["putAgentPrompt", () => fixtures.putAgentPrompt("assistant", "hi")],
    [
      "saveLiveKit",
      () => fixtures.saveLiveKit({ url: "wss://x", api_key: "k" }),
    ],
    ["getTestCallToken", () => fixtures.getTestCallToken("assistant")],
  ];

  for (const [name, run] of writes) {
    it(`${name} refuses rather than pretending to succeed`, async () => {
      await expect(run()).rejects.toBeInstanceOf(ApiError);
      await run().catch((e: unknown) => {
        const err = e as ApiError;
        // Status 0 is "the request reached nobody", which is exactly true here.
        expect(err.status).toBe(0);
        expect(err.message).toMatch(/no backend behind this page/i);
        // Nothing may read as a write that landed. "Written to
        // agent/prompts/instructions.md" is the console's success wording.
        expect(err.message).not.toMatch(/written to|to disk/i);
      });
    });
  }

  it("serves the prompt read-only rather than offering a save that cannot land", async () => {
    const prompt = await fixtures.getAgentPrompt("assistant");
    expect(prompt.editable).toBe(false);
    expect(prompt.read_only_reason).toMatch(/no backend/i);
    expect(prompt.exists).toBe(true);
    // The file this repo ships, not an invention: it is the one thing on the
    // Agents page a reader can check against the clone.
    expect(prompt.content).toContain("{agent_name}");
    expect(prompt.byte_size).toBe(
      new TextEncoder().encode(prompt.content).length,
    );
  });
});

describe("the sample deployment is one agent with a used call log", () => {
  it("declares the agent this repo runs", async () => {
    const { agents } = await fixtures.listAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0].slug).toBe("assistant");
    expect(agents[0].pattern).toBe("sequential");
    expect(agents[0].stt).toBe("deepgram nova-3");
    expect(agents[0].llm).toBe("cerebras gemma-4-31b");
    expect(agents[0].tts).toBe("inworld inworld-tts-2 (Ashley)");
  });

  it("points at an obviously invented LiveKit project", async () => {
    const lk = await fixtures.getLiveKit();
    expect(lk.url).toMatch(/^wss:\/\/[\w-]+\.example\.com$/);
    expect(lk.api_key_hint).toBe("APIdemo000000");
  });

  it("holds about forty calls inside the last seven days", async () => {
    const calls = await everyCall();
    expect(calls.length).toBeGreaterThanOrEqual(35);
    expect(calls.length).toBeLessThanOrEqual(45);
    for (const c of calls) {
      const age = DEMO_NOW - Date.parse(c.started_at);
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThan(7 * 86_400_000);
    }
  });

  it("mixes statuses the way a working deployment does", async () => {
    const calls = await everyCall();
    const count = (s: string) => calls.filter((c) => c.status === s).length;
    expect(count("active")).toBe(1);
    expect(count("failed")).toBeGreaterThanOrEqual(2);
    expect(count("completed")).toBeGreaterThan(calls.length / 2);
    expect(new Set(calls.map((c) => c.channel)).size).toBe(2);
    // A caller id per number, not one number forty times.
    const callers = new Set(calls.map((c) => c.caller).filter(Boolean));
    expect(callers.size).toBeGreaterThanOrEqual(5);
  });

  it("serves the log newest first, the way the backend pages it", async () => {
    const calls = await everyCall();
    for (let i = 1; i < calls.length; i += 1) {
      expect(Date.parse(calls[i - 1].started_at)).toBeGreaterThanOrEqual(
        Date.parse(calls[i].started_at),
      );
    }
  });

  it("filters and pages without lying about the total", async () => {
    const all = await everyCall();
    const sip = await fixtures.listCalls({ limit: ALL, channel: "sip" });
    expect(sip.total).toBe(all.filter((c) => c.channel === "sip").length);
    expect(sip.calls.every((c) => c.channel === "sip")).toBe(true);

    const page = await fixtures.listCalls({ limit: 6, offset: 6 });
    expect(page.calls).toHaveLength(6);
    // The total is the size of the log, not of the page the reader is on.
    expect(page.total).toBe(all.length);
    expect(page.calls[0].id).toBe(all[6].id);
  });
});

describe("every transcript belongs to the call that carries it", () => {
  it("matches turn_count, and fits inside the call's own duration", async () => {
    const calls = await everyCall();
    for (const row of calls) {
      const { call, transcript } = await fixtures.getCall(row.id);
      expect(transcript).toHaveLength(call.turn_count);

      const started = Date.parse(call.started_at);
      let previous = started;
      for (const turn of transcript) {
        const spoken = Date.parse(turn.spoken_at);
        expect(spoken).toBeGreaterThanOrEqual(previous);
        expect(turn.text.length).toBeGreaterThan(0);
        previous = spoken;
      }
      if (call.duration_seconds != null) {
        // A call is never shorter than the conversation printed inside it.
        expect(started + call.duration_seconds * 1000).toBeGreaterThanOrEqual(
          previous,
        );
        expect(call.ended_at).not.toBeNull();
      }
    }
  });

  it("leaves the call in flight without an end or a duration", async () => {
    const calls = await everyCall();
    const active = calls.filter((c) => c.status === "active");
    expect(active).toHaveLength(1);
    expect(active[0].duration_seconds).toBeNull();
    expect(active[0].ended_at).toBeNull();
  });

  it("answers 404 for a call that is not in the log", async () => {
    await expect(fixtures.getCall(999_999)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("the Overview's figures agree with the call log under them", () => {
  it("counts today off the same rows the log serves", async () => {
    const calls = await everyCall();
    const overview = await fixtures.getCallOverview();

    // The visitor's midnight, because the call log beside this figure renders
    // local timestamps. A UTC boundary here would pass in CI and disagree with
    // the rows on screen for every reader outside UTC.
    const dayStart = new Date(DEMO_NOW);
    dayStart.setHours(0, 0, 0, 0);
    const today = calls.filter(
      (c) => Date.parse(c.started_at) >= dayStart.getTime(),
    );

    expect(overview.calls_today).toBe(today.length);
    // A reader with the log open has to find rows behind this number.
    expect(overview.calls_today).toBeGreaterThan(0);
  });

  it("meters the minutes it recorded, rounded the way the backend rounds", async () => {
    const calls = await everyCall();
    const overview = await fixtures.getCallOverview();

    const seconds = calls.reduce((s, c) => s + (c.duration_seconds ?? 0), 0);
    expect(overview.metered_minutes).toBe(Math.round((seconds / 60) * 10) / 10);
    expect(overview.metered_minutes).toBeGreaterThan(0);
  });

  it("rates failures against the population they came out of", async () => {
    const calls = await everyCall();
    const overview = await fixtures.getCallOverview();

    const since = DEMO_NOW - overview.failed.window_hours * 3_600_000;
    const window = calls.filter((c) => Date.parse(c.started_at) >= since);

    expect(overview.failed.window_hours).toBe(24);
    expect(overview.failed.of).toBe(window.length);
    expect(overview.failed.count).toBe(
      window.filter((c) => c.status === "failed").length,
    );
    // The one thing a rate must never do.
    expect(overview.failed.count).toBeLessThanOrEqual(overview.failed.of);
  });

  it("counts in flight calls off the same window", async () => {
    const calls = await everyCall();
    const overview = await fixtures.getCallOverview();
    const since = DEMO_NOW - 24 * 3_600_000;
    expect(overview.active).toBe(
      calls.filter(
        (c) => c.status === "active" && Date.parse(c.started_at) >= since,
      ).length,
    );
  });

  it("dates the metering seam from the newest call in the log", async () => {
    const calls = await everyCall();
    const overview = await fixtures.getCallOverview();
    // Newest start, not newest end: a call still running is the freshest thing
    // the worker sent.
    expect(overview.last_report.at).toBe(calls[0].started_at);
    expect(overview.last_report.seconds_ago).toBeGreaterThanOrEqual(0);
  });

  it("splits the rollup so the slices add up to the ring's own total", async () => {
    const calls = await everyCall();
    const rollup = await fixtures.getCallRollup(7);

    const since = DEMO_NOW - 7 * 86_400_000;
    const window = calls.filter((c) => Date.parse(c.started_at) >= since);

    expect(rollup.days).toBe(7);
    expect(rollup.total).toBe(window.length);
    expect(rollup.by_agent.reduce((s, a) => s + a.calls, 0)).toBe(rollup.total);
    expect(rollup.by_channel.reduce((s, c) => s + c.calls, 0)).toBe(
      rollup.total,
    );
    expect(rollup.by_agent).toEqual([
      { agent_name: "assistant", calls: window.length },
    ]);
  });

  it("sums the same seconds and turns into the standalone summary", async () => {
    const calls = await everyCall();
    const summary = await fixtures.getSummary();

    let turns = 0;
    for (const c of calls) turns += c.turn_count;

    expect(summary.total_calls).toBe(calls.length);
    expect(summary.total_turns).toBe(turns);
    const seconds = calls.reduce((s, c) => s + (c.duration_seconds ?? 0), 0);
    expect(summary.total_minutes).toBe(Math.round((seconds / 60) * 100) / 100);
  });
});
