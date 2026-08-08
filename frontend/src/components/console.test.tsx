import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { Rail } from "./Rail";
import { TopBar, UPGRADE_URL } from "./AppShell";

function withRouter(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("Rail", () => {
  it("renders the three groups", () => {
    withRouter(<Rail />);
    ["Watch", "Run", "Build"].forEach((g) => expect(screen.getByText(g)).toBeInTheDocument());
  });

  it("marks exactly four items as ShipVoice Pro", () => {
    withRouter(<Rail />);
    expect(screen.getAllByTestId("nav-pro")).toHaveLength(4);
  });

  it("does not make the Pro items clickable", () => {
    // There is nothing behind them in this repo. A link would lead to a page
    // whose only purpose is to sell, which is what the single Upgrade button
    // in the topbar is for.
    const { container } = withRouter(<Rail />);
    const links = Array.from(container.querySelectorAll("a")).map((a) => a.textContent ?? "");
    ["Campaigns", "Channels", "Customers", "Evaluations"].forEach((label) => {
      expect(links.some((text) => text.includes(label))).toBe(false);
    });
  });

  it("keeps the free surfaces navigable", () => {
    const { container } = withRouter(<Rail />);
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/", "/calls", "/agents", "/settings"]));
  });

  it("uses the real ShipVoice mark", () => {
    const { container } = withRouter(<Rail />);
    expect(container.querySelector('img[src="/logo-boat.svg"]')).not.toBeNull();
  });
});

describe("TopBar", () => {
  it("puts one Upgrade button on the page, pointing at the booking link", () => {
    withRouter(<TopBar title="Overview" />);
    const upgrade = screen.getByRole("link", { name: /upgrade/i });
    expect(upgrade).toHaveAttribute("href", UPGRADE_URL);
    expect(UPGRADE_URL).toBe("https://cal.com/mahimairaja/shipvoice");
  });

  it("opens the booking link safely in a new tab", () => {
    withRouter(<TopBar title="Overview" />);
    const upgrade = screen.getByRole("link", { name: /upgrade/i });
    expect(upgrade).toHaveAttribute("target", "_blank");
    expect(upgrade.getAttribute("rel") ?? "").toContain("noopener");
  });

  it("still renders the page's own actions beside it", () => {
    withRouter(<TopBar title="Calls" actions={<button type="button">Export</button>} />);
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /upgrade/i })).toBeInTheDocument();
  });
});
