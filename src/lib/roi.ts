/**
 * Server-side ROI computation engine.
 * Generic computation that works with any org's pricing/product config.
 * Per-org pricing constants come from org config; defaults are generic.
 */

// ─── Default constants (overridable per-org via config) ─────────────────────

const DEFAULT_FLAT_FEE = 6.49;
const DEFAULT_SMS_REV = 0.20;

// ─── Input Types ─────────────────────────────────────────────────────────────

export interface ROIPricingConfig {
  /** Flat per-delivery fee (default 6.49) */
  flatFee?: number;
  /** Per-SMS revenue estimate (default 0.20) */
  smsRevenue?: number;
  /** Pricing tiers: { name, price, smsVolume?, includesAI? } */
  tiers?: Array<{
    name: string;
    price: number;
    smsVolume?: number;
    includesAI?: boolean;
  }>;
  /** ROI calculator URL (optional) */
  calculatorUrl?: string;
}

export interface ROIInput {
  /** Average order value in dollars */
  orderValue: number;
  /** Monthly third-party deliveries (DoorDash, UberEats, etc.) */
  monthlyDeliveries: number;
  /** Current 3PD commission rate as decimal (0.15, 0.25, 0.30) */
  commissionRate: number;
  /** Menu markup on 3PD platforms as decimal (default 0.15) */
  menuMarkup?: number;
  /** Monthly in-house deliveries (default 0) */
  monthlyInHouseDeliveries?: number;
  /** Monthly takeout orders (default 0) */
  monthlyTakeout?: number;
  /** 3PD-to-direct conversion rate as decimal (default 0.10) */
  conversionRate?: number;
  /** New order growth rate as decimal (default 0.05) */
  orderGrowth?: number;
  /** Monthly incoming calls (default 500) */
  monthlyCalls?: number;
  /** Call miss rate as decimal (default 0.35) */
  missRate?: number;
  /** Call-to-order conversion rate (default 0.25) */
  callConversion?: number;
  /** Staff hourly wage for labor savings (default 18) */
  staffWage?: number;
}

// ─── Output Types ────────────────────────────────────────────────────────────

export interface ROIResult {
  /** What they're currently paying 3PD per month */
  currentMonthlyCommissions: number;
  /** Per-order commission cost */
  perOrderCommission: number;
  /** Savings per order switched from 3PD to direct */
  savingsPerOrder: number;

  /** Orders needed to break even on lowest plan */
  breakEvenOrders: number;
  /** Break-even as % of current volume */
  breakEvenPct: number;

  /** Monthly delivery savings (conversion + growth) */
  monthlyDeliverySavings: number;
  /** Monthly AI receptionist recovered revenue */
  monthlyAIValue: number;
  /** Monthly SMS marketing value estimate */
  monthlySMSValue: number;
  /** Total monthly benefit across all features */
  totalMonthlyBenefit: number;
  /** Total annual benefit */
  totalAnnualBenefit: number;

  /** Days to pay back the top-tier plan */
  paybackDays: number;
  /** ROI multiplier for top-tier plan */
  topTierROIMultiplier: number;

  /** Conversion model breakdown */
  conversion: {
    conversionRate: number;
    convertedOrdersPerMonth: number;
    savingsPerConvertedOrder: number;
    monthlyConversionSavings: number;
    orderGrowthRate: number;
    newOrdersPerMonth: number;
    monthlyGrowthRevenue: number;
    menuMarkup: number;
  };

  /** Per-plan annual values and ROI */
  plans: Record<string, { annualValue: number; annualCost: number; roi: number }>;

  /** AI receptionist specific metrics */
  ai: {
    missedCallsPerMonth: number;
    recoveredOrders: number;
    recoveredRevenue: number;
    laborSaved: number;
    totalValue: number;
  };
}

// ─── Computation ─────────────────────────────────────────────────────────────

