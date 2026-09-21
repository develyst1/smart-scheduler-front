import { createElement as h } from "react";
import { notifications } from "@mantine/notifications";
import { MANTINE_COLOR, type SemanticColor } from "./colors";

// Thin wrapper that keeps the old addToast({ title, description, color }) call
// shape so partials don't need bespoke notification code.
export function notify(opts: {
  title: string;
  description?: string;
  color?: SemanticColor;
  /** TASK-429 — an optional link under the message (e.g. the Manage-plan page after a series is created). */
  link?: { href: string; label: string };
}) {
  notifications.show({
    title: opts.title,
    // a `.ts` file: the link is built with createElement, not JSX
    message: opts.link
      ? h("span", null, opts.description ? h("span", null, `${opts.description} `) : null, h("a", { href: opts.link.href, className: "underline decoration-dotted underline-offset-2" }, opts.link.label))
      : (opts.description ?? ""),
    color: MANTINE_COLOR[opts.color ?? "default"],
    autoClose: opts.link ? 8000 : undefined,
  });
}
