/**
 * Inline ROI Chart Generator (Session 10 — Wow Moment)
 * Generates SVG chart showing 12-month savings accumulation.
 * Rendered inline in the chatbot as an SVG string.
 */

import type { ROIResult } from './roi';

interface ChartConfig {
  width?: number;
  height?: number;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
}

/**
 * Generate an SVG chart showing 12-month cumulative savings.
 * Returns raw SVG string for inline rendering in chat.
 */
export function generateROIChart(
  roi: ROIResult,
  planPrice: number,
  config?: ChartConfig,
): string {
  const width = config?.width || 480;
  const height = config?.height || 280;
  const primaryColor = config?.primaryColor || '#2563eb';
  const secondaryColor = config?.secondaryColor || '#10b981';
  const accentColor = config?.accentColor || '#f59e0b';

  const padding = { top: 30, right: 20, bottom: 40, left: 55 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Calculate 12-month data points
  const months: number[] = [];
  const cumulativeSavings: number[] = [];
  const cumulativeCost: number[] = [];
  let totalSavings = 0;
  let totalCost = 0;

  for (let m = 1; m <= 12; m++) {
    months.push(m);
    totalSavings += roi.totalMonthlyBenefit;
    totalCost += planPrice;
    cumulativeSavings.push(totalSavings);
    cumulativeCost.push(totalCost);
  }

  const maxValue = Math.max(...cumulativeSavings, ...cumulativeCost);
  const netSavings = cumulativeSavings.map((s, i) => s - cumulativeCost[i]);

  // Scale functions
  const scaleX = (month: number) => padding.left + ((month - 1) / 11) * chartW;
  const scaleY = (value: number) => padding.top + chartH - (value / maxValue) * chartH;

  // Build savings line path
  const savingsPath = cumulativeSavings
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(i + 1).toFixed(1)} ${scaleY(v).toFixed(1)}`)
    .join(' ');

  // Build cost line path
  const costPath = cumulativeCost
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(i + 1).toFixed(1)} ${scaleY(v).toFixed(1)}`)
    .join(' ');

  // Build fill area (savings above cost)
  const fillPath = savingsPath
    + ` L ${scaleX(12).toFixed(1)} ${scaleY(cumulativeCost[11]).toFixed(1)}`
    + cumulativeCost.map((v, i) => ` L ${scaleX(12 - i).toFixed(1)} ${scaleY(cumulativeCost[11 - i]).toFixed(1)}`).join('')
    + ' Z';

  // Find break-even month
  const breakEvenMonth = netSavings.findIndex(v => v > 0) + 1;

  // Y-axis labels
  const yTicks = 5;
  const yLabels: string[] = [];
  for (let i = 0; i <= yTicks; i++) {
    const val = (maxValue / yTicks) * i;
    const y = scaleY(val);
    const label = val >= 1000 ? `$${(val / 1000).toFixed(0)}k` : `$${val.toFixed(0)}`;
    yLabels.push(`<text x="${padding.left - 8}" y="${y.toFixed(1)}" text-anchor="end" font-size="10" fill="#9ca3af" dominant-baseline="middle">${label}</text>`);
    yLabels.push(`<line x1="${padding.left}" y1="${y.toFixed(1)}" x2="${width - padding.right}" y2="${y.toFixed(1)}" stroke="#f3f4f6" stroke-width="1"/>`);
  }

  // X-axis labels (months)
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const xLabels = months.map((m, i) => {
    const x = scaleX(m);
    return `<text x="${x.toFixed(1)}" y="${height - padding.bottom + 18}" text-anchor="middle" font-size="9" fill="#9ca3af">${monthLabels[i]}</text>`;
  });

  // Break-even marker
  const breakEvenMarker = breakEvenMonth > 0 && breakEvenMonth <= 12
    ? `<line x1="${scaleX(breakEvenMonth).toFixed(1)}" y1="${padding.top}" x2="${scaleX(breakEvenMonth).toFixed(1)}" y2="${(height - padding.bottom).toFixed(1)}" stroke="${accentColor}" stroke-width="1.5" stroke-dasharray="4 3"/>
       <text x="${scaleX(breakEvenMonth).toFixed(1)}" y="${padding.top - 8}" text-anchor="middle" font-size="9" fill="${accentColor}" font-weight="600">Break-even</text>`
    : '';

  // Net savings annotation at month 12
  const annualNet = netSavings[11];
  const netLabel = annualNet >= 0
    ? `<text x="${scaleX(12).toFixed(1)}" y="${(scaleY(cumulativeSavings[11]) - 12).toFixed(1)}" text-anchor="end" font-size="11" fill="${secondaryColor}" font-weight="700">+$${annualNet.toLocaleString()}/yr net</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="background:#fff;border-radius:8px;border:1px solid #e5e7eb">
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  </style>

  <!-- Title -->
  <text x="${width / 2}" y="18" text-anchor="middle" font-size="13" fill="#1f2937" font-weight="600">12-Month Savings Projection</text>

  <!-- Grid -->
  ${yLabels.join('\n  ')}
  ${xLabels.join('\n  ')}

  <!-- Fill area between savings and cost -->
  <path d="${fillPath}" fill="${secondaryColor}" opacity="0.1"/>

  <!-- Cost line -->
  <path d="${costPath}" fill="none" stroke="#ef4444" stroke-width="2" stroke-dasharray="6 3" opacity="0.6"/>

  <!-- Savings line -->
  <path d="${savingsPath}" fill="none" stroke="${primaryColor}" stroke-width="2.5"/>

  <!-- Data points on savings line -->
  ${cumulativeSavings.map((v, i) => `<circle cx="${scaleX(i + 1).toFixed(1)}" cy="${scaleY(v).toFixed(1)}" r="3" fill="${primaryColor}" stroke="white" stroke-width="1.5"/>`).join('\n  ')}

  ${breakEvenMarker}
  ${netLabel}

  <!-- Legend -->
  <line x1="${padding.left}" y1="${height - 8}" x2="${padding.left + 20}" y2="${height - 8}" stroke="${primaryColor}" stroke-width="2"/>
  <text x="${padding.left + 24}" y="${height - 5}" font-size="9" fill="#6b7280">Total Benefit</text>

  <line x1="${padding.left + 100}" y1="${height - 8}" x2="${padding.left + 120}" y2="${height - 8}" stroke="#ef4444" stroke-width="2" stroke-dasharray="4 2"/>
  <text x="${padding.left + 124}" y="${height - 5}" font-size="9" fill="#6b7280">Plan Cost</text>

  <rect x="${padding.left + 200}" y="${height - 12}" width="10" height="8" fill="${secondaryColor}" opacity="0.2" rx="1"/>
  <text x="${padding.left + 214}" y="${height - 5}" font-size="9" fill="#6b7280">Net Savings</text>
</svg>`;
}