export function computeROI(input: ROIInput, pricing?: ROIPricingConfig): ROIResult {
  const {
    orderValue,
    monthlyDeliveries,
    commissionRate,
    menuMarkup = 0.15,
    monthlyInHouseDeliveries = 0,
    monthlyTakeout = 0,
    conversionRate = 0.10,
    orderGrowth = 0.05,
    monthlyCalls = 500,
    missRate = 0.35,
    callConversion = 0.25,
    staffWage = 18,
  } = input;

  const flatFee = pricing?.flatFee ?? DEFAULT_FLAT_FEE;
  const smsRev = pricing?.smsRevenue ?? DEFAULT_SMS_REV;
  const tiers = pricing?.tiers ?? [
    { name: 'basic', price: 99, smsVolume: 0, includesAI: false },
    { name: 'standard', price: 159, smsVolume: 1500, includesAI: false },
    { name: 'premium', price: 349, smsVolume: 3000, includesAI: true },
  ];

  // Sort tiers by price to find lowest/highest
  const sortedTiers = [...tiers].sort((a, b) => a.price - b.price);
  const lowestTier = sortedTiers[0];
  const topTier = sortedTiers[sortedTiers.length - 1];

  // ─── Delivery Savings ────────────────────────────────────────────────────

  const markedUp = orderValue * (1 + menuMarkup);
  const perOrderCommission = markedUp * commissionRate;
  const currentMonthlyCommissions = perOrderCommission * monthlyDeliveries;
  const savingsPerOrder = Math.max(0, perOrderCommission - flatFee);

  // Conversion savings: orders shifted from 3PD to direct
  const convertedOrders = monthlyDeliveries * conversionRate;
  const conversionSavings = convertedOrders * savingsPerOrder;

  // Growth revenue from new orders
  const totalDeliveries = monthlyDeliveries + monthlyInHouseDeliveries;
  const newOrders = totalDeliveries * orderGrowth;
  const growthRevenue = newOrders * Math.max(0, orderValue - flatFee);

  const monthlyDeliverySavings = conversionSavings + growthRevenue;

  // Break-even
  const breakEvenOrders = savingsPerOrder > 0
    ? Math.ceil(lowestTier.price / savingsPerOrder)
    : Infinity;
  const breakEvenPct = monthlyDeliveries > 0
    ? (breakEvenOrders / monthlyDeliveries) * 100
    : 100;

  // ─── AI Receptionist ─────────────────────────────────────────────────────

  const missedCalls = monthlyCalls * missRate;
  const recoveredOrders = Math.round(missedCalls * callConversion);
  const recoveredRevenue = missedCalls * callConversion * orderValue;
  const aiHandledCalls = monthlyCalls * 0.80;
  const timeSavedHours = (aiHandledCalls * 5) / 60;
  const laborSaved = timeSavedHours * staffWage;
  const monthlyAIValue = recoveredRevenue + laborSaved;

  // ─── SMS Marketing ───────────────────────────────────────────────────────

  const topTierSMS = topTier.smsVolume || 3000;
  const monthlySMSValue = topTierSMS * smsRev;

  // ─── Plan ROI ────────────────────────────────────────────────────────────

  const deliveryAnnual = monthlyDeliverySavings * 12;
  const aiAnnual = monthlyAIValue * 12;

  const calcROI = (value: number, cost: number) =>
    cost > 0 ? Math.round(((value - cost) / cost) * 100) : 0;

  const plans: Record<string, { annualValue: number; annualCost: number; roi: number }> = {};
  for (const tier of sortedTiers) {
    const tierSMS = tier.smsVolume || 0;
    const smsAnnual = tierSMS * smsRev * 12;
    const aiValue = tier.includesAI ? aiAnnual : 0;
    const annualValue = deliveryAnnual + smsAnnual + aiValue;
    const annualCost = tier.price * 12;
    plans[tier.name] = {
      annualValue: Math.round(annualValue),
      annualCost,
      roi: calcROI(annualValue, annualCost),
    };
  }

  // ─── Payback ─────────────────────────────────────────────────────────────

  const totalMonthlyBenefit = monthlyDeliverySavings + monthlySMSValue + monthlyAIValue;
  const totalAnnualBenefit = totalMonthlyBenefit * 12;
  const paybackDays = totalMonthlyBenefit > 0
    ? Math.round((topTier.price / (totalMonthlyBenefit / 30)) * 10) / 10
    : Infinity;
  const topTierROIMultiplier = (topTier.price * 12) > 0
    ? Math.round(((plans[topTier.name]?.annualValue ?? 0) / (topTier.price * 12)) * 100) / 100
    : 0;

  return {
    currentMonthlyCommissions: Math.round(currentMonthlyCommissions),
    perOrderCommission: Math.round(perOrderCommission * 100) / 100,
    savingsPerOrder: Math.round(savingsPerOrder * 100) / 100,
    breakEvenOrders,
    breakEvenPct: Math.round(breakEvenPct * 10) / 10,
    monthlyDeliverySavings: Math.round(monthlyDeliverySavings),
    monthlyAIValue: Math.round(monthlyAIValue),
    monthlySMSValue: Math.round(monthlySMSValue),
    totalMonthlyBenefit: Math.round(totalMonthlyBenefit),
    totalAnnualBenefit: Math.round(totalAnnualBenefit),
    paybackDays,
    topTierROIMultiplier,
    conversion: {
      conversionRate,
      convertedOrdersPerMonth: Math.round(convertedOrders),
      savingsPerConvertedOrder: Math.round(savingsPerOrder * 100) / 100,
      monthlyConversionSavings: Math.round(conversionSavings),
      orderGrowthRate: orderGrowth,
      newOrdersPerMonth: Math.round(newOrders),
      monthlyGrowthRevenue: Math.round(growthRevenue),
      menuMarkup,
    },
    plans,
    ai: {
      missedCallsPerMonth: Math.round(missedCalls),
      recoveredOrders,
      recoveredRevenue: Math.round(recoveredRevenue),
      laborSaved: Math.round(laborSaved),
      totalValue: Math.round(monthlyAIValue),
    },
  };
}

