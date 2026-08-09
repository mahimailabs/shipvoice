import { act, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { Overview } from "./Overview";
import type { CallListResponse, CallOverviewResponse, CallRead } from "../types";

// The Overview is the page that has to earn the console, so these tests hold
// two lines at once: the reference's shape is complete, and no sample figure is
// ever allowed to pass itself off as a reading from this deployment.

const api = vi.hoisted(() => ({
  listCalls: vi.fn(),
  getCallOverview: vi.fn(),
}));

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    listCalls: api.listCalls,
    getCallOverview: api.getCallOverview,
  };
});

function call(over: Partial<CallRead> = {}): CallRead {
  return {
    id: 1,
    room_name: "console-a1b2c3",
    caller: "+1 415 555 4471",
    channel: "sip",
    agent_name: "renewals-v2",
    business_name: null,
    status: "completed",
    started_at: "2026-08-09T14:22:00Z",
    ended_at: "2026-08-09T14:25:41Z",
    duration_seconds: 221,
    turn_count: 12,
    ...over,
  };
}

function callList(over: Partial<CallListResponse> = {}): CallListResponse {
  return { calls: [call()], total: 349, ...over };
}

function overview(over: Partial<CallOverviewResponse> = {}): CallOverviewResponse {
  return {
    calls_today: 37,
    metered_minutes: 1842,
    active: 4,
    failed: { count: 6, of: 214, window_hours: 24 },
    last_report: { at: "2026-08-09T14:22:48Z", seconds_ago: 12 },
    ...over,
  };
}

function mount() {
  return render(
    <MemoryRouter>
      <Overview />
    </MemoryRouter>,
  );
}

/** Wait for both fetches to have settled into the rendered page. */
async function mounted() {
  const view = mount();
  await waitFor(() => expect(api.listCalls).toHaveBeenCalled());
  return view;
}

beforeEach(() => {
  api.listCalls.mockReset();
  api.getCallOverview.mockReset();
  api.listCalls.mockResolvedValue(callList());
  api.getCallOverview.mockResolvedValue(overview());
});

