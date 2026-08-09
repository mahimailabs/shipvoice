import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { TopBar } from "./AppShell";

/**
 * The dash explainer used to be a footnote repeated under every table. It is one
 * control in the top bar now, so these are the tests that keep it reachable:
 * nothing else on any page says what a dash means.
 */
describe("TopBar dash help", () => {
  function mount() {
    render(
      <MemoryRouter>
        <TopBar title="Calls" />
      </MemoryRouter>,
    );
  }

  it("offers one explainer, labelled for screen readers", () => {
    mount();
    const button = screen.getByRole("button", { name: "What a dash means" });
    expect(button).toBeInTheDocument();
  });

  it("names the tooltip as the button's description", () => {
    mount();
    const button = screen.getByRole("button", { name: "What a dash means" });
    const describedBy = button.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();

    const tip = document.getElementById(describedBy as string);
    expect(tip).toHaveAttribute("role", "tooltip");
    expect(tip).toHaveTextContent(/a dash means unmeasured, never zero/i);
  });

  it("keeps the tooltip in the accessibility tree while it is off screen", () => {
    mount();
    // Hidden with opacity and visibility, never 'display: none'. A tooltip
    // removed from the tree cannot be resolved by aria-describedby, which is
    // the only way a screen reader ever reaches this text.
    const tip = screen.getByRole("tooltip", { hidden: true });
    expect(tip).toBeInTheDocument();
  });
});