// ─── Chat-friendly summary ───────────────────────────────────────────────────

/**
 * Generate a formatted ROI summary for injection into Claude's system prompt.
 * Only called when sufficient qualification data is filled.
 */
export function formatROIForChat(
  roi: ROIResult,
  input: ROIInput,
  config?: { senderName?: string; calculatorUrl?: string; topTierName?: string; topTierPrice?: number; flatFee?: number },
): string {
  const weekly = Math.round(input.monthlyDeliveries / 4);
  const tierPct = Math.round(input.commissionRate * 100);
  const convPct = Math.round(roi.conversion.conversionRate * 100);
  const growthPct = Math.round(roi.conversion.orderGrowthRate * 100);
  const markupPct = Math.round(roi.conversion.menuMarkup * 100);
  const senderName = config?.senderName || 'our team';
  const topTierName = config?.topTierName || 'Premium';
  const topTierPrice = config?.topTierPrice || 349;
  const flatFee = config?.flatFee || 6.49;
  const calculatorUrl = config?.calculatorUrl || '';

  // Find the top plan in roi.plans
  const planEntries = Object.entries(roi.plans);
  const topPlan = planEntries[planEntries.length - 1];

  return `## COMPUTED ROI (use these EXACT numbers)

**CRITICAL PRESENTATION ORDER: Lead with GROWTH revenue, stack commission savings on top.**

**#1 - AI Receptionist (top-tier value driver):**
- ~${roi.ai.missedCallsPerMonth} missed calls/month going to voicemail during peak hours
- That's **${roi.ai.recoveredOrders} recovered orders/month** at $${input.orderValue}/order
- Recovered revenue: **$${roi.ai.recoveredRevenue}/month**
- Plus $${roi.ai.laborSaved}/month in labor savings (AI handles 80% of routine calls)
- **Total AI value: $${roi.ai.totalValue}/month**

**#2 - SMS Marketing:**
- Estimated revenue: **$${roi.monthlySMSValue}/month** from repeat order campaigns

**#3 - Commission Savings (the bonus on top):**
- Currently paying **$${roi.currentMonthlyCommissions}/month** ($${roi.currentMonthlyCommissions * 12}/year) in 3PD commissions
- ${weekly} orders/week × $${input.orderValue} avg order (marked up ${markupPct}% on 3PD) at ${tierPct}% commission = **$${roi.perOrderCommission}/order**
- Conversion play: shift ${convPct}% to direct → ${roi.conversion.convertedOrdersPerMonth} orders at $${flatFee} flat instead of $${roi.perOrderCommission}
- Monthly delivery savings: **$${roi.monthlyDeliverySavings}** (conversion + ${growthPct}% growth = ${roi.conversion.newOrdersPerMonth} new orders)
- Break-even on delivery alone: ${roi.breakEvenOrders} orders (${roi.breakEvenPct}% of volume)

**TOTAL IMPACT (${topTierName} $${topTierPrice}/mo):**
- Monthly benefit: **$${roi.totalMonthlyBenefit}** (AI $${roi.ai.totalValue} + SMS $${roi.monthlySMSValue} + delivery $${roi.monthlyDeliverySavings})
- Annual benefit: **$${roi.totalAnnualBenefit}**
- ROI: **${topPlan ? topPlan[1].roi : 0}%** annual return
- **Pays for itself in ${roi.paybackDays} days**

**How to present (GROWTH-FIRST order):**
1. FIRST → Present AI Receptionist recovered revenue
2. SECOND → Present SMS marketing opportunity
3. THIRD → Layer commission savings as bonus
4. STACK → Show total monthly impact and payback period
5. CLOSE → "${senderName} can walk you through exactly how this works. Let me pull up their calendar."
${calculatorUrl ? `6. OPTIONAL → "Want to play with the numbers? Check out ${calculatorUrl}"` : ''}

**CRITICAL: Use these exact numbers. Always lead with AI value, not commission savings.**`;
}

/**
 * Build a URL to the ROI calculator with pre-filled values.
 */
export function buildCalculatorURL(input: ROIInput, baseUrl?: string): string {
  if (!baseUrl) return '';
  const params = new URLSearchParams({
    orderValue: String(input.orderValue),
    monthlyDeliveries: String(input.monthlyDeliveries),
    commissionRate: String(Math.round(input.commissionRate * 100)),
  });
  return `${baseUrl}?${params.toString()}`;
}

