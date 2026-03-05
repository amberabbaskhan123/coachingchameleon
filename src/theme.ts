export type AppTheme = "dark" | "light";

export function normalizeTheme(value: unknown): AppTheme {
  return value === "light" ? "light" : "dark";
}

export function toggleTheme(theme: AppTheme): AppTheme {
  return theme === "dark" ? "light" : "dark";
}
