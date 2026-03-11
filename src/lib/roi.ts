/**
 * Server-side ROI computation engine.
 * Mirrors the exact formulas from the Shipday ROI Calculator
 * (shipdayroi.mikegrowsgreens.com) so the chat presents real numbers.
 */

// ─── Constants (matching the calculator) ─────────────────────────────────────

const SHIPDAY_FEE = 6.49;
const PLAN_ELITE = 99;
const PLAN_LITE = 159;
const PLAN_UNLIMITED = 349;
const SMS_REV = 0.20;
const REVIEW_RATE = 0.05;

// ─── Input Types ─────────────────────────────────────────────────────────────

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
  /** Savings per order switched from 3PD to Shipday */
  savingsPerOrder: number;

  /** Orders needed to break even on Elite plan */
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

  /** Days to pay back the $349 Unlimited plan */
  paybackDays: number;
  /** ROI multiplier for Unlimited plan (e.g., 7.39 = 739%) */
  unlimitedROIMultiplier: number;

  /** Conversion model breakdown */
  conversion: {
    /** What % of 3PD orders shift to direct (e.g., 0.10 = 10%) */
    conversionRate: number;
    /** How many orders per month shift to direct */
    convertedOrdersPerMonth: number;
    /** Savings per converted order */
    savingsPerConvertedOrder: number;
    /** Monthly savings from converted orders only */
    monthlyConversionSavings: number;
    /** New order growth rate */
    orderGrowthRate: number;
    /** New orders per month from growth */
    newOrdersPerMonth: number;
    /** Revenue from new growth orders */
    monthlyGrowthRevenue: number;
    /** Menu markup factored into commission calculation */
    menuMarkup: number;
  };

  /** Plan-specific annual values and ROI */
  plans: {
    elite: { annualValue: number; annualCost: number; roi: number };
    lite: { annualValue: number; annualCost: number; roi: number };
    unlimited: { annualValue: number; annualCost: number; roi: number };
  };

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

