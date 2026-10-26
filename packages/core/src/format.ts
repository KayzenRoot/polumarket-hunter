const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatUsd(value: number): string {
  return Number.isFinite(value) ? usd.format(value) : '—';
}

export function formatSignedUsd(value: number): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  const formatted = usd.format(Math.abs(value));
  return value > 0 ? `+${formatted}` : value < 0 ? `-${formatted}` : formatted;
}

export function formatCompactUsd(value: number): string {
  return Number.isFinite(value) ? usdCompact.format(value) : '—';
}

export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return value.toFixed(3);
}

export function formatPct(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatSignedPct(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  const formatted = `${(Math.abs(value) * 100).toFixed(decimals)}%`;
  return value > 0 ? `+${formatted}` : value < 0 ? `-${formatted}` : formatted;
}

export function formatNumber(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatTime(timestamp: number | null): string {
  if (timestamp === null || !Number.isFinite(timestamp)) {
    return '—';
  }
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}

export function formatDateTime(timestamp: number | null): string {
  if (timestamp === null || !Number.isFinite(timestamp)) {
    return '—';
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return '—';
  }
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}

export function shortToken(tokenId: string): string {
  if (tokenId.length <= 12) {
    return tokenId;
  }
  return `${tokenId.slice(0, 6)}…${tokenId.slice(-4)}`;
}

export function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ');
}
