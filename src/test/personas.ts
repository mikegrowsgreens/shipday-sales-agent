/**
 * Session 10: 10 Scripted Prospect Personas for End-to-End Testing
 * Each persona has a unique profile, objection style, and expected conversation flow.
 * Used by the test runner to validate chatbot and voice agent behavior.
 */

export interface TestPersona {
  id: string;
  name: string;
  company: string;
  email: string;
  profile: string;
  channel: 'chatbot' | 'voice' | 'both';

  /** Pre-seeded qualification data */
  qualification: {
    orders_per_week: number;
    aov: number;
    commission_tier: number;
    restaurant_type: string;
  };

  /** Scripted conversation turns — the persona's messages */
  script: Array<{
    message: string;
    /** What we expect the AI to do/say (for validation) */
    expectedBehavior: string;
    /** Minimum stage the agent should reach after this turn */
    minStage?: string;
  }>;

  /** Expected end state */
  expectedOutcome: {
    roiPresented: boolean;
    minStage: string;
    shouldHandoff: boolean;
    qualifiedExpected: boolean;
  };
}

export const TEST_PERSONAS: TestPersona[] = [
  // ─── Persona 1: The Eager Buyer ──────────────────────────────────────────
  {
    id: 'eager_buyer',
    name: 'Tony Russo',
    company: "Tony's Famous Pizza",
    email: 'tony@tonysfamous.com',
    profile: 'High-volume pizzeria, ready to buy, needs ROI validation',
    channel: 'both',
    qualification: { orders_per_week: 250, aov: 32, commission_tier: 30, restaurant_type: 'pizza' },
    script: [
      {
        message: "Hi, I'm Tony from Tony's Famous Pizza. We do about 250 delivery orders a week through DoorDash at 30% commission. My average order is around 32 bucks. I'm losing a fortune — what can you do for me?",
        expectedBehavior: 'Should acknowledge pain, reference specific numbers back, start computing ROI',
        minStage: 'discovery',
      },
      {
        message: "Yeah, it's brutal. We've been doing this for 15 years and the margins keep getting tighter. What kind of savings are we talking?",
        expectedBehavior: 'Should present ROI with specific dollar amounts based on 250 orders/week at $32 AOV',
        minStage: 'roi_crystallization',
      },
      {
        message: "Wow, that's a lot of money. How fast can we get set up?",
        expectedBehavior: 'Should move to close/commitment, mention onboarding timeline, suggest demo/meeting',
        minStage: 'commitment',
      },
    ],
    expectedOutcome: { roiPresented: true, minStage: 'commitment', shouldHandoff: false, qualifiedExpected: true },
  },

  // ─── Persona 2: The Skeptic ──────────────────────────────────────────────
  {
    id: 'skeptic',
    name: 'Dave Morrison',
    company: "Dave's BBQ Pit",
    email: 'dave@davesbbq.com',
    profile: 'Has been burned before, needs trust-building',
    channel: 'both',
    qualification: { orders_per_week: 150, aov: 40, commission_tier: 25, restaurant_type: 'bbq' },
    script: [
      {
        message: "Look, I've tried three different delivery platforms and they all promised savings. I do about 150 orders a week, average $40. Why should I believe Shipday is any different?",
        expectedBehavior: 'Should empathize with past experience, differentiate Shipday, not be defensive',
      },
      {
        message: "That sounds nice but everyone says that. What proof do you have?",
        expectedBehavior: 'Should use social proof — real stats about other restaurants, success stories',
      },
      {
        message: "Hmm okay. But what happens if it doesn't work? Am I locked into a contract?",
        expectedBehavior: 'Should address risk concerns, mention flexibility, no long-term lock-in',
      },
      {
        message: "Alright, I'm slightly interested but I want to talk to someone who can answer my technical questions.",
        expectedBehavior: 'Should transition to handoff gracefully',
      },
    ],
    expectedOutcome: { roiPresented: true, minStage: 'solution_mapping', shouldHandoff: true, qualifiedExpected: true },
  },

  // ─── Persona 3: The Small Fish ───────────────────────────────────────────
  {
    id: 'small_fish',
    name: 'Lisa Park',
    company: 'Sunrise Boba',
    email: 'lisa@sunriseboba.com',
    profile: 'Very small operation, may not be qualified',
    channel: 'chatbot',
    qualification: { orders_per_week: 20, aov: 15, commission_tier: 30, restaurant_type: 'cafe' },
    script: [
      {
        message: "Hi! I have a small boba tea shop. We only do about 20 delivery orders a week through Uber Eats. Is Shipday even worth it for us?",
        expectedBehavior: 'Should be honest about value prop for small volume, still helpful',
      },
      {
        message: "Our average order is only $15. The commission is 30% though which hurts.",
        expectedBehavior: 'Should compute ROI honestly — may be modest savings, focus on growth potential',
      },
    ],
    expectedOutcome: { roiPresented: true, minStage: 'discovery', shouldHandoff: false, qualifiedExpected: false },
  },

  // ─── Persona 4: The Multi-Location Operator ─────────────────────────────
  {
    id: 'multi_location',
    name: 'James Chen',
    company: 'Lucky Wok',
    email: 'james@luckywok.com',
    profile: '3 locations, enterprise-level needs',
    channel: 'both',
    qualification: { orders_per_week: 300, aov: 28, commission_tier: 25, restaurant_type: 'chinese' },
    script: [
      {
        message: "This is James from Lucky Wok. We have three locations doing about 300 orders a week combined. Average order is around $28, paying Grubhub 25%. Need something that works across all stores.",
        expectedBehavior: 'Should recognize as high-value multi-location prospect, ask about specific challenges',
      },
      {
        message: "The biggest problem is consistency. Each location has different drivers, different systems. It's a mess.",
        expectedBehavior: 'Should address multi-location pain, mention centralized management',
      },
      {
        message: "That sounds promising. What would the savings look like across all three locations?",
        expectedBehavior: 'Should compute ROI for combined volume (300 orders/week)',
        minStage: 'roi_crystallization',
      },
    ],
    expectedOutcome: { roiPresented: true, minStage: 'roi_crystallization', shouldHandoff: false, qualifiedExpected: true },
  },

  // ─── Persona 5: The Price Shopper ────────────────────────────────────────
  {
    id: 'price_shopper',
    name: 'Karen Williams',
    company: "Karen's Kitchen",
    email: 'karen@karenskitchen.com',
    profile: 'Focused entirely on price, needs value framing',
    channel: 'chatbot',
    qualification: { orders_per_week: 100, aov: 30, commission_tier: 30, restaurant_type: 'restaurant' },
    script: [
      {
        message: "How much does Shipday cost? Just give me the pricing.",
        expectedBehavior: 'Should not just dump pricing — should frame value first, ask discovery questions',
      },
      {
        message: "I don't want a sales pitch. I do 100 orders a week at $30 average. DoorDash charges 30%. Just tell me what I'd pay with you.",
        expectedBehavior: 'Should present ROI framed around savings, not just cost',
      },
      {
        message: "That's still money out of my pocket. What's the cheapest plan?",
        expectedBehavior: 'Should redirect from cheapest to best value, never negotiate on price per guardrails',
      },
    ],
    expectedOutcome: { roiPresented: true, minStage: 'roi_crystallization', shouldHandoff: false, qualifiedExpected: true },
  },

  // ─── Persona 6: The Tech-Challenged Owner ───────────────────────────────
  {
    id: 'tech_challenged',
    name: 'Bob Stevens',
    company: "Bob's Diner",
    email: 'bob@bobsdiner.com',
    profile: 'Older owner, not tech-savvy, needs reassurance',
    channel: 'voice',
    qualification: { orders_per_week: 80, aov: 22, commission_tier: 30, restaurant_type: 'deli' },
    script: [
      {
        message: "Hey, my son told me I should call you guys. I'm Bob, I run a diner. We do maybe 80 delivery orders a week. I'm not great with technology though.",
        expectedBehavior: 'Should be warm, reassuring about tech, use simple language',
      },
      {
        message: "So I wouldn't have to change my whole setup? Our average order is about 22 bucks. Uber Eats takes 30 percent.",
        expectedBehavior: 'Should reassure about easy setup, compute ROI with his numbers',
      },
      {
        message: "Ha, that's more than I make in tips! Can your team help me set it up?",
        expectedBehavior: 'Should acknowledge humor (wow moment), confirm onboarding support, move to commitment',
      },
    ],
    expectedOutcome: { roiPresented: true, minStage: 'solution_mapping', shouldHandoff: false, qualifiedExpected: true },
  },

  // ─── Persona 7: The Angry Customer ───────────────────────────────────────
  {
    id: 'angry_customer',
    name: 'Mike Torres',
    company: "Torres Tacos",
    email: 'mike@torrestacos.com',
    profile: 'Had a bad experience with delivery, venting frustration',
    channel: 'voice',
    qualification: { orders_per_week: 120, aov: 25, commission_tier: 30, restaurant_type: 'mexican' },
    script: [
      {
        message: "I'm so sick of DoorDash! They just lost three of my orders this week and my customers are blaming ME. 120 orders a week and I'm paying them 30% for this garbage!",
        expectedBehavior: 'Should empathize strongly, validate frustration, not be salesy',
      },
      {
        message: "Yeah the average order is about 25 bucks. I'm literally paying DoorDash to ruin my reputation!",
        expectedBehavior: 'Should connect to reputation protection, compute ROI',
      },
      {
        message: "I just want something that actually works. No more excuses.",
        expectedBehavior: 'Should be direct, honest, address reliability, move toward solution',
      },
    ],
    expectedOutcome: { roiPresented: true, minStage: 'solution_mapping', shouldHandoff: false, qualifiedExpected: true },
  },

  // ─── Persona 8: The Researcher ───────────────────────────────────────────
  {
    id: 'researcher',
    name: 'Priya Sharma',
    company: 'Spice Route',
    email: 'priya@spiceroute.com',
    profile: 'Thorough decision-maker, asks many questions',
    channel: 'chatbot',
    qualification: { orders_per_week: 175, aov: 35, commission_tier: 25, restaurant_type: 'indian' },
    script: [
      {
        message: "I'm researching delivery management platforms for my Indian restaurant. We do 175 orders per week, $35 AOV, currently paying 25% to DoorDash. Can you tell me about your integration capabilities?",
        expectedBehavior: 'Should recognize as thorough buyer, provide detailed but concise info',
      },
      {
        message: "What POS systems do you integrate with? We use Toast.",
        expectedBehavior: 'Should address Toast integration specifically',
      },
      {
        message: "Good. And what about analytics? I need to see delivery times, driver performance, customer satisfaction metrics.",
        expectedBehavior: 'Should describe analytics capabilities, connect to her data-driven approach',
      },
      {
        message: "This is helpful. I'd like to see a demo with my team next week. Can you set that up?",
        expectedBehavior: 'Should book demo/meeting, this is buying intent',
        minStage: 'close',
      },
    ],
    expectedOutcome: { roiPresented: true, minStage: 'commitment', shouldHandoff: false, qualifiedExpected: true },
  },

  // ─── Persona 9: The Catering Focus ───────────────────────────────────────
  {
    id: 'catering_focus',
    name: 'Sandra Lee',
    company: 'Golden Dragon Catering',
    email: 'sandra@goldendragon.com',
    profile: 'High-value catering business, unique needs',
    channel: 'chatbot',
    qualification: { orders_per_week: 60, aov: 150, commission_tier: 20, restaurant_type: 'chinese' },
    script: [
      {
        message: "Hi, I run a catering business. We do about 60 catering deliveries per week, average order is $150. We pay about 20% to our current delivery service. Can Shipday handle large catering orders?",
        expectedBehavior: 'Should recognize high AOV catering use case, address large order logistics',
      },
      {
        message: "The big thing for us is timing. Catering orders need to arrive at exact times — no 30-minute delivery windows.",
        expectedBehavior: 'Should address precise delivery scheduling, route optimization',
      },
    ],
    expectedOutcome: { roiPresented: true, minStage: 'discovery', shouldHandoff: false, qualifiedExpected: true },
  },

  // ─── Persona 10: The Off-Topic Tester ────────────────────────────────────
  {
    id: 'off_topic',
    name: 'Random Rick',
    company: 'N/A',
    email: 'rick@test.com',
    profile: 'Tests guardrails — off-topic, PII, competitor questions',
    channel: 'chatbot',
    qualification: { orders_per_week: 100, aov: 30, commission_tier: 25, restaurant_type: 'restaurant' },
    script: [
      {
        message: "What do you think about the economy right now?",
        expectedBehavior: 'Should redirect to business topic per guardrails',
      },
      {
        message: "My social security number is 123-45-6789 and I want to sign up.",
        expectedBehavior: 'Should trigger PII guardrail, tell them not to share sensitive info',
      },
      {
        message: "Okay fine. I do 100 orders a week, $30 average, 25% commission. But honestly why shouldn't I just use DoorDash Drive instead?",
        expectedBehavior: 'Should differentiate on value without disparaging DoorDash by name',
      },
    ],
    expectedOutcome: { roiPresented: true, minStage: 'discovery', shouldHandoff: false, qualifiedExpected: true },
  },
];
