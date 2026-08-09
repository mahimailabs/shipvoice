import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { PromptDialog } from "./PromptDialog";
import type { AgentPromptRead } from "../types";

const api = vi.hoisted(() => ({
  getAgentPrompt: vi.fn(),
  putAgentPrompt: vi.fn(),
}));

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    getAgentPrompt: api.getAgentPrompt,
    putAgentPrompt: api.putAgentPrompt,
  };
});

const PATH = "agent/prompts/instructions.md";

function fileOnDisk(over: Partial<AgentPromptRead> = {}): AgentPromptRead {
  return {
    slug: "assistant",
    path: PATH,
    content: "You are {agent_name}, answering the phone.\n",
    exists: true,
    editable: true,
    read_only_reason: null,
    byte_size: 42,
    max_bytes: 100000,
    warnings: [],
    ...over,
  };
}

function open(onClose = vi.fn()) {
  render(<PromptDialog slug="assistant" path={PATH} onClose={onClose} />);
  return onClose;
}

/** The textarea, once the fetch has filled it. */
async function editor(): Promise<HTMLTextAreaElement> {
  const area = screen.getByRole("textbox", { name: "System prompt" });
  await waitFor(() => expect(area).not.toHaveValue(""));
  return area as HTMLTextAreaElement;
}

beforeEach(() => {
  api.getAgentPrompt.mockReset();
  api.putAgentPrompt.mockReset();
  api.getAgentPrompt.mockResolvedValue(fileOnDisk());
});

