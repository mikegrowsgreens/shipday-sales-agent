/**
 * Brain Query Cache (Session 10)
 * LRU in-memory cache for brain content, call patterns, and live stats.
 * Reduces database load on high-traffic chatbot/voice endpoints.
 */

import { LRUCache } from 'lru-cache';

// ─── Cache Configuration ────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const STATS_TTL_MS = 2 * 60 * 1000;   // 2 minutes for live stats
const ROI_TTL_MS = 15 * 60 * 1000;    // 15 minutes for pre-computed ROI

// ─── Brain Content Cache ────────────────────────────────────────────────────

const brainContentCache = new LRUCache<string, CacheEntry<Array<Record<string, unknown>>>>({
  max: 50,
  ttl: DEFAULT_TTL_MS,
});

export function getCachedBrainContent(orgId: number): Array<Record<string, unknown>> | null {
  const entry = brainContentCache.get(`brain_${orgId}`);
  if (!entry) return null;
  return entry.data;
}

export function setCachedBrainContent(orgId: number, data: Array<Record<string, unknown>>): void {
  brainContentCache.set(`brain_${orgId}`, { data, fetchedAt: Date.now() });
}

// ─── Call Patterns Cache ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const callPatternsCache = new LRUCache<string, CacheEntry<any[]>>({
  max: 50,
  ttl: DEFAULT_TTL_MS,
});

export function getCachedCallPatterns<T = Record<string, unknown>>(orgId: number): T[] | null {
  const entry = callPatternsCache.get(`patterns_${orgId}`);
  if (!entry) return null;
  return entry.data as T[];
}

export function setCachedCallPatterns(orgId: number, data: unknown[]): void {
  callPatternsCache.set(`patterns_${orgId}`, { data, fetchedAt: Date.now() });
}

// ─── Live Stats Cache ───────────────────────────────────────────────────────

interface LiveStats {
  dealStats?: { win_rate: number; avg_mrr: number; won: number };
  topPhrases?: Array<{ phrase: string; win_rate_lift: number; category: string }>;
}

const liveStatsCache = new LRUCache<string, CacheEntry<LiveStats>>({
  max: 50,
  ttl: STATS_TTL_MS,
});

export function getCachedLiveStats(orgId: number): LiveStats | null {
  const entry = liveStatsCache.get(`stats_${orgId}`);
  if (!entry) return null;
  return entry.data;
}

export function setCachedLiveStats(orgId: number, data: LiveStats): void {
  liveStatsCache.set(`stats_${orgId}`, { data, fetchedAt: Date.now() });
}

// ─── Social Proof Cache ─────────────────────────────────────────────────────

interface SocialProofStats {
  totalCustomers: number;
  avgSavings: number;
  recentWins: number;
  topIndustry: string;
  topSavingsStory?: { company_type: string; monthly_savings: number };
}

const socialProofCache = new LRUCache<string, CacheEntry<SocialProofStats>>({
  max: 50,
  ttl: STATS_TTL_MS,
});

export function getCachedSocialProof(orgId: number): SocialProofStats | null {
  const entry = socialProofCache.get(`proof_${orgId}`);
  if (!entry) return null;
  return entry.data;
}

export function setCachedSocialProof(orgId: number, data: SocialProofStats): void {
  socialProofCache.set(`proof_${orgId}`, { data, fetchedAt: Date.now() });
}

// ─── Pre-Generated ROI Cache ────────────────────────────────────────────────
// Caches ROI for common order volume / AOV / commission combos

interface ROICacheKey {
  ordersPerWeek: number;
  aov: number;
  commissionRate: number;
}

function buildROICacheKey(k: ROICacheKey): string {
  // Round to buckets: orders to nearest 25, AOV to nearest 5, commission to exact
  const orderBucket = Math.round(k.ordersPerWeek / 25) * 25;
  const aovBucket = Math.round(k.aov / 5) * 5;
  return `roi_${orderBucket}_${aovBucket}_${k.commissionRate}`;
}

const roiCache = new LRUCache<string, CacheEntry<string>>({
  max: 200,
  ttl: ROI_TTL_MS,
});

export function getCachedROI(key: ROICacheKey): string | null {
  const entry = roiCache.get(buildROICacheKey(key));
  if (!entry) return null;
  return entry.data;
}

export function setCachedROI(key: ROICacheKey, formatted: string): void {
  roiCache.set(buildROICacheKey(key), { data: formatted, fetchedAt: Date.now() });
}

// ─── Pre-seed common ROI scenarios ──────────────────────────────────────────

import { computeROI, formatROIForChat } from './roi';

const COMMON_SCENARIOS = [
  { ordersPerWeek: 100, aov: 30, commissionRate: 0.25 },
  { ordersPerWeek: 100, aov: 30, commissionRate: 0.30 },
  { ordersPerWeek: 100, aov: 35, commissionRate: 0.25 },
  { ordersPerWeek: 100, aov: 35, commissionRate: 0.30 },
  { ordersPerWeek: 150, aov: 30, commissionRate: 0.25 },
  { ordersPerWeek: 150, aov: 30, commissionRate: 0.30 },
  { ordersPerWeek: 150, aov: 35, commissionRate: 0.25 },
  { ordersPerWeek: 150, aov: 35, commissionRate: 0.30 },
  { ordersPerWeek: 200, aov: 30, commissionRate: 0.25 },
  { ordersPerWeek: 200, aov: 30, commissionRate: 0.30 },
  { ordersPerWeek: 200, aov: 35, commissionRate: 0.25 },
  { ordersPerWeek: 200, aov: 35, commissionRate: 0.30 },
  { ordersPerWeek: 200, aov: 40, commissionRate: 0.25 },
  { ordersPerWeek: 200, aov: 40, commissionRate: 0.30 },
  { ordersPerWeek: 300, aov: 35, commissionRate: 0.25 },
  { ordersPerWeek: 300, aov: 35, commissionRate: 0.30 },
  { ordersPerWeek: 50, aov: 25, commissionRate: 0.30 },
  { ordersPerWeek: 50, aov: 30, commissionRate: 0.30 },
  { ordersPerWeek: 75, aov: 30, commissionRate: 0.25 },
  { ordersPerWeek: 75, aov: 35, commissionRate: 0.30 },
];

export function preSeedROICache(): void {
  for (const scenario of COMMON_SCENARIOS) {
    const input = {
      orderValue: scenario.aov,
      monthlyDeliveries: scenario.ordersPerWeek * 4,
      commissionRate: scenario.commissionRate,
    };
    const roi = computeROI(input);
    const formatted = formatROIForChat(roi, input);
    setCachedROI(scenario, formatted);
  }
  console.log(`[brain-cache] Pre-seeded ${COMMON_SCENARIOS.length} common ROI scenarios`);
}

// ─── Cache Stats ────────────────────────────────────────────────────────────

export function getCacheStats(): Record<string, { size: number; max: number }> {
  return {
    brainContent: { size: brainContentCache.size, max: 50 },
    callPatterns: { size: callPatternsCache.size, max: 50 },
    liveStats: { size: liveStatsCache.size, max: 50 },
    socialProof: { size: socialProofCache.size, max: 50 },
    roi: { size: roiCache.size, max: 200 },
  };
}

export function clearAllCaches(): void {
  brainContentCache.clear();
  callPatternsCache.clear();
  liveStatsCache.clear();
  socialProofCache.clear();
  roiCache.clear();
}
