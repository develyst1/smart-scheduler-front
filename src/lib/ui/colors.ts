// Bridge between the app's semantic color names (kept from the domain layer)
// and Mantine's theme palette. Tailwind utility classes use the same semantic
// names via tailwind.config.ts; this map is only for Mantine component props.

export type SemanticColor =
  | "default"
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "danger";

export const MANTINE_COLOR: Record<SemanticColor, string> = {
  default: "gray",
  primary: "blue",
  secondary: "grape",
  success: "green",
  warning: "orange",
  danger: "red",
};