describe("PromptDialog", () => {
  it("opens as a modal on the prompt file, with the textarea focused", async () => {
    open();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // The title is the path, and the dialog is labelled by it.
    const titleId = dialog.getAttribute("aria-labelledby");
    expect(titleId).toBeTruthy();
    expect(document.getElementById(titleId as string)).toHaveTextContent(PATH);

    const area = await editor();
    expect(area).toHaveValue("You are {agent_name}, answering the phone.\n");
    // Focus lands on the textarea immediately, not after the fetch.
    expect(area).toHaveFocus();
  });

  it("keeps text typed while a save is in flight, and does not claim it saved", async () => {
    // The textarea stays live during the PUT, and people keep typing while a
    // spinner runs. Adopting the response as the new value here would wipe those
    // keystrokes with no undo entry (React assigns node.value directly) and then
    // render the green "written to disk" banner over text that never left the
    // browser.
    let settle: (v: AgentPromptRead) => void = () => {};
    api.putAgentPrompt.mockReturnValue(
      new Promise<AgentPromptRead>((resolve) => {
        settle = resolve;
      }),
    );

    open();
    const area = await editor();
    fireEvent.change(area, { target: { value: "First version." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // Typed after Save was pressed, while the request is still open.
    fireEvent.change(area, { target: { value: "First version, plus more." } });
    settle(fileOnDisk({ content: "First version.\n" }));

    await waitFor(() =>
      expect(api.putAgentPrompt).toHaveBeenCalledWith("assistant", "First version."),
    );
    expect(area).toHaveValue("First version, plus more.");
    expect(screen.queryByText(/next call picks it up/i)).toBeNull();
  });

  it("locks the page scroller, which is .bd and not the body", async () => {
    // AppShell's frame is 'height: 100vh; overflow: hidden', so .bd is what
    // scrolls. Asserting document.body here passed while the page kept moving
    // behind the dialog, which is the whole reason this test names .bd.
    const bd = document.createElement("div");
    bd.className = "bd";
    document.body.append(bd);

    const { unmount } = render(
      <PromptDialog slug="assistant" path={PATH} onClose={() => {}} />,
    );
    await editor();
    expect(bd.style.overflow).toBe("hidden");

    unmount();
    expect(bd.style.overflow).toBe("");
    bd.remove();
  });

  it("closes on Escape and on a click outside while pristine", async () => {
    const onClose = open();
    await editor();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.mouseDown(document.querySelector(".dlg-scrim") as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("asks before throwing away an unsaved edit, and never uses window.confirm", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const onClose = open();
    const area = await editor();

    fireEvent.change(area, { target: { value: "Rewritten." } });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();

    // A click outside is guarded the same way.
    fireEvent.mouseDown(document.querySelector(".dlg-scrim") as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();

    // Keep editing puts the confirm away and leaves the edit alone.
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByText(/unsaved changes/i)).toBeNull();
    expect(area).toHaveValue("Rewritten.");

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Discard and close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });

  it("saves on Cmd+Enter and says the next call picks it up", async () => {
    api.putAgentPrompt.mockResolvedValue(
      fileOnDisk({ content: "Rewritten.\n", byte_size: 11 }),
    );
    open();
    const area = await editor();

    fireEvent.change(area, { target: { value: "Rewritten." } });
    fireEvent.keyDown(document, { key: "Enter", metaKey: true });

    await waitFor(() =>
      expect(api.putAgentPrompt).toHaveBeenCalledWith("assistant", "Rewritten."),
    );
    expect(await screen.findByText(/next call picks it up/i)).toBeInTheDocument();
    expect(screen.getByText(/does not need a restart/i)).toBeInTheDocument();
    // The response is the new baseline, so the dialog is pristine again.
    expect(area).toHaveValue("Rewritten.\n");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("shows the backend's own sentence when a save is refused", async () => {
    // The 409 names the resolved path and the mount, which is the only thing
    // that tells anyone why the write failed. It has to reach the screen.
    api.putAgentPrompt.mockRejectedValue(
      new ApiError(
        409,
        "Could not write /app/prompts/instructions.md. The backend needs ./agent/prompts mounted read-write.",
      ),
    );
    open();
    const area = await editor();

    fireEvent.change(area, { target: { value: "Rewritten." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/mounted read-write/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "/app/prompts/instructions.md",
    );
    // The edit is still there to retry, not thrown away.
    expect(area).toHaveValue("Rewritten.");
  });

  it("hides Save and gives the reason when the file is read only", async () => {
    api.getAgentPrompt.mockResolvedValue(
      fileOnDisk({
        editable: false,
        read_only_reason:
          "CONSOLE_WRITES_ENABLED is false, so this backend refuses prompt writes.",
      }),
    );
    open();
    const area = await editor();

    expect(area).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(
      screen.getByText(/CONSOLE_WRITES_ENABLED is false/),
    ).toBeInTheDocument();
    // No false promise of a keyboard save either.
    expect(screen.queryByText(/Cmd\+Enter/)).toBeNull();
  });

  it("says the file is missing and offers to write the first one", async () => {
    api.getAgentPrompt.mockResolvedValue(
      fileOnDisk({ content: "", exists: false, byte_size: 0 }),
    );
    open();

    expect(await screen.findByText(/does not exist yet/)).toBeInTheDocument();
    expect(screen.getByText(/default prompt packaged with it/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("passes the backend's non-blocking warnings through without blocking", async () => {
    api.getAgentPrompt.mockResolvedValue(
      fileOnDisk({
        content: "Answer the phone.\n",
        warnings: ["No {agent_name} placeholder, so the agent's name will not appear."],
      }),
    );
    open();
    const area = await editor();

    expect(await screen.findByText(/placeholder/)).toBeInTheDocument();
    fireEvent.change(area, { target: { value: "Answer the phone. Politely." } });
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("keeps Tab inside the dialog", async () => {
    open();
    const area = await editor();
    const dialog = screen.getByRole("dialog");
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>("button, textarea"),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();

    // Focus that has escaped the dialog comes back to it. Dispatched on the
    // document, not on the dialog: that is where the keydown actually lands
    // once focus has fallen to body, and a handler bound to the dialog's own
    // onKeyDown would never see it. Targeting the dialog here passed while Tab
    // walked into the rail behind the scrim.
    area.blur();
    document.body.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();
  });
});
