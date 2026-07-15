// Badge colour keys are Mantine palette names (blue, cyan, …). Mantine components
// accept the key directly (e.g. <Badge color="blue">); for a raw swatch we resolve
// the key to a CSS variable.

export const badgeColorVar = (color: string): string => `var(--mantine-color-${color}-6)`;
export const badgeColorSoftVar = (color: string): string => `var(--mantine-color-${color}-1)`;
