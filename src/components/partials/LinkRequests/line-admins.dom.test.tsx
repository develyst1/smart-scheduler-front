import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createElement as h } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";

/**
 * 🔑 TASK-539 — **the clicked proof for the one control that takes admin rights away.**
 *
 * This is exactly the shape TASK-532 built the harness for: a person presses something, and what follows is hard to take
 * back (an admin who should not see other families' children keeps seeing them, or an admin who should stays cut off).
 * *"The component renders"* is not *"the button works"* — D4 proved that — so the panel is mounted with the REAL
 * react-query hooks over a faked fetch boundary, and every assertion below is about a real click.
 *
 * 🚫 What this file deliberately does NOT do: check copy wording, layout or the label table. Those are pinned in
 * `line-admins.test.ts`, which runs in milliseconds.
 */

/** The fetch boundary: what the panel actually asks the server, in order. */
const gets: string[] = [];
const deletes: string[] = [];
let refuseWith: Error | null = null;
let menuSettled = true;
class FakeApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

const ADMINS = {
  admins: [
    { ref: "a1b2c3d4e5f60718", idTail: "…8f21", alsoTeacher: "บีม", alsoParent: null, afterRemoval: "teacher-menu" },
    { ref: "0f1e2d3c4b5a6978", idTail: "…4c7d", alsoTeacher: null, alsoParent: null, afterRemoval: "visitor-menu" },
  ],
  notKnown: ["the display name — never stored", "when it was linked — not recorded", "how it was linked — indistinguishable"],
};

// 📌 Spread the real module: `mock.module` is global to the test PROCESS (TASK-532's scar).
const realClient = await import("@/lib/api/client");
mock.module("@/lib/api/client", () => ({
  ...realClient,
  useMockData: false,
  api: {
    ...realClient.api,
    get: async (url: string) => {
      gets.push(url);
      return { data: ADMINS };
    },
    delete: async (url: string) => {
      deletes.push(url);
      if (refuseWith) throw refuseWith;
      return { data: { removed: { ref: "x", idTail: "…4c7d" }, afterRemoval: "visitor-menu", menuSettled } };
    },
  },
  ApiClientError: FakeApiError,
}));

let superAdmin = true;
const realAuth = await import("next-auth/react");
mock.module("next-auth/react", () => ({
  ...realAuth,
  useSession: () => ({ data: { user: { isSuperAdmin: superAdmin } }, status: "authenticated" }),
}));

/** The notification is where the outcome is SAID, so it is recorded rather than painted (no Notifications provider here). */
const notes: Array<{ title: string; description?: string; color?: string }> = [];
const realNotify = await import("@/lib/ui/notify");
mock.module("@/lib/ui/notify", () => ({ ...realNotify, notify: (o: { title: string; description?: string; color?: string }) => notes.push(o) }));

const LineAdminsPanel = (await import("./LineAdminsPanel")).default;

/**
 * 📌 Asserted as booleans, never as elements: a failed `toBeNull()` on a happy-dom node prints the entire React
 * fiber tree, which turned one red assertion in this file into an eight-minute run before I noticed.
 *
 * 🔑 And the probe for "the dialog is open" is its BODY, not its title: Mantine keeps the modal shell (and its title)
 * mounted through a close transition that happy-dom never finishes, so a title-based check can never see a close.
 * The body is inside `{target && …}`, so it tracks the actual state the confirm button reads.
 */
const dialogOpen = () => document.querySelectorAll("[data-line-admin-confirm]").length > 0 && screen.queryAllByText("It keeps no special access.").length > 0;

const mount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    h(QueryClientProvider, { client: qc }, h(MantineProvider, null, h(I18nProvider, null, h(LineAdminsPanel, null)))) as never,
  );
};

// 📌 Bun has no auto-cleanup hook: without this every render LEAKS into the next test, and a count of rows or a
// "the dialog is gone" check then reads the previous test's DOM. It cost me a confusing red run to notice.
afterEach(cleanup);

beforeEach(() => {
  gets.length = 0;
  deletes.length = 0;
  notes.length = 0;
  refuseWith = null;
  menuSettled = true;
  superAdmin = true;
});