export function computeROI(input: ROIInput): ROIResult {
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

  // ─── Delivery Savings ────────────────────────────────────────────────────

  const markedUp = orderValue * (1 + menuMarkup);
  const perOrderCommission = markedUp * commissionRate;
  const currentMonthlyCommissions = perOrderCommission * monthlyDeliveries;
  const savingsPerOrder = Math.max(0, perOrderCommission - SHIPDAY_FEE);

  // Conversion savings: orders shifted from 3PD to direct
  const convertedOrders = monthlyDeliveries * conversionRate;
  const conversionSavings = convertedOrders * savingsPerOrder;

  // Growth revenue from new orders
  const totalDeliveries = monthlyDeliveries + monthlyInHouseDeliveries;
  const newOrders = totalDeliveries * orderGrowth;
  const growthRevenue = newOrders * Math.max(0, orderValue - SHIPDAY_FEE);

  const monthlyDeliverySavings = conversionSavings + growthRevenue;

  // Break-even
  const breakEvenOrders = savingsPerOrder > 0
    ? Math.ceil(PLAN_ELITE / savingsPerOrder)
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

  const monthlySMSValue = 3000 * SMS_REV; // $600/mo for Unlimited plan

  // ─── Plan ROI ────────────────────────────────────────────────────────────

  const deliveryAnnual = monthlyDeliverySavings * 12;
  const smsLiteAnnual = 1500 * SMS_REV * 12; // $3,600
  const smsUnlimitedAnnual = 3000 * SMS_REV * 12; // $7,200
  const aiAnnual = monthlyAIValue * 12;

  const eliteAnnualValue = deliveryAnnual;
  const liteAnnualValue = deliveryAnnual + smsLiteAnnual;
  const unlimitedAnnualValue = deliveryAnnual + smsUnlimitedAnnual + aiAnnual;

  const eliteAnnualCost = PLAN_ELITE * 12;
  const liteAnnualCost = PLAN_LITE * 12;
  const unlimitedAnnualCost = PLAN_UNLIMITED * 12;

  const calcROI = (value: number, cost: number) =>
    cost > 0 ? Math.round(((value - cost) / cost) * 100) : 0;

  // ─── Payback ─────────────────────────────────────────────────────────────

  const totalMonthlyBenefit = monthlyDeliverySavings + monthlySMSValue + monthlyAIValue;
  const totalAnnualBenefit = totalMonthlyBenefit * 12;
  const paybackDays = totalMonthlyBenefit > 0
    ? Math.round((PLAN_UNLIMITED / (totalMonthlyBenefit / 30)) * 10) / 10
    : Infinity;
  const unlimitedROIMultiplier = unlimitedAnnualCost > 0
    ? Math.round((unlimitedAnnualValue / unlimitedAnnualCost) * 100) / 100
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
    unlimitedROIMultiplier,
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
    plans: {
      elite: {
        annualValue: Math.round(eliteAnnualValue),
        annualCost: eliteAnnualCost,
        roi: calcROI(eliteAnnualValue, eliteAnnualCost),
      },
      lite: {
        annualValue: Math.round(liteAnnualValue),
        annualCost: liteAnnualCost,
        roi: calcROI(liteAnnualValue, liteAnnualCost),
      },
      unlimited: {
        annualValue: Math.round(unlimitedAnnualValue),
        annualCost: unlimitedAnnualCost,
        roi: calcROI(unlimitedAnnualValue, unlimitedAnnualCost),
      },
    },
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
 * Only called when all 3 qualification slots are filled.
 */
export function formatROIForChat(roi: ROIResult, input: ROIInput): string {
  const weekly = Math.round(input.monthlyDeliveries / 4);
  const tierPct = Math.round(input.commissionRate * 100);
  const convPct = Math.round(roi.conversion.conversionRate * 100);
  const growthPct = Math.round(roi.conversion.orderGrowthRate * 100);
  const markupPct = Math.round(roi.conversion.menuMarkup * 100);

  return `## COMPUTED ROI (use these EXACT numbers — they match our calculator at shipdayroi.mikegrowsgreens.com)

**CRITICAL PRESENTATION ORDER: Lead with GROWTH revenue, stack commission savings on top.**
The prospect's biggest revenue leaks are missed calls and no repeat marketing. Commission savings is a bonus — not the headline.

**🔥 #1 — AI Receptionist (this is the closer for $349):**
- ~${roi.ai.missedCallsPerMonth} missed calls/month going to voicemail during peak hours
- That's **${roi.ai.recoveredOrders} recovered orders/month** at $${input.orderValue}/order
- Recovered revenue: **$${roi.ai.recoveredRevenue}/month**
- Plus $${roi.ai.laborSaved}/month in labor savings (AI handles 80% of routine calls)
- **Total AI value: $${roi.ai.totalValue}/month** — this ALONE is 6x ROI on the $349 plan
- Frame it: "You're losing $${roi.ai.recoveredRevenue}/month to voicemail right now. The AI Receptionist catches every call for $349/month — that's a 24/7 employee at $0.48/hour."

**📱 #2 — SMS Marketing (this sells $159+):**
- 3,000 messages/mo on Unlimited (1,500 on AI Lite)
- Estimated revenue: **$${roi.monthlySMSValue}/month** from repeat order campaigns
- Frame it: "Your existing customers are your best revenue source. SMS campaigns bring them back at nearly zero acquisition cost."

**💰 #3 — Commission Savings (the bonus on top):**
- Currently paying **$${roi.currentMonthlyCommissions}/month** ($${roi.currentMonthlyCommissions * 12}/year) in 3PD commissions
- ${weekly} orders/week × $${input.orderValue} avg order (marked up ${markupPct}% on 3PD = $${(input.orderValue * (1 + roi.conversion.menuMarkup)).toFixed(2)}) at ${tierPct}% commission = **$${roi.perOrderCommission}/order** going to DoorDash
- Conversion play: shift ${convPct}% of regulars to direct → ${roi.conversion.convertedOrdersPerMonth} orders at $6.49 flat instead of $${roi.perOrderCommission}
- Monthly delivery savings: **$${roi.monthlyDeliverySavings}** (conversion + ${growthPct}% growth = ${roi.conversion.newOrdersPerMonth} new orders)
- Break-even on delivery alone: ${roi.breakEvenOrders} orders (${roi.breakEvenPct}% of volume)
- Frame it: "On TOP of the growth revenue, you keep more margin on the orders you already have."

**📊 TOTAL IMPACT (Unlimited $349/mo):**
- Monthly benefit: **$${roi.totalMonthlyBenefit}** (AI Receptionist $${roi.ai.totalValue} + SMS $${roi.monthlySMSValue} + delivery $${roi.monthlyDeliverySavings})
- Annual benefit: **$${roi.totalAnnualBenefit}**
- ROI: **${roi.plans.unlimited.roi}%** annual return
- **Pays for itself in ${roi.paybackDays} days**

**How to present this (GROWTH-FIRST order):**
1. FIRST → "Here's what jumped out — you're losing about $${roi.ai.recoveredRevenue}/month in missed phone orders. The AI Receptionist catches every one of those calls, 24/7."
2. SECOND → "And with SMS marketing, you can bring back your regulars without spending on ads. That's another $${roi.monthlySMSValue}/month."
3. THIRD → "On top of that, shifting just ${convPct}% of your DoorDash regulars to direct ordering saves another $${roi.conversion.monthlyConversionSavings}/month in commissions."
4. STACK → "Total: **$${roi.totalMonthlyBenefit}/month** in new revenue and savings. The $349 plan pays for itself in ${roi.paybackDays} days."
5. CLOSE → "Mike can walk you through exactly how this works for your setup. Let me pull up his calendar."
6. OPTIONAL → "Want to play with the numbers yourself? Check out shipdayroi.mikegrowsgreens.com"

**CRITICAL: Use these exact numbers. They match our ROI calculator. Always lead with AI Receptionist value, not commission savings.**`;
}

/**
 * Build a URL to the ROI calculator with pre-filled values.
 * The calculator reads URL params to pre-populate inputs.
 */
export function buildCalculatorURL(input: ROIInput): string {
  const params = new URLSearchParams({
    orderValue: String(input.orderValue),
    monthlyDeliveries: String(input.monthlyDeliveries),
    commissionRate: String(Math.round(input.commissionRate * 100)),
  });
  return `https://shipdayroi.mikegrowsgreens.com?${params.toString()}`;
}
