export const short = (value: string) =>
  `${value.slice(0, 6)}…${value.slice(-4)}`;

/** Compact display only: an ellipsis marks omitted digits; the original stays available. */
export function compactAmount(value: string) {
  if (!/^-?\d+(\.\d+)?$/.test(value)) return value;
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  const integer = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (!trimmed) return integer;
  const first = trimmed.search(/[1-9]/);
  const digits = whole.replace("-", "") === "0" ? Math.max(6, first + 3) : 6;
  return `${integer}.${trimmed.slice(0, digits)}${trimmed.length > digits ? "…" : ""}`;
}
