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

// Territory area codes for WA, NV, ID, MT, AK
export const TERRITORY_AREA_CODES: Record<string, number[]> = {
  WA: [206, 253, 360, 425, 509, 564],
  NV: [702, 725, 775],
  ID: [208, 986],
  MT: [406],
  AK: [907],
};

export const ALL_TERRITORY_CODES = Object.values(TERRITORY_AREA_CODES).flat();

export function isInTerritory(phone: string | null): boolean {
  if (!phone) return false;
  const cleaned = phone.replace(/\D/g, '');
  const areaCode = parseInt(cleaned.startsWith('1') ? cleaned.slice(1, 4) : cleaned.slice(0, 3));
  return ALL_TERRITORY_CODES.includes(areaCode);
}

export function getStateFromAreaCode(areaCode: number): string | null {
  for (const [state, codes] of Object.entries(TERRITORY_AREA_CODES)) {
    if (codes.includes(areaCode)) return state;
  }
  return null;
}
