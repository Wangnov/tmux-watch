export const DEFAULT_CAPTURE_INTERVAL_SECONDS = 10;
export const DEFAULT_STABLE_COUNT = 6;

export type TimingCompatInput = {
  captureIntervalSeconds?: number;
  pollIntervalMs?: number;
  intervalMs?: number;
  stableCount?: number;
  stableSeconds?: number;
};

export type CanonicalTiming = {
  captureIntervalSeconds: number;
  stableCount: number;
};

type CanonicalTimingFallback = Partial<CanonicalTiming>;

function readFiniteNumber(raw: unknown): number | undefined {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

export function toIntervalMs(captureIntervalSeconds: number): number {
  return Math.max(200, Math.trunc(captureIntervalSeconds * 1000));
}

function toCanonicalCaptureIntervalSeconds(raw: number): number {
  return toIntervalMs(raw) / 1000;
}

function toCanonicalStableCount(raw: number): number {
  return Math.max(1, Math.trunc(raw));
}

export function normalizeTimingCompat(
  input: TimingCompatInput,
  fallback: CanonicalTimingFallback = {},
): CanonicalTiming {
  const directCaptureIntervalSeconds = readFiniteNumber(input.captureIntervalSeconds);
  const legacyIntervalMs = readFiniteNumber(input.intervalMs) ?? readFiniteNumber(input.pollIntervalMs);
  const fallbackCaptureIntervalSeconds = readFiniteNumber(fallback.captureIntervalSeconds);

  const captureIntervalSeconds =
    directCaptureIntervalSeconds !== undefined
      ? toCanonicalCaptureIntervalSeconds(directCaptureIntervalSeconds)
      : legacyIntervalMs !== undefined
        ? Math.max(200, Math.trunc(legacyIntervalMs)) / 1000
        : fallbackCaptureIntervalSeconds !== undefined
          ? toCanonicalCaptureIntervalSeconds(fallbackCaptureIntervalSeconds)
          : DEFAULT_CAPTURE_INTERVAL_SECONDS;

  const directStableCount = readFiniteNumber(input.stableCount);
  const stableSeconds = readFiniteNumber(input.stableSeconds);
  const fallbackStableCount = readFiniteNumber(fallback.stableCount);

  const stableCount =
    directStableCount !== undefined
      ? toCanonicalStableCount(directStableCount)
      : stableSeconds !== undefined
        ? Math.max(1, Math.ceil((stableSeconds * 1000) / toIntervalMs(captureIntervalSeconds)))
        : fallbackStableCount !== undefined
          ? toCanonicalStableCount(fallbackStableCount)
          : DEFAULT_STABLE_COUNT;

  return {
    captureIntervalSeconds,
    stableCount,
  };
}

export function normalizeTimingOverride(
  input: TimingCompatInput,
  fallback: CanonicalTimingFallback = {},
): Partial<CanonicalTiming> {
  const hasCaptureIntervalInput =
    readFiniteNumber(input.captureIntervalSeconds) !== undefined ||
    readFiniteNumber(input.intervalMs) !== undefined ||
    readFiniteNumber(input.pollIntervalMs) !== undefined;
  const hasStableInput =
    readFiniteNumber(input.stableCount) !== undefined ||
    readFiniteNumber(input.stableSeconds) !== undefined;

  if (!hasCaptureIntervalInput && !hasStableInput) {
    return {};
  }

  const normalized = normalizeTimingCompat(input, fallback);
  return {
    captureIntervalSeconds: hasCaptureIntervalInput
      ? normalized.captureIntervalSeconds
      : undefined,
    stableCount: hasStableInput ? normalized.stableCount : undefined,
  };
}
