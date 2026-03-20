/**
 * Org-level configuration helper.
 * Provides dynamic per-org configuration for multi-tenant operation.
 */

import { queryOne } from './db';
import { requireTenantSession } from './tenant';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OrgPersona {
  sender_name: string;
  sender_title: string;
  sender_email: string;
  calendly_url?: string;
}

export interface EmailAngleConfig {
  id: string;
  name: string;
  description: string;
}

export interface OrgBranding {
  logo_url: string;
  primary_color: string;
  app_name: string;
}

export interface OrgTerritory {
  area_codes: Record<string, number[]>;
}

export interface OrgFeatures {
  roi_calculator: boolean;
  territory_tracking: boolean;
  deal_followups: boolean;
  signup_tracking: boolean;
  prospect_chat: boolean;
}

export interface OrgUrls {
  default_redirect: string;
  roi_calculator?: string;
  case_studies?: string;
}

export interface ProductPlan {
  name: string;
  price: number;
  description: string;
}

export interface ProductKnowledge {
  plans: ProductPlan[];
  key_stats: Record<string, unknown>;
}

export interface OrgConfig {
  company_name: string;
  product_name: string;
  industry: string;
  persona: OrgPersona;
  value_props: string[];
  pain_points: string[];
  competitors: string[];
  email_angles: EmailAngleConfig[];
  product_knowledge?: ProductKnowledge;
  branding: OrgBranding;
  territory?: OrgTerritory;
  features: OrgFeatures;
  urls: OrgUrls;
}

// ─── Default Config (generic SalesHub) ─────────────────────────────────────

export const DEFAULT_CONFIG: OrgConfig = {
  company_name: 'SalesHub',
  product_name: 'SalesHub Platform',
  industry: 'SaaS',
  persona: {
    sender_name: 'Sales Team',
    sender_title: 'Business Development',
    sender_email: 'sales@example.com',
  },
  value_props: [],
  pain_points: [],
  competitors: [],
  email_angles: [],
  branding: {
    logo_url: '',
    primary_color: '#2563eb',
    app_name: 'SalesHub',
  },
  features: {
    roi_calculator: false,
    territory_tracking: false,
    deal_followups: true,
    signup_tracking: false,
    prospect_chat: false,
  },
  urls: {
    default_redirect: 'https://example.com',
  },
};

// ─── Config Loader ──────────────────────────────────────────────────────────

/**
 * Load org config by org_id. Falls back to defaults for missing fields.
 */
export async function getOrgConfig(orgId: number): Promise<OrgConfig> {
  const result = await queryOne<{ settings: OrgConfig }>(
    `SELECT settings FROM crm.organizations WHERE org_id = $1`,
    [orgId]
  );

  if (!result?.settings) return DEFAULT_CONFIG;

  // Merge with defaults so missing fields don't break things
  return {
    ...DEFAULT_CONFIG,
    ...result.settings,
    persona: { ...DEFAULT_CONFIG.persona, ...result.settings.persona },
    branding: { ...DEFAULT_CONFIG.branding, ...result.settings.branding },
    features: { ...DEFAULT_CONFIG.features, ...result.settings.features },
    urls: { ...DEFAULT_CONFIG.urls, ...result.settings.urls },
  };
}

/**
 * Load org config from the current session.
 * Throws 401 if no valid session.
 */
export async function getOrgConfigFromSession(): Promise<OrgConfig> {
  const tenant = await requireTenantSession();
  return getOrgConfig(tenant.org_id);
}

/**
 * Get the current org_id from session.
 * Throws 401 if no valid session.
 */
export async function getCurrentOrgId(): Promise<number> {
  const tenant = await requireTenantSession();
  return tenant.org_id;
}

// ─── Angle Helpers ──────────────────────────────────────────────────────────

/**
 * Build ANGLE_DESCRIPTIONS map from org config email_angles.
 */
