// These four routes are the only place in the console where a public, free repo
// talks about the paid product at length, so the copy is policed by test rather
// than by care. Two rules:
//
//   1. Nothing on the banned list reaches the DOM. This repo is public and
//      advertises a paid product, so carrier names, unshipped feature names and
//      any claim of a template count stay out.
//   2. Nothing sells these four as purchasable. Pro has designed them and not
//      built them, so "unlock" or "buy to access" would be a lie, and a buyer
//      who catches one overclaim stops believing the locks that are real.
import type { ComponentType } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, test } from "vitest";
import { Campaigns } from "./Campaigns";
import { Channels } from "./Channels";
import { Customers } from "./Customers";
import { Evaluations } from "./Evaluations";

const BANNED = /\bBYO\b|0%|\bEVA\b|verify-before-speak|recordings?\b|\bTwilio\b|\bTelnyx\b|\d+\s*templates?/i;
const PAYWALL = /unlock|upgrade to (get|use) this|buy .* to access/i;

const PAGES = [
  ["Campaigns", Campaigns],
  ["Channels", Channels],
  ["Customers", Customers],
  ["Evaluations", Evaluations],
] as const;

function renderPage(Page: ComponentType): HTMLElement {
  const { container } = render(
    <MemoryRouter>
      <Page />
    </MemoryRouter>,
  );
  return container;
}

for (const [name, Page] of PAGES) {
  test(`${name} says nothing on the banned list`, () => {
    expect(renderPage(Page).textContent ?? "").not.toMatch(BANNED);
  });

  // Defensive: a grep over the source cannot read a PNG. If anyone ever adds a
  // screenshot here, its alt text is still policed by the same list.
  test(`${name} keeps banned words out of every image alt`, () => {
    // Array.from, not for..of: this tsconfig's lib has DOM without DOM.Iterable.
    for (const img of Array.from(renderPage(Page).querySelectorAll("img"))) {
      expect(img.getAttribute("alt") ?? "").not.toMatch(BANNED);
    }
  });

  test(`${name} does not sell itself as purchasable`, () => {
    expect(renderPage(Page).textContent ?? "").not.toMatch(PAYWALL);
  });
}
