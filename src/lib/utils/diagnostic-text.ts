/** Safe string formatting for table cells and diagnostics — never throws on bad input. */

export function formatDiagnosticText(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => formatDiagnosticText(item)).filter(Boolean).join(" · ");
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "—";
    }
  }
  return String(value);
}

export function formatLabelList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => formatDiagnosticText(item)).filter(Boolean);
  }
  if (value == null) return [];
  const text = formatDiagnosticText(value);
  return text === "—" ? [] : [text];
}
