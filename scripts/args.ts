export function numberOption(value: string | boolean | undefined, fallback: number): number {
  if (typeof value !== 'string') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
