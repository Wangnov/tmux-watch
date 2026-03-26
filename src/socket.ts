export function normalizeTmuxSocket(raw: unknown): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  const comma = trimmed.indexOf(",");
  if (comma > 0) {
    return trimmed.slice(0, comma);
  }
  return trimmed;
}