describe("🔑 TASK-539 — removing admin rights, actually clicked", () => {
  it("Remove ⇒ the dialog appears ⇒ confirm ⇒ `DELETE /users/line-admins/<ref>` goes, once", async () => {
    const user = userEvent.setup();
    mount();

    // the rows arrive, and the row we CANNOT name says so rather than showing a blank that reads as a name
    expect(await screen.findByText("Also the coach บีม")).toBeTruthy();
    expect(screen.getByText("Unknown account")).toBeTruthy();

    const buttons = document.querySelectorAll("[data-line-admin-remove]");
    expect(buttons.length).toBe(2);
    // nothing has been asked of the server beyond the list
    expect(deletes).toEqual([]);

    await user.click(buttons[1] as HTMLElement); // the unnameable row
    // 🔴 the dialog exists after the click (the D4 failure mode), and STILL nothing has been sent
    expect(await screen.findByText("Remove admin rights from this account?")).toBeTruthy();
    expect(dialogOpen()).toBe(true);
    expect(deletes).toEqual([]);

    await user.click(document.querySelector("[data-line-admin-confirm]") as HTMLElement);
    await waitFor(() => expect(deletes.length).toBe(1));
    expect(deletes).toEqual(["/users/line-admins/0f1e2d3c4b5a6978"]);
    // and the outcome is SAID once, as a success
    await waitFor(() => expect(notes.length).toBe(1));
    expect(notes[0]).toEqual({ title: "Admin rights removed", color: "success" });
  });

  it("the dialog names what the account KEEPS, per row, and never says deleted", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText("Also the coach บีม");

    // the coach row: the dialog must not suggest the coach loses his app
    await user.click(document.querySelectorAll("[data-line-admin-remove]")[0] as HTMLElement);
    expect(await screen.findByText("It keeps its coach access.")).toBeTruthy();
    const dialog = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dialog.textContent).toContain("not deleted");
    expect(dialog.textContent).not.toContain("Delete");
  });

  it("🔴 a REFUSED removal: the server's sentence shows, the dialog stays, and the ROW is still there", async () => {
    refuseWith = new FakeApiError("ไม่พบบัญชี LINE แอดมินนี้", "NOT_FOUND");
    const user = userEvent.setup();
    mount();
    await screen.findByText("Unknown account");

    await user.click(document.querySelectorAll("[data-line-admin-remove]")[1] as HTMLElement);
    await user.click(document.querySelector("[data-line-admin-confirm]") as HTMLElement);

    expect(await screen.findByText("ไม่พบบัญชี LINE แอดมินนี้")).toBeTruthy();
    // the dialog did not close, no success was claimed, and the row was never optimistically taken away
    expect(dialogOpen()).toBe(true);
    expect(notes).toEqual([]); // 🔑 not one word of success for an act that did not happen
    expect(document.querySelectorAll("[data-line-admin-remove]").length).toBe(2);
    expect(deletes.length).toBe(1);
  });

  it("a menu LINE would not accept: still removed, and the page SAYS the menu did not settle", async () => {
    menuSettled = false;
    const user = userEvent.setup();
    mount();
    await screen.findByText("Unknown account");

    await user.click(document.querySelectorAll("[data-line-admin-remove]")[1] as HTMLElement);
    await user.click(document.querySelector("[data-line-admin-confirm]") as HTMLElement);

    await waitFor(() => expect(deletes.length).toBe(1));
    // the dialog closes (it DID work) — and the half that did not is not swallowed
    await waitFor(() => expect(dialogOpen()).toBe(false));
    expect(notes.length).toBe(1);
    expect(notes[0].title).toBe("Admin rights removed");
    expect(notes[0].description).toContain("would not accept the menu change");
    expect(notes[0].color).toBe("warning");
  });

  it("🔑 NOT a super admin: no panel, no button, and the list is never even fetched", async () => {
    superAdmin = false;
    mount();
    await waitFor(() => expect(document.querySelectorAll("[data-line-admins-panel]").length).toBe(0));
    expect(document.querySelectorAll("[data-line-admin-remove]").length).toBe(0);
    expect(gets).toEqual([]);
  });
});
