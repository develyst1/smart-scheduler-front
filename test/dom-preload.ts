/**
 * TASK-532 — the DOM harness, in ONE place.
 *
 * 🔑 Why it exists: TASK-531 set the rule **a control is proven by clicking it**, and this repo had no DOM, so the Undo
 * control could ship twice unusable with a green suite both times. `happy-dom` + `@testing-library/react` make a real
 * click, a real React render and a real Mantine paint available to `bun test`.
 *
 * 🚫 **This is not a licence to render everything.** Reach for a `.dom.test.tsx` only for a CONTROL — something a person
 * presses that then does something irreversible or expensive (it moves money, it messages a family, it cannot be undone).
 * Labels, layout, copy counts and pure rules stay where they are: the other 631 tests are right as they are, and a
 * browser-ish test that asserts text is centred is slow, brittle, and deleted within a month — taking the rule with it.
 *
 * 📌 Loaded by `bunfig.toml` (`[test] preload`) so every file gets the same globals with no per-file boilerplate.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Guard: preload runs once per test process, but a re-registration would wipe an existing document mid-run.
if (!(globalThis as { document?: unknown }).document) {
  GlobalRegistrator.register({ url: "http://localhost/" });
}

// Mantine reads both of these during render; happy-dom has no CSS engine, so they are stubbed to the shape it expects.
if (typeof globalThis.matchMedia !== "function") {
  globalThis.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof globalThis.matchMedia;
}
// Mantine's autosizing textarea listens for font loading; happy-dom ships no FontFaceSet, so a quiet one is enough.
if (!(document as unknown as { fonts?: unknown }).fonts) {
  (document as unknown as { fonts: unknown }).fonts = { addEventListener: () => {}, removeEventListener: () => {}, ready: Promise.resolve(), status: "loaded" };
}
if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver !== "function") {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
