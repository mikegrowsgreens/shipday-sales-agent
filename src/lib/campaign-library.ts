/**
 * Pre-built A/B campaign library definitions for all tiers.
 * Each tier has 2 variants (A/B) with 5-step email sequences.
 * These get seeded into bdr.campaign_templates on first load.
 */

export interface LibraryStep {
  step_number: number;
  delay_days: number;
  channel: 'email' | 'call' | 'linkedin' | 'ai_chat' | 'ai_call';
  angle: string;
  tone: string;
  instructions: string;
  /** For ai_chat: the greeting message the AI opens with, using campaign context */
  ai_chat_greeting?: string;
  /** For ai_call: the opening script context for the voice agent */
  ai_call_context?: string;
  /** Trigger condition for this step (e.g., only fire ai_call on positive reply) */
  trigger_condition?: 'always' | 'positive_reply' | 'email_clicked' | 'multi_open' | 'no_response';
}

export interface LibraryVariant {
  name: string;
  description: string;
  steps: LibraryStep[];
}

export interface LibraryTier {
  name: string;
  tier_key: string;
  variants: {
    A: LibraryVariant;
    B: LibraryVariant;
    C: LibraryVariant;
  };
}

export const CAMPAIGN_LIBRARY: LibraryTier[] = [
  {
    name: 'Enterprise / High-Volume',
    tier_key: 'tier_1',
    variants: {
      A: {
        name: 'ROI-Led',
        description: 'Lead with cost savings, progress to case studies, close with custom demo',
        steps: [
          {
            step_number: 1,
            delay_days: 0,
            channel: 'email',
            angle: 'roi_savings',
            tone: 'consultative',
            instructions: 'Lead with their specific ROI projection. Reference their order volume if available. Ask about their current delivery cost per order. Keep it to 2-3 sentences max. No fluff.',
          },
          {
            step_number: 2,
            delay_days: 3,
            channel: 'email',
            angle: 'case_study',
            tone: 'peer_proof',
            instructions: 'Share a case study from a similar-sized operation. Reference the ROI numbers from step 1. Show what a peer achieved, not what we promise. One short paragraph.',
          },
          {
            step_number: 3,
            delay_days: 5,
            channel: 'email',
            angle: 'pain_point',
            tone: 'empathetic',
            instructions: 'Address the #1 pain point for high-volume delivery operations (driver coordination, cost per delivery, missed orders). Use call intelligence if available. Show you understand their world.',
          },
          {
            step_number: 4,
            delay_days: 4,
            channel: 'email',
            angle: 'product_demo',
            tone: 'direct',
            instructions: 'Offer a personalized demo. Reference specific features relevant to their scale (route optimization, fleet management, real-time tracking). Make the ask simple - 15 minutes.',
          },
          {
            step_number: 5,
            delay_days: 7,
            channel: 'email',
            angle: 'final_value',
            tone: 'casual',
            instructions: 'Casual check-in. Summarize the full value proposition in one sentence. Make it easy to say yes. No pressure, just availability. "Figured I\'d check in one more time."',
          },
        ],
      },
      B: {
        name: 'Pain-Point-Led',
        description: 'Lead with their biggest operational pain, progress to solution, close with ROI',
        steps: [
          {
            step_number: 1,
            delay_days: 0,
            channel: 'email',
            angle: 'pain_point',
            tone: 'empathetic',
            instructions: 'Open with the #1 frustration for high-volume operations - driver no-shows, rising delivery costs, or order errors. Ask one specific question about their current setup. 2-3 sentences.',
          },
          {
            step_number: 2,
            delay_days: 3,
            channel: 'email',
            angle: 'solution_fit',
            tone: 'consultative',
            instructions: 'Connect their pain to a specific capability. Don\'t list features - explain how one thing solves their specific problem. Reference what you asked in step 1.',
          },
          {
            step_number: 3,
            delay_days: 5,
            channel: 'email',
            angle: 'social_proof',
            tone: 'peer_proof',
            instructions: 'Share how a similar operation solved the same problem. Use specific numbers if available. "They were dealing with the same thing - here\'s what changed."',
          },
          {
            step_number: 4,
            delay_days: 4,
            channel: 'email',
            angle: 'roi_savings',
            tone: 'direct',
            instructions: 'Now bring the ROI data. Show what their savings would look like based on their volume. Make the financial case concrete. Include a specific ask for 15 minutes.',
          },
          {
            step_number: 5,
            delay_days: 7,
            channel: 'email',
            angle: 'final_value',
            tone: 'casual',
            instructions: 'Brief, warm close. Acknowledge they\'re busy. Offer one last easy path forward. "No worries either way - just wanted to make sure this was on your radar."',
          },
        ],
      },
      C: {
        name: 'Growth-Led',
        description: 'Lead with scaling fleet and multi-location potential, infrastructure proof, strategic partnership positioning',
        steps: [
          {
            step_number: 1,
            delay_days: 0,
            channel: 'email',
            angle: 'growth_opportunity',
            tone: 'consultative',
            instructions: 'Open by referencing their multi-location or high-volume growth trajectory. Ask about their plan for scaling delivery across locations. Position Shipday as infrastructure that grows with them. 2-3 sentences. End with "any thoughts?"',
          },
          {
            step_number: 2,
            delay_days: 3,
            channel: 'email',
            angle: 'social_proof',
            tone: 'peer_proof',
            instructions: 'Share how a similar multi-location operation standardized delivery across all stores with one platform. Focus on fleet coordination and real-time visibility. Keep it concrete - specific numbers if possible.',
          },
          {
            step_number: 3,
            delay_days: 5,
            channel: 'email',
            angle: 'solution_fit',
            tone: 'consultative',
            instructions: 'Show how the infrastructure handles scale - route optimization across locations, centralized dispatch, fleet management. Frame it as strategic infrastructure, not just software. One capability, one outcome.',
          },
          {
            step_number: 4,
            delay_days: 4,
            channel: 'email',
            angle: 'roi_savings',
            tone: 'direct',
            instructions: 'Bring the numbers. Show cost-per-delivery at their volume vs. third-party. Frame it as strategic partnership - "at your scale, the math is pretty clear." Include a specific ask for 15 minutes.',
          },
          {
            step_number: 5,
            delay_days: 7,
            channel: 'email',
            angle: 'final_value',
            tone: 'casual',
            instructions: 'Quick strategic close. One sentence about what infrastructure-level delivery management means for their growth. "Does that resonate?" Easy, no-pressure out.',
          },
        ],
      },
    },
  },
  {
    name: 'Mid-Market / Growth',
    tier_key: 'tier_2',
    variants: {
      A: {
        name: 'Growth-Led',
        description: 'Lead with growth potential, show how to scale delivery without scaling costs',
        steps: [
          {
            step_number: 1,
            delay_days: 0,
            channel: 'email',
            angle: 'growth_opportunity',
            tone: 'consultative',
            instructions: 'Open with an observation about their growth potential (new locations, expanding delivery radius, increasing order volume). Ask what\'s holding them back from scaling delivery. 2-3 sentences.',
          },
          {
            step_number: 2,
            delay_days: 3,
            channel: 'email',
            angle: 'roi_savings',
            tone: 'peer_proof',
            instructions: 'Show the math on scaling delivery without scaling costs. Reference their estimated order volume. Compare third-party commission costs vs. in-house with Shipday.',
          },
          {
            step_number: 3,
            delay_days: 5,
            channel: 'email',
            angle: 'case_study',
            tone: 'peer_proof',
            instructions: 'Share a mid-market success story. Focus on the growth trajectory - where they started vs. where they are now. Make it relatable to their size and cuisine type.',
          },
          {
            step_number: 4,
            delay_days: 4,
            channel: 'email',
            angle: 'product_demo',
            tone: 'direct',
            instructions: 'Highlight the features that matter for growth-stage operations (dispatch automation, customer notifications, analytics). Offer a quick walkthrough. Keep the ask light.',
          },
          {
            step_number: 5,
            delay_days: 7,
            channel: 'email',
            angle: 'final_value',
            tone: 'casual',
            instructions: 'Quick note. One sentence on what they\'d gain. Easy out. "Totally understand if the timing isn\'t right - just wanted to make sure you had this option."',
          },
        ],
      },
      B: {
        name: 'Efficiency-Led',
        description: 'Lead with operational efficiency, reduce chaos in delivery management',
        steps: [
          {
            step_number: 1,
            delay_days: 0,
            channel: 'email',
            angle: 'pain_point',
            tone: 'empathetic',
            instructions: 'Open with the mid-market chaos - juggling multiple delivery platforms, manual dispatch, no visibility into driver locations. Ask about their current delivery workflow. 2-3 sentences.',
          },
          {
            step_number: 2,
            delay_days: 3,
            channel: 'email',
            angle: 'solution_fit',
            tone: 'consultative',
            instructions: 'Show how consolidating delivery management into one platform eliminates the chaos from step 1. One specific feature, one specific benefit. Not a feature dump.',
          },
          {
            step_number: 3,
            delay_days: 5,
            channel: 'email',
            angle: 'social_proof',
            tone: 'peer_proof',
            instructions: 'Share a testimonial or case study from a similar mid-market operation. Focus on time saved and errors eliminated, not just cost savings.',
          },
          {
            step_number: 4,
            delay_days: 4,
            channel: 'email',
            angle: 'roi_savings',
            tone: 'direct',
            instructions: 'Quantify the efficiency gains. Time saved per week, orders recovered, customer satisfaction impact. Make it tangible with their numbers. Include a specific ask.',
          },
          {
            step_number: 5,
            delay_days: 7,
            channel: 'email',
            angle: 'final_value',
            tone: 'casual',
            instructions: 'Friendly close. Acknowledge the busy season. Offer to help whenever timing works. No pressure.',
          },
        ],
      },
      C: {
        name: 'Revenue-Recovery',
        description: 'Lead with commission losses from third-party platforms, hybrid model pitch, revenue recapture framing',
        steps: [
          {
            step_number: 1,
            delay_days: 0,
            channel: 'email',
            angle: 'competitor_comparison',
            tone: 'consultative',
            instructions: 'Open with the commission bleed - how much they are losing to third-party platforms per month. Use their estimated order volume to make it concrete. Ask "what would you be able to do with $X more per month?" 2-3 sentences.',
          },
          {
            step_number: 2,
            delay_days: 3,
            channel: 'email',
            angle: 'roi_savings',
            tone: 'direct',
            instructions: 'Break down the revenue recovery math. Show the split - keep third-party for discovery, own delivery for repeat customers. "You don\'t have to drop the apps. Just keep more of what you earn." Use their numbers.',
          },
          {
            step_number: 3,
            delay_days: 5,
            channel: 'email',
            angle: 'case_study',
            tone: 'peer_proof',
            instructions: 'Share a mid-market restaurant that recovered revenue by adding their own delivery alongside third-party. Focus on the hybrid model success. Specific numbers on commission savings.',
          },
          {
            step_number: 4,
            delay_days: 4,
            channel: 'email',
            angle: 'solution_fit',
            tone: 'consultative',
            instructions: 'Show how the hybrid model works in practice - same kitchen, two channels, one management platform. Address the concern that it sounds complicated. It isn\'t. Offer a 15-minute walkthrough.',
          },
          {
            step_number: 5,
            delay_days: 7,
            channel: 'email',
            angle: 'final_value',
            tone: 'casual',
            instructions: 'Quick close. Restate the monthly savings number in one sentence. "What would you be able to do with X more orders a month?" Leave the door open.',
          },
        ],
      },
    },
  },
  {
    name: 'SMB / New to Delivery',
    tier_key: 'tier_3',
    variants: {
      A: {
        name: 'Simplicity-Led',
        description: 'Lead with how easy it is to start, lower the barrier to entry',
        steps: [
          {
            step_number: 1,
            delay_days: 0,
            channel: 'email',
            angle: 'ease_of_use',
            tone: 'friendly',
            instructions: 'Open warm and simple. Acknowledge they might be new to delivery or doing it manually. Position Shipday as the easiest way to get started. One question about their current setup. 2-3 sentences.',
          },
          {
            step_number: 2,
            delay_days: 3,
            channel: 'email',
            angle: 'social_proof',
            tone: 'peer_proof',
            instructions: 'Share a story of a small restaurant that started delivery with Shipday. Focus on how quick the setup was and the immediate impact. Keep it relatable to a small operation.',
          },
          {
            step_number: 3,
            delay_days: 5,
            channel: 'email',
            angle: 'roi_savings',
            tone: 'consultative',
            instructions: 'Show the cost comparison - third-party commissions vs. Shipday. Keep the math simple. "At your size, you\'d save roughly $X/month." Use their estimated volume.',
          },
          {
            step_number: 4,
            delay_days: 4,
            channel: 'email',
            angle: 'product_demo',
            tone: 'friendly',
            instructions: 'Offer to walk them through it. Emphasize it takes 10 minutes to set up. Lower every barrier. "Happy to hop on a quick call and get you set up."',
          },
          {
            step_number: 5,
            delay_days: 7,
            channel: 'email',
            angle: 'final_value',
            tone: 'casual',
            instructions: 'Super casual. "Hey, just checking in. If delivery is something you\'re thinking about, happy to help whenever." Leave the door open.',
          },
        ],
      },
      B: {
        name: 'Competitor-Switch',
        description: 'Target businesses already using third-party delivery, show the savings of switching',
        steps: [
          {
            step_number: 1,
            delay_days: 0,
            channel: 'email',
            angle: 'competitor_comparison',
            tone: 'consultative',
            instructions: 'Reference their likely use of DoorDash/UberEats/Grubhub. Ask what they\'re paying in commissions. Position the conversation around keeping more revenue. 2-3 sentences.',
          },
          {
            step_number: 2,
            delay_days: 3,
            channel: 'email',
            angle: 'roi_savings',
            tone: 'direct',
            instructions: 'Show the commission math. "If you\'re doing X orders through [platform], that\'s $Y/month in commissions. Here\'s what it looks like with your own delivery." Be specific.',
          },
          {
            step_number: 3,
            delay_days: 5,
            channel: 'email',
            angle: 'case_study',
            tone: 'peer_proof',
            instructions: 'Share a story of a restaurant that switched from third-party to their own delivery. Focus on the revenue they kept and the customer relationships they built.',
          },
          {
            step_number: 4,
            delay_days: 4,
            channel: 'email',
            angle: 'solution_fit',
            tone: 'friendly',
            instructions: 'Explain you\'re not saying drop the apps entirely - show how hybrid works. Keep third-party for discovery, own delivery for repeat customers. Offer a 15-min walkthrough.',
          },
          {
            step_number: 5,
            delay_days: 7,
            channel: 'email',
            angle: 'final_value',
            tone: 'casual',
            instructions: 'Quick last touch. One line about how much they could save. Easy, no-commitment close. "Whenever you\'re ready, I\'m around."',
          },
        ],
      },
      C: {
        name: 'Local-Growth',
        description: 'Lead with neighborhood reach and repeat customer potential, community-driven growth',
        steps: [
          {
            step_number: 1,
            delay_days: 0,
            channel: 'email',
            angle: 'growth_opportunity',
            tone: 'friendly',
            instructions: 'Open warm. Talk about their neighborhood reach - the regulars, the repeat orders, the people within a few miles who already love their food. Ask if they have thought about offering delivery to those customers directly. 2-3 sentences. "Does that resonate?"',
          },
          {
            step_number: 2,
            delay_days: 3,
            channel: 'email',
            angle: 'social_proof',
            tone: 'peer_proof',
            instructions: 'Share a story of a small local restaurant that started delivery and saw repeat customers order more often. Focus on the relationship angle - customers already love the food, delivery just makes it easier. Keep it relatable.',
          },
          {
            step_number: 3,
            delay_days: 5,
            channel: 'email',
            angle: 'roi_savings',
            tone: 'consultative',
            instructions: 'Simple math - what they are paying third-party apps vs. what they would keep with their own delivery. Keep it small and real. "Even at your size, that\'s $X/month back in your pocket." Use their estimated volume.',
          },
          {
            step_number: 4,
            delay_days: 4,
            channel: 'email',
            angle: 'ease_of_use',
            tone: 'friendly',
            instructions: 'Lower every barrier. 10 minutes to set up. No contracts. Works with their existing flow. Offer a quick call - "happy to walk you through it, takes about 10 minutes." Any thoughts?',
          },
          {
            step_number: 5,
            delay_days: 7,
            channel: 'email',
            angle: 'final_value',
            tone: 'casual',
            instructions: 'Super casual close. "Just checking in - if delivery is something you are thinking about for your regulars, happy to help whenever." Leave the door wide open.',
          },
        ],
      },
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Multi-Channel Campaign Templates (Session 9: Campaign Integration)
// These blend email, AI chatbot, and AI voice agent into unified sequences.
// ═══════════════════════════════════════════════════════════════════════════════

export interface MultiChannelSequence {
  name: string;
  description: string;
  tier_keys: string[]; // Which tiers this applies to
  steps: LibraryStep[];
}

export const MULTI_CHANNEL_SEQUENCES: MultiChannelSequence[] = [
  {
    name: 'Email → AI Chat → AI Call → Human',
    description: 'Full-funnel: warm up with email, engage via AI chat, qualify via AI call, close with human',
    tier_keys: ['tier_1', 'tier_2'],
    steps: [
      {
        step_number: 1,
        delay_days: 0,
        channel: 'email',
        angle: 'roi_savings',
        tone: 'consultative',
        instructions: 'Lead with their specific ROI projection. Include a tracked link to the AI chat widget. End with "Curious what your numbers look like? Chat with our ROI advisor here →"',
      },
      {
        step_number: 2,
        delay_days: 3,
        channel: 'ai_chat',
        angle: 'roi_savings',
        tone: 'consultative',
        instructions: 'AI chat follow-up for leads who did not engage with step 1. Widget link sent via email with campaign context.',
        ai_chat_greeting: "Hey! I noticed you were checking out our delivery cost analysis. Want me to run the numbers for your operation? Takes about 2 minutes.",
        trigger_condition: 'no_response',
      },
      {
        step_number: 3,
        delay_days: 2,
        channel: 'ai_chat',
        angle: 'pain_point',
        tone: 'empathetic',
        instructions: 'For leads who opened but did not reply or chat. Different angle - lead with pain point.',
        ai_chat_greeting: "Hi there! I work with restaurants doing {estimated_volume} deliveries a week. Quick question — what's your biggest headache with delivery right now?",
        trigger_condition: 'multi_open',
      },
      {
        step_number: 4,
        delay_days: 3,
        channel: 'ai_call',
        angle: 'product_demo',
        tone: 'direct',
        instructions: 'AI voice call for warm leads who engaged via chat or clicked email links. Voice agent opens with campaign context and prior conversation summary.',
        ai_call_context: 'This prospect engaged with our email campaign and/or chatbot. Reference any qualification data gathered. Focus on scheduling a demo.',
        trigger_condition: 'email_clicked',
      },
      {
        step_number: 5,
        delay_days: 4,
        channel: 'email',
        angle: 'final_value',
        tone: 'casual',
        instructions: 'Final email with summary of all value discussed. Reference any chat or call interactions. Calendly link for easy booking.',
      },
    ],
  },
  {
    name: 'Quick Engage: Email → AI Chat',
    description: 'Lightweight 3-step: email opener, AI chat for qualification, follow-up email',
    tier_keys: ['tier_2', 'tier_3'],
    steps: [
      {
        step_number: 1,
        delay_days: 0,
        channel: 'email',
        angle: 'ease_of_use',
        tone: 'friendly',
        instructions: 'Warm intro email with link to AI chat widget. Position the chat as a quick way to explore if delivery management makes sense for them.',
      },
      {
        step_number: 2,
        delay_days: 2,
        channel: 'ai_chat',
        angle: 'ease_of_use',
        tone: 'friendly',
        instructions: 'AI chat for leads who opened step 1. Lightweight qualification - just orders/week and current setup.',
        ai_chat_greeting: "Hey! Saw you checked out our delivery platform. Happy to answer any questions — what kind of food do you serve?",
        trigger_condition: 'always',
      },
      {
        step_number: 3,
        delay_days: 5,
        channel: 'email',
        angle: 'social_proof',
        tone: 'peer_proof',
        instructions: 'Follow up with social proof. If chat happened, reference what was discussed. If not, standalone value email.',
      },
    ],
  },
  {
    name: 'Warm Reply → AI Call',
    description: 'Trigger AI voice call when a prospect replies positively to any campaign email',
    tier_keys: ['tier_1', 'tier_2', 'tier_3'],
    steps: [
      {
        step_number: 1,
        delay_days: 0,
        channel: 'ai_call',
        angle: 'product_demo',
        tone: 'consultative',
        instructions: 'Triggered when prospect sends a positive reply. AI calls within business hours. Opens by acknowledging their reply and specific interest.',
        ai_call_context: 'This prospect replied positively to a campaign email. Reference their reply content and show you understood their interest. Goal: book a demo call with a human rep.',
        trigger_condition: 'positive_reply',
      },
    ],
  },
];

/**
 * Get a specific tier's campaign definitions.
 */
export function getTierCampaign(tierKey: string): LibraryTier | undefined {
  return CAMPAIGN_LIBRARY.find(t => t.tier_key === tierKey);
}

/**
 * Get all tier keys available in the library.
 */
export function getAvailableTiers(): string[] {
  return CAMPAIGN_LIBRARY.map(t => t.tier_key);
}

/**
 * Get multi-channel sequences applicable to a specific tier.
 */
export function getMultiChannelSequences(tierKey: string): MultiChannelSequence[] {
  return MULTI_CHANNEL_SEQUENCES.filter(s => s.tier_keys.includes(tierKey));
}

/**
 * Get all available multi-channel sequence names.
 */
export function getAvailableMultiChannelSequences(): string[] {
  return MULTI_CHANNEL_SEQUENCES.map(s => s.name);
}

/**
 * Build campaign chat link URL with tracking context.
 * This URL is embedded in campaign emails to direct prospects to the AI chatbot.
 */
export function buildCampaignChatLink(params: {
  baseUrl: string;
  leadId: number;
  campaignTemplateId: number;
  stepNumber: number;
  angle: string;
  tier: string;
  orgSlug?: string;
}): string {
  const searchParams = new URLSearchParams({
    lead_id: String(params.leadId),
    cid: String(params.campaignTemplateId),
    step: String(params.stepNumber),
    angle: params.angle,
    tier: params.tier,
    src: 'campaign',
  });
  const slug = params.orgSlug || 'shipday';
  return `${params.baseUrl}/chat?${searchParams.toString()}&org=${slug}`;
}

/**
 * Determine the recommended next action for a lead based on their engagement signals.
 */
export function getRecommendedNextChannel(engagement: {
  email_opens: number;
  email_clicks: number;
  email_replies: number;
  chat_sessions: number;
  chat_qualified: boolean;
  voice_calls: number;
  voice_qualified: boolean;
  reply_sentiment: string | null;
}): 'ai_chat' | 'ai_call' | 'human_call' | 'email' {
  // Positive reply → AI call immediately
  if (engagement.email_replies > 0 && engagement.reply_sentiment === 'positive') {
    return 'ai_call';
  }
  // Chat qualified → human call
  if (engagement.chat_qualified) {
    return 'human_call';
  }
  // Voice qualified → human call
  if (engagement.voice_qualified) {
    return 'human_call';
  }
  // Clicked links → AI chat
  if (engagement.email_clicks > 0) {
    return 'ai_chat';
  }
  // Multiple opens → AI chat
  if (engagement.email_opens >= 3) {
    return 'ai_chat';
  }
  // Default to email
  return 'email';
}
