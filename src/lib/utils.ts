import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | null): string {
  if (!date) return '--';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatRelative(date: string | null): string {
  if (!date) return '--';
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return formatDate(date);
}

export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const now = new Date();
  const d = new Date(date);
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function lifecycleColor(stage: string): string {
  const colors: Record<string, string> = {
    raw: 'text-gray-400',
    enriched: 'text-blue-400',
    outreach: 'text-cyan-400',
    engaged: 'text-yellow-400',
    demo_completed: 'text-orange-400',
    negotiation: 'text-purple-400',
    won: 'text-green-400',
    lost: 'text-red-400',
    nurture: 'text-pink-400',
  };
  return colors[stage] || 'text-gray-400';
}

export function channelIcon(channel: string): string {
  const icons: Record<string, string> = {
    email: 'Mail',
    phone: 'Phone',
    linkedin: 'Linkedin',
    sms: 'MessageSquare',
    calendly: 'Calendar',
    fathom: 'Headphones',
    manual: 'ClipboardList',
  };
  return icons[channel] || 'Circle';
}

// Territory functions — now configurable per-org via org-config.
// Legacy exports kept for backward compatibility; callers should
// migrate to isInOrgTerritory / getStateFromOrgAreaCode from org-config.ts.

/** @deprecated Territory codes are now per-org. Use org-config.ts helpers. */
export const TERRITORY_AREA_CODES: Record<string, number[]> = {};
/** @deprecated Use getTerritoryAreaCodes from org-config.ts */
export const ALL_TERRITORY_CODES: number[] = [];

/**
 * Check if phone is in territory. Accepts optional area codes array.
 * With no codes, returns true (no territory = all contacts in territory).
 * @deprecated Use isInOrgTerritory from org-config.ts
 */
export function isInTerritory(phone: string | null, areaCodes?: number[]): boolean {
  if (!phone) return false;
  const codes = areaCodes || ALL_TERRITORY_CODES;
  if (codes.length === 0) return true;
  const cleaned = phone.replace(/\D/g, '');
  const areaCode = parseInt(cleaned.startsWith('1') ? cleaned.slice(1, 4) : cleaned.slice(0, 3));
  return codes.includes(areaCode);
}

/** @deprecated Use getStateFromOrgAreaCode from org-config.ts */
export function getStateFromAreaCode(areaCode: number, territoryMap?: Record<string, number[]>): string | null {
  const map = territoryMap || TERRITORY_AREA_CODES;
  for (const [state, codes] of Object.entries(map)) {
    if (codes.includes(areaCode)) return state;
  }
  return null;
}
