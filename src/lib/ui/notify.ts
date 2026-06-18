import { notifications } from "@mantine/notifications";
import { MANTINE_COLOR, type SemanticColor } from "./colors";

// Thin wrapper that keeps the old addToast({ title, description, color }) call
// shape so partials don't need bespoke notification code.
export function notify(opts: {
  title: string;
  description?: string;
  color?: SemanticColor;
}) {
  notifications.show({
    title: opts.title,
    message: opts.description ?? "",
    color: MANTINE_COLOR[opts.color ?? "default"],
  });
}