export function buildAngleDescriptions(config: OrgConfig): Record<string, string> {
  const descriptions: Record<string, string> = {};
  for (const angle of config.email_angles) {
    descriptions[angle.id] = angle.description;
  }
  return descriptions;
}

// ─── Territory Helpers ──────────────────────────────────────────────────────

/**
 * Get all territory area codes as a flat array from org config.
 */
export function getTerritoryAreaCodes(config: OrgConfig): number[] {
  if (!config.territory?.area_codes) return [];
  return Object.values(config.territory.area_codes).flat();
}

/**
 * Check if a phone number is in the org's territory.
 * Returns true if no territory is configured (all contacts in territory).
 */
export function isInOrgTerritory(phone: string | null, config: OrgConfig): boolean {
  if (!phone) return false;
  const codes = getTerritoryAreaCodes(config);
  if (codes.length === 0) return true; // No territory = all in territory
  const cleaned = phone.replace(/\D/g, '');
  const areaCode = parseInt(cleaned.startsWith('1') ? cleaned.slice(1, 4) : cleaned.slice(0, 3));
  return codes.includes(areaCode);
}

/**
 * Get state from area code using org territory config.
 */
export function getStateFromOrgAreaCode(areaCode: number, config: OrgConfig): string | null {
  if (!config.territory?.area_codes) return null;
  for (const [state, codes] of Object.entries(config.territory.area_codes)) {
    if (codes.includes(areaCode)) return state;
  }
  return null;
}

// ─── Integration Config Helpers ─────────────────────────────────────────────

/**
 * Get Twilio config for an org. Falls back to env vars.
 */
export async function getTwilioConfig(orgId: number): Promise<{ accountSid: string; authToken: string; phoneNumber: string }> {
  const org = await queryOne<{ settings: Record<string, unknown> }>(
    `SELECT settings FROM crm.organizations WHERE org_id = $1`,
    [orgId]
  );
  const settings = org?.settings || {};
  const twilio = ((settings as Record<string, Record<string, Record<string, string>>>).integrations?.twilio || {}) as Record<string, string>;

  return {
    accountSid: twilio.account_sid || process.env.TWILIO_ACCOUNT_SID || '',
    authToken: twilio.auth_token || process.env.TWILIO_AUTH_TOKEN || '',
    phoneNumber: twilio.phone_number || process.env.TWILIO_PHONE_NUMBER || '',
  };
}

/**
 * Get SMTP config for an org. Falls back to env vars.
 */
export async function getSmtpConfig(orgId: number): Promise<{ host: string; port: number; user: string; pass: string }> {
  const org = await queryOne<{ settings: Record<string, unknown> }>(
    `SELECT settings FROM crm.organizations WHERE org_id = $1`,
    [orgId]
  );
  const settings = org?.settings || {};
  const smtp = (settings as Record<string, Record<string, string>>).smtp || {};

  return {
    host: smtp.host || process.env.SMTP_HOST || '',
    port: parseInt(smtp.port || process.env.SMTP_PORT || '587'),
    user: smtp.user || process.env.SMTP_USER || '',
    pass: smtp.pass || process.env.SMTP_PASS || '',
  };
}

/**
 * Get n8n base URL for an org. Falls back to env var then hardcoded default.
 */
export async function getN8nBaseUrl(orgId: number): Promise<string> {
  const org = await queryOne<{ settings: Record<string, unknown> }>(
    `SELECT settings FROM crm.organizations WHERE org_id = $1`,
    [orgId]
  );
  const settings = org?.settings || {};
  const integrations = (settings as Record<string, Record<string, string>>).integrations || {};

  return integrations.n8n_base_url || process.env.N8N_BASE_URL || 'https://automation.example.com';
}

/**
 * Get sender email for an org from config.persona.
 */
export async function getSenderEmail(orgId: number): Promise<string> {
  const config = await getOrgConfig(orgId);
  return config.persona.sender_email;
}
