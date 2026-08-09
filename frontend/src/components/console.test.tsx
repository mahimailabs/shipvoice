import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { Rail } from "./Rail";
import { TopBar, UPGRADE_URL } from "./AppShell";

function withRouter(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("Rail", () => {
  it("separates what this starter does from what Pro adds", () => {
    withRouter(<Rail />);
    ["Build", "ShipVoice Pro"].forEach((g) =>
      expect(screen.getByText(g)).toBeInTheDocument(),
    );
  });

  it("marks every Pro surface, Calls included", () => {
    // Calls is Pro here. This repo records nothing about a call once it ends,
    // so a Calls page could only be an empty table pretending to be a feature.
    withRouter(<Rail />);
    expect(screen.getAllByTestId("nav-pro")).toHaveLength(5);
    expect(screen.getByText("Calls")).toBeInTheDocument();
  });

  it("does not make the Pro items clickable", () => {
    // There is nothing behind them in this repo. A link would lead to a page
    // whose only purpose is to sell, which is what the single Upgrade button
    // in the topbar is for.
    const { container } = withRouter(<Rail />);
    const links = Array.from(container.querySelectorAll("a")).map(
      (a) => a.textContent ?? "",
    );
    ["Calls", "Campaigns", "Channels", "Customers", "Evaluations"].forEach((label) => {
      expect(links.some((text) => text.includes(label))).toBe(false);
    });
  });

  it("keeps the free surfaces navigable", () => {
    const { container } = withRouter(<Rail />);
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toEqual(expect.arrayContaining(["/", "/deployment"]));
  });

  it("links to nothing this backend cannot serve", () => {
    // The console used to land on an Overview that called /api/v1/calls and
    // took three 404s on the first screen. Nothing may link there again.
    const { container } = withRouter(<Rail />);
    const hrefs = Array.from(container.querySelectorAll("a")).map(
      (a) => a.getAttribute("href") ?? "",
    );
    expect(hrefs.some((h) => h.startsWith("/calls"))).toBe(false);
  });

  it("uses the real ShipVoice mark", () => {
    const { container } = withRouter(<Rail />);
    expect(container.querySelector('img[src="/logo-boat.svg"]')).not.toBeNull();
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