/**
 * Generate a compact ROI comparison bar chart for chat.
 */
export function generateROIComparisonBars(
  currentCost: number,
  withShipday: number,
  savings: number,
): string {
  const width = 360;
  const height = 100;
  const maxVal = Math.max(currentCost, withShipday) * 1.1;

  const barH = 24;
  const gap = 16;
  const y1 = 20;
  const y2 = y1 + barH + gap;
  const labelX = 100;
  const barStart = labelX + 8;
  const barMax = width - barStart - 10;

  const bar1W = (currentCost / maxVal) * barMax;
  const bar2W = (withShipday / maxVal) * barMax;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="background:#fff;border-radius:8px;border:1px solid #e5e7eb">
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  </style>

  <!-- Current cost bar -->
  <text x="${labelX}" y="${y1 + barH / 2 + 1}" text-anchor="end" font-size="11" fill="#6b7280" dominant-baseline="middle">Current Cost</text>
  <rect x="${barStart}" y="${y1}" width="${bar1W.toFixed(1)}" height="${barH}" rx="4" fill="#ef4444" opacity="0.8"/>
  <text x="${barStart + bar1W + 6}" y="${y1 + barH / 2 + 1}" font-size="11" fill="#ef4444" font-weight="600" dominant-baseline="middle">$${currentCost.toLocaleString()}/mo</text>

  <!-- With Shipday bar -->
  <text x="${labelX}" y="${y2 + barH / 2 + 1}" text-anchor="end" font-size="11" fill="#6b7280" dominant-baseline="middle">With Shipday</text>
  <rect x="${barStart}" y="${y2}" width="${bar2W.toFixed(1)}" height="${barH}" rx="4" fill="#10b981" opacity="0.8"/>
  <text x="${barStart + bar2W + 6}" y="${y2 + barH / 2 + 1}" font-size="11" fill="#10b981" font-weight="600" dominant-baseline="middle">$${withShipday.toLocaleString()}/mo</text>

  <!-- Savings callout -->
  <text x="${width / 2}" y="${height - 6}" text-anchor="middle" font-size="12" fill="#1f2937" font-weight="700">You save $${savings.toLocaleString()}/month</text>
</svg>`;
}