describe("Overview, the reference's shape", () => {
  it("renders every section the reference has", async () => {
    await mounted();

    for (const title of [
      "Overview",
      "Recent calls",
      "Running now",
      "Health",
      "Spend per day",
    ]) {
      expect(await screen.findByText(title)).toBeInTheDocument();
    }
  });

  it("keeps the money strip whole, arrows and disclosure included", async () => {
    await mounted();

    expect(screen.getByText("PROVIDER COST")).toBeInTheDocument();
    expect(screen.getByText("BILLED")).toBeInTheDocument();
    expect(screen.getByText("KEPT")).toBeInTheDocument();
    expect(screen.getByText("metered by VoiceGateway")).toBeInTheDocument();
    expect(screen.getByText("1,842 min × $0.59, your rate")).toBeInTheDocument();
    expect(screen.getByText("62% margin · Aug 1-6")).toBeInTheDocument();
    expect(
      screen.getByText(/Billed is the rate you configured/),
    ).toBeInTheDocument();
  });

  it("keeps all five stat cells with their labels and sub-labels", async () => {
    await mounted();

    for (const label of [
      "Billable minutes",
      "Calls today",
      "Connect rate",
      "Avg kept per call",
      "Flagged and placed",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    for (const hint of [
      "metered, all agents",
      "outbound only",
      "completed calls",
      "last 24 hours",
    ]) {
      expect(screen.getByText(hint)).toBeInTheDocument();
    }
  });

  it("keeps all nine columns of the recent calls table", async () => {
    await mounted();

    const headers = await screen.findAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual([
      "Time",
      "Agent",
      "Dir",
      "To",
      "Duration",
      "Cost",
      "Kept",
      "Config",
      "Status",
    ]);
  });

  it("keeps the campaign panel's meta, progress and money lines", async () => {
    await mounted();

    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("Q3 renewals")).toBeInTheDocument();
    expect(
      screen.getByText("612 / 1,400 dialled · 251 connected · 94 retries"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("$88.10 kept · $0.35 per connect"),
    ).toBeInTheDocument();
  });

  it("keeps the health rows and the spend chart's own axis", async () => {
    await mounted();

    expect(screen.getByText("agent → backend")).toBeInTheDocument();
    expect(await screen.findByText("Metering seam")).toBeInTheDocument();
    expect(screen.getByText("placed anyway")).toBeInTheDocument();
    expect(screen.getByText("provider cost, $")).toBeInTheDocument();
    for (const day of ["Aug 1", "Aug 3", "Aug 6"]) {
      expect(screen.getByText(day)).toBeInTheDocument();
    }
    // The reference's axis is 0 / 74 / 148, which only holds if the sample
    // points top out at 148.
    expect(screen.getByText("148")).toBeInTheDocument();
    expect(screen.getByText("74")).toBeInTheDocument();
  });

  it("still shows the Warn mode badge the reference puts by the title", async () => {
    await mounted();
    expect(screen.getByText("Warn mode")).toBeInTheDocument();
  });
});

describe("Overview, the paid controls", () => {
  const PRO = [
    "Export .csv",
    "Open Stripe portal ↗",
    "Pause",
    "Open →",
  ];

  it("renders every one of them", async () => {
    await mounted();
    for (const name of PRO) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    // Drawn as the reference draws it, a bordered field rather than a button,
    // so it is inert by construction: there is nothing to click or focus.
    const range = screen.getByText("Last 30 days");
    expect(range).toBeInTheDocument();
    expect(range.tagName).toBe("SPAN");
    expect(range).toHaveAttribute("title");
  });

  it("leaves every one of them disabled", async () => {
    await mounted();
    for (const name of PRO) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
  });

  it("says why each one does nothing, without selling anything", async () => {
    await mounted();
    for (const name of PRO) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("title");
    }
    // The rail already greys locked items with no badge, and the founder has
    // asked twice for no promotion on this page.
    expect(screen.queryByText(/upgrade to pro/i)).toBeNull();
  });

  it("never renders a Pro control as a link that navigates", async () => {
    const { container } = await mounted();
    const hrefs = Array.from(container.querySelectorAll("a")).map(
      (a) => a.textContent ?? "",
    );
    for (const name of PRO) {
      expect(hrefs.some((text) => text.includes(name))).toBe(false);
    }
  });
});

describe("Overview, sample versus real", () => {
  it("marks each sample panel with a sample dot", async () => {
    await mounted();

    // The money strip's three legs, the three sample stat cells, the flagged
    // health row, Running now, and Spend per day.
    const dots = screen.getAllByRole("img", { name: /sample data/i });
    expect(dots).toHaveLength(9);
  });

  it("says what the dot means on hover and to a screen reader", async () => {
    await mounted();

    // The dot carries no text, so the title and the label are the only things
    // that explain it. Losing either leaves a red mark nobody can read.
    const dot = screen.getAllByRole("img", { name: /sample data/i })[0];
    expect(dot).toHaveAttribute(
      "title",
      "This is sample data, not a reading from this deployment.",
    );
  });

  it("puts a dot in the cell of every sample figure", async () => {
    await mounted();

    // In the strip the chip rides the label, in the stat row it rides the
    // figure. Either way it is inside the same cell as the number it marks.
    const cases: [string, string][] = [
      ["$412.80", ".leg"],
      ["$1,090.00", ".leg"],
      ["$677.20", ".leg"],
      ["41.2%", ".stat"],
      ["$1.94", ".stat"],
      ["11", ".stat"],
    ];
    for (const [value, selector] of cases) {
      const cell = screen.getByText(value).closest(selector);
      expect(cell).not.toBeNull();
      expect(
        within(cell as HTMLElement).getByRole("img", { name: /sample data/i }),
      ).toBeInTheDocument();
    }
  });

  it("takes the real figures from the endpoint, with no dot on them", async () => {
    await mounted();

    const minutes = await screen.findByText("1,842");
    const minutesCell = minutes.closest(".stat");
    expect(minutesCell).not.toBeNull();
    expect(
      within(minutesCell as HTMLElement).queryByRole("img", {
        name: /sample data/i,
      }),
    ).toBeNull();

    const today = screen.getByText("37").closest(".stat");
    expect(
      within(today as HTMLElement).queryByRole("img", { name: /sample data/i }),
    ).toBeNull();
  });

  it("reads the health seam and the failure count off the endpoint", async () => {
    const at = new Date(Date.now() - 12_000).toISOString();
    api.getCallOverview.mockResolvedValue(
      overview({ last_report: { at, seconds_ago: 12 } }),
    );
    await mounted();

    expect(await screen.findByText("Reporting")).toBeInTheDocument();
    expect(screen.getByText("12s ago")).toBeInTheDocument();
    expect(screen.getByText("6 failed")).toBeInTheDocument();
    expect(screen.getByText("of 214 · 2.8%")).toBeInTheDocument();
  });

  it("ages the seam while the page stays open", async () => {
    // The backend's seconds_ago is true for the instant the response was built.
    // Rendering it once leaves a page open on a desk still claiming "12s ago"
    // an hour after the agent went quiet, which is the one thing this row is
    // for and the one thing it would be wrong about.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const at = new Date(Date.now() - 12_000).toISOString();
      api.getCallOverview.mockResolvedValue(
        overview({ last_report: { at, seconds_ago: 12 } }),
      );
      await mounted();
      expect(screen.getByText("12s ago")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(120_000);
      });

      expect(screen.queryByText("12s ago")).toBeNull();
      expect(screen.getByText("2m ago")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("dashes the cost, kept and config of a real call rather than sampling it", async () => {
    await mounted();

    const row = (await screen.findByText("renewals-v2")).closest("tr");
    const cells = within(row as HTMLElement).getAllByRole("cell");
    // Cost, kept, config. Printing a sample cost against a real call would be
    // a lie about that call.
    expect(cells[5]).toHaveTextContent("-");
    expect(cells[6]).toHaveTextContent("-");
    expect(cells[7]).toHaveTextContent("-");
  });

  it("does not re-add the deleted 'what a dash means' footnote", async () => {
    await mounted();
    // That explainer lives once, in the top bar, and this page must not grow a
    // second copy of it.
    expect(screen.queryByText(/A dash, never \$0\.00/i)).toBeNull();
  });

  it("shows dashes, never zeros, when the rollup does not answer", async () => {
    api.getCallOverview.mockRejectedValue(new ApiError(404, "no route"));
    await mounted();

    // Both real cells say so: neither invents a zero out of a missing rollup.
    expect(await screen.findAllByText("rollup unavailable")).toHaveLength(2);
    expect(screen.queryByText("1,842")).toBeNull();
    expect(screen.getByText("No reports")).toBeInTheDocument();
  });
});

describe("Overview, the frame survives every state", () => {
  async function expectFullFrame() {
    expect(await screen.findByText("PROVIDER COST")).toBeInTheDocument();
    expect(screen.getByText("Billable minutes")).toBeInTheDocument();
    expect(screen.getByText("Running now")).toBeInTheDocument();
    expect(screen.getByText("Health")).toBeInTheDocument();
    expect(screen.getByText("Spend per day")).toBeInTheDocument();
    expect(screen.getByText("Recent calls")).toBeInTheDocument();
  }

  it("keeps the whole page when the call list is unreachable", async () => {
    api.listCalls.mockRejectedValue(new ApiError(0, "down"));
    api.getCallOverview.mockRejectedValue(new ApiError(0, "down"));
    await mounted();

    expect(
      await screen.findByText(/call log is not wired up/i),
    ).toBeInTheDocument();
    await expectFullFrame();
  });

  it("keeps the whole page when the backend refuses the account", async () => {
    api.listCalls.mockRejectedValue(new ApiError(403, "forbidden"));
    await mounted();

    expect(
      await screen.findByText(/refused this account/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Refused")).toBeInTheDocument();
    await expectFullFrame();
  });

  it("keeps an empty log a measured zero, and keeps the frame", async () => {
    api.listCalls.mockResolvedValue(callList({ calls: [], total: 0 }));
    await mounted();

    expect(await screen.findByText("No calls yet")).toBeInTheDocument();
    expect(screen.getByText(/this is a real zero/i)).toBeInTheDocument();
    await expectFullFrame();
  });
});
