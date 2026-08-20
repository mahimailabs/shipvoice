import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { Rail } from "./Rail";
import { TopBar, UPGRADE_URL } from "./AppShell";

function withRouter(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("Rail", () => {
  it("lists the three pages this repo serves", () => {
    withRouter(<Rail />);
    ["Overview", "Calls", "Agents"].forEach((label) =>
      expect(screen.getByText(label)).toBeInTheDocument(),
    );
  });

  it("carries no entry for a module the free repo does not have", () => {
    // A boilerplate does not grey out a door it never built. There is no
    // campaigns module here, so there is no Campaigns entry to disable.
    withRouter(<Rail />);
    ["Campaigns", "Channels", "Customers", "Evaluations"].forEach((label) =>
      expect(screen.queryByText(label)).toBeNull(),
    );
  });

  it("makes every entry a link, and nothing else", () => {
    const { container } = withRouter(<Rail />);
    expect(container.querySelector("[aria-disabled]")).toBeNull();
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    // Exact, not arrayContaining: this list is the whole rail, and a new entry
    // has to be a page before it can be a link.
    expect(hrefs).toEqual(["/", "/calls", "/agents", "/deployment"]);
  });

  it("uses the real ShipVoice mark, resolved against the bundle's base", () => {
    // Against BASE_URL rather than the literal "/logo-boat.svg": a build with a
    // base, which is what the /demo preview is, serves it from under that base
    // and a bare absolute path 404s there.
    const { container } = withRouter(<Rail />);
    const mark = container.querySelector<HTMLImageElement>("img");
    expect(mark).not.toBeNull();
    expect(mark?.getAttribute("src")).toBe(
      `${import.meta.env.BASE_URL}logo-boat.svg`,
    );
  });
});

describe("TopBar", () => {
  it("puts one Upgrade button on the page, pointing at the booking link", () => {
    withRouter(<TopBar title="Agents" />);
    const upgrade = screen.getByRole("link", { name: /upgrade/i });
    expect(upgrade).toHaveAttribute("href", UPGRADE_URL);
    expect(UPGRADE_URL).toBe("https://cal.com/mahimairaja/shipvoice");
  });

  it("opens the booking link safely in a new tab", () => {
    withRouter(<TopBar title="Agents" />);
    const upgrade = screen.getByRole("link", { name: /upgrade/i });
    expect(upgrade).toHaveAttribute("target", "_blank");
    expect(upgrade.getAttribute("rel") ?? "").toContain("noopener");
  });

  it("still renders the page's own actions beside it", () => {
    withRouter(
      <TopBar title="Calls" actions={<button type="button">Export</button>} />,
    );
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /upgrade/i })).toBeInTheDocument();
  });
});
