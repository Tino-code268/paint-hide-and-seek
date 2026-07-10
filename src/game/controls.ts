export type ControlScheme = "pc" | "mobile";

const KEY = "mecha:control-scheme";

export function getControlScheme(): ControlScheme {
  if (typeof window === "undefined") return "pc";
  const saved = localStorage.getItem(KEY);
  if (saved === "pc" || saved === "mobile") return saved;
  return window.matchMedia?.("(pointer: coarse)").matches ? "mobile" : "pc";
}

export function setControlScheme(s: ControlScheme) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, s);
}
