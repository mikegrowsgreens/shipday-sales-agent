// ─── CRM Core Types ──────────────────────────────────────────────────────────

export type LifecycleStage =
  | 'raw'
  | 'enriched'
  | 'outreach'
  | 'engaged'
  | 'demo_completed'
  | 'negotiation'
  | 'won'
  | 'lost'
  | 'nurture';

export type Channel = 'email' | 'phone' | 'linkedin' | 'sms' | 'calendly' | 'fathom' | 'manual';

export type StepType = 'email' | 'phone' | 'linkedin' | 'sms' | 'manual';

export type EnrollmentStatus = 'active' | 'paused' | 'completed' | 'replied' | 'booked';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export type TaskType = 'call' | 'linkedin_connect' | 'linkedin_message' | 'linkedin_view' | 'sms' | 'manual' | 'email_review';

// ─── Contact ─────────────────────────────────────────────────────────────────

export interface Contact {
  contact_id: number;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  title: string | null;
  linkedin_url: string | null;
  website: string | null;
  lifecycle_stage: LifecycleStage;
  lead_score: number;
  engagement_score: number;
  bdr_lead_id: string | null;
  shipday_deal_id: string | null;
  wincall_deal_id: string | null;
  li_prospect_id: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ─── Touchpoint ──────────────────────────────────────────────────────────────

export interface Touchpoint {
  touchpoint_id: number;
  contact_id: number;
  channel: Channel;
  event_type: string;
  direction: 'inbound' | 'outbound';
  source_system: string;
  subject: string | null;
  body_preview: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
}

// ─── Sequences ───────────────────────────────────────────────────────────────

export type BranchCondition =
  | 'opened'
  | 'not_opened'
  | 'replied'
  | 'replied_positive'
  | 'replied_negative'
  | 'bounced'
  | 'clicked'
  | 'no_engagement';

export type ExitAction = 'complete' | 'create_task' | 'move_to_sequence';

export type TemplateCategory =
  | 'cold_outreach'
  | 'follow_up'
  | 'nurture'
  | 'event'
  | 're_engagement'
  | 'onboarding';

export interface Sequence {
  sequence_id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  pause_on_reply: boolean;
  pause_on_booking: boolean;
  is_template: boolean;
  template_category: TemplateCategory | null;
  cloned_from: number | null;
  tags: string[];
  total_steps: number;
  enrolled_count: number;
  created_at: string;
  updated_at: string;
}

export interface SequenceStep {
  step_id: number;
  sequence_id: number;
  step_order: number;
  step_type: StepType;
  delay_days: number;
  send_window_start: string | null;
  send_window_end: string | null;
  subject_template: string | null;
  body_template: string | null;
  task_instructions: string | null;
  variant_label: string | null;
  // Branching
  parent_step_id: number | null;
  branch_condition: BranchCondition | null;
  branch_wait_days: number;
  // Exit step
  is_exit_step: boolean;
  exit_action: ExitAction | null;
  exit_action_config: Record<string, unknown>;
  created_at: string;
}

export interface SequenceEnrollment {
  enrollment_id: number;
  contact_id: number;
  sequence_id: number;
  status: EnrollmentStatus;
  current_step: number;
  current_step_id: number | null;
  next_step_at: string | null;
  paused_reason: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  business_name?: string;
}

export interface SequenceStepExecution {
  execution_id: number;
  enrollment_id: number;
  step_id: number;
  status: 'pending' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'replied' | 'bounced' | 'failed' | 'completed' | 'skipped';
  gmail_message_id: string | null;
  twilio_sid: string | null;
  variant_label: string | null;
  error_message: string | null;
  executed_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  replied_at: string | null;
  bounced_at: string | null;
  reply_sentiment: string | null;
  created_at: string;
}

// Per-step aggregated metrics
export interface StepMetrics {
  step_id: number;
  step_order?: number;
  step_type?: string;
  branch_condition?: string | null;
  total_executions: number;
  sent_count: number;
  opened_count: number;
  clicked_count: number;
  replied_count: number;
  bounced_count: number;
  failed_count: number;
  skipped_count: number;
  open_rate: number;
  reply_rate: number;
  click_rate: number;
}

// ─── Flow Editor Types ──────────────────────────────────────────────────────

export interface FlowStep {
  id: string; // temp_X for new, step_id for saved
  parentId: string | null;
  branchCondition: BranchCondition | null;
  branchWaitDays: number;
  stepType: StepType;
  delayDays: number;
  sendWindowStart: string;
  sendWindowEnd: string;
  subjectTemplate: string;
  bodyTemplate: string;
  taskInstructions: string;
  variantLabel: string;
  isExitStep: boolean;
  exitAction: ExitAction | null;
  exitActionConfig: Record<string, unknown>;
  metrics?: StepMetrics;
}

export interface SequenceAnalyticsData {
  sequence_id: number;
  total_enrolled: number;
  active_enrolled: number;
  completed: number;
  replied: number;
  booked: number;
  avg_completion_rate: number;
  step_metrics: StepMetrics[];
}

// ─── Task Queue ──────────────────────────────────────────────────────────────

export interface Task {
  task_id: number;
  contact_id: number;
  enrollment_id: number | null;
  step_id: number | null;
  task_type: TaskType;
  title: string;
  instructions: string | null;
  priority: number;
  status: TaskStatus;
  outcome: string | null;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  // joined fields
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  business_name?: string;
}

// ─── Calendly ────────────────────────────────────────────────────────────────

export interface CalendlyEvent {
  calendly_id: number;
  contact_id: number | null;
  event_type: string | null;
  event_name: string | null;
  invitee_name: string | null;
  invitee_email: string | null;
  scheduled_at: string;
  duration_minutes: number | null;
  location: string | null;
  cancelled: boolean;
  cancel_reason: string | null;
  calendly_event_uri: string | null;
  created_at: string;
}

// ─── SMS ─────────────────────────────────────────────────────────────────────

export interface SmsMessage {
  sms_id: number;
  contact_id: number | null;
  direction: 'inbound' | 'outbound';
  from_number: string;
  to_number: string;
  body: string;
  twilio_sid: string | null;
  status: string;
  created_at: string;
}

// ─── Shipday Signups ─────────────────────────────────────────────────────────

export interface ShipdaySignup {
  signup_id: number;
  business_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  plan_type: string | null;
  state: string | null;
  city: string | null;
  phone_area_code: number | null;
  territory_match: boolean;
  shipday_account_id: string | null;
  signup_date: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ─── Dashboard Stats ─────────────────────────────────────────────────────────

export interface DashboardStats {
  total_contacts: number;
  active_sequences: number;
  pending_tasks: number;
  emails_sent_7d: number;
  open_rate_7d: number;
  reply_rate_7d: number;
  demos_booked_7d: number;
  pipeline_value: number;
  contacts_by_stage: Record<LifecycleStage, number>;
  touchpoints_by_channel: Record<Channel, number>;
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface FunnelStep {
  stage: string;
  count: number;
  conversion_rate: number;
}

export interface ChannelMetric {
  channel: Channel;
  sent: number;
  delivered: number;
  opened: number;
  replied: number;
  booked: number;
}

export interface TrendPoint {
  date: string;
  count: number;
  channel?: Channel;
}

// ─── API Response Wrappers ───────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  error?: never;
}

export interface ApiError {
  data?: never;
  error: string;
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

// ─── BDR Lead Types ─────────────────────────────────────────────────────────

export type BdrLeadStatus =
  | 'raw'
  | 'enriched'
  | 'scored'
  | 'email_ready'
  | 'approved'
  | 'sent'
  | 'replied'
  | 'demo_opportunity'
  | 'won'
  | 'lost'
  | 'rejected'
  | 'hold'
  | 'bounced';

export type EmailAngle =
  | 'missed_calls'
  | 'commission_savings'
  | 'delivery_ops'
  | 'tech_consolidation'
  | 'customer_experience';

export interface BdrLead {
  lead_id: string;
  business_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  cuisine_type: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  market_type: string | null;
  tier: string | null;
  status: BdrLeadStatus;
  total_score: number | null;
  contact_quality_score: number | null;
  business_strength_score: number | null;
  delivery_potential_score: number | null;
  tech_stack_score: number | null;
  win_pattern_score: number | null;
  mrr_potential_score: number | null;
  email_subject: string | null;
  email_body: string | null;
  email_angle: EmailAngle | null;
  email_variant_id: string | null;
  campaign_template_id: number | null;
  campaign_step: number | null;
  has_replied: boolean;
  reply_sentiment: string | null;
  reply_summary: string | null;
  reply_date: string | null;
  created_at: string;
  updated_at: string;
}

export type CampaignEmailStatus = 'pending' | 'scheduled' | 'ready' | 'sent' | 'skipped';

export interface CampaignEmail {
  id: number;
  lead_id: number;
  template_id: number;
  step_number: number;
  channel: string;
  delay_days: number;
  angle: string | null;
  tone: string | null;
  subject: string | null;
  body: string | null;
  status: CampaignEmailStatus;
  scheduled_at: string | null;
  sent_at: string | null;
}

export interface BdrEmailSend {
  send_id: number;
  lead_id: number;
  gmail_message_id: string | null;
  subject: string | null;
  angle: string | null;
  sent_at: string | null;
  open_count: number;
  replied: boolean;
  reply_date: string | null;
  business_name?: string;
  contact_email?: string;
}

export interface BdrScrapingJob {
  job_id: number;
  source: string | null;
  status: string;
  total_found: number;
  total_processed: number;
  created_at: string;
  completed_at: string | null;
}

// ─── Shipday Deal Types ─────────────────────────────────────────────────────

export interface ShipdayDeal {
  deal_id: number;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  business_name: string | null;
  stage: string | null;
  pain_points: string | null;
  demo_notes: string | null;
  demo_date: string | null;
  monthly_deliveries: number | null;
  current_solution: string | null;
  // Touch tracking (1-7)
  touch1_status: string | null;
  touch1_draft: string | null;
  touch2_status: string | null;
  touch2_draft: string | null;
  touch3_status: string | null;
  touch3_draft: string | null;
  touch4_status: string | null;
  touch4_draft: string | null;
  touch5_status: string | null;
  touch5_draft: string | null;
  touch6_status: string | null;
  touch6_draft: string | null;
  touch7_status: string | null;
  touch7_draft: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShipdayEmailDraft {
  draft_id: number;
  deal_id: number;
  touch_number: number;
  subject: string | null;
  body: string | null;
  status: 'draft' | 'approved' | 'sent' | 'rejected';
  send_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Brain Types ────────────────────────────────────────────────────────────

export interface BrainInsight {
  insight_id: number;
  insight_type: string;
  description: string;
  confidence: number;
  recommended_action: string | null;
  created_at: string;
}

export interface BrainContent {
  content_id: number;
  content_type: string;
  title: string;
  key_claims: string | null;
  is_active: boolean;
  effective_date: string | null;
}

// ─── AI Generation Types ────────────────────────────────────────────────────

export interface GeneratedEmail {
  subject: string;
  body: string;
}

export interface GeneratedStep {
  step_type: string;
  delay_days: number;
  subject_template: string;
  body_template: string;
  task_instructions: string;
  send_window_start: string;
  send_window_end: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Engagement Adaptive Types ──────────────────────────────────────────────

export type EngagementSignal = 'no_opens' | 'opened_no_reply' | 'clicked' | 'multi_open' | 'normal';

export type BranchAction =
  | 'switch_channel'  // Change to call/linkedin instead of email
  | 'change_angle'    // Try a different email angle
  | 'regenerate'      // Regenerate email with engagement context
  | 'accelerate'      // Send next step sooner
  | 'direct_cta'      // Use a more direct call-to-action
  | 'skip';           // Skip this step entirely

export interface BranchRule {
  action: BranchAction;
  channel?: string;       // For switch_channel
  angle?: string;         // For change_angle
  tone?: string;          // For regenerate/direct_cta
  reduce_delay_days?: number; // For accelerate
}

export interface StepBranchRules {
  no_opens?: BranchRule;
  opened_no_reply?: BranchRule;
  clicked?: BranchRule;
  multi_open?: BranchRule;
}

export interface EngagementProfile {
  signal: EngagementSignal;
  total_sends: number;
  total_opens: number;
  total_clicks: number;
  has_replied: boolean;
  last_open_at: string | null;
  last_click_at: string | null;
  open_rate: number;       // 0-100
  most_opened_angle: string | null;
}

// ─── Campaign Queue Types ───────────────────────────────────────────────────

export interface CampaignFilter {
  status?: BdrLeadStatus;
  angle?: EmailAngle;
  tier?: string;
  search?: string;
}

// ─── Unified Inbox Types ────────────────────────────────────────────────────

export type InboxStatus = 'active' | 'archived' | 'snoozed';

export interface InboxItem extends Touchpoint {
  inbox_status: InboxStatus;
  snoozed_until: string | null;
  contact_name: string | null;
  contact_email: string | null;
  business_name: string | null;
  lifecycle_stage: LifecycleStage;
}

// ─── Saved Segments ─────────────────────────────────────────────────────────

export interface SavedSegment {
  segment_id: number;
  name: string;
  description: string | null;
  filters: SegmentFilters;
  contact_count: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface SegmentFilters {
  stages?: LifecycleStage[];
  tags?: string[];
  search?: string;
  score_min?: number;
  score_max?: number;
  channels?: Channel[];
  has_email?: boolean;
  has_phone?: boolean;
  created_after?: string;
  created_before?: string;
}

// ─── Contact Merge ──────────────────────────────────────────────────────────

export interface ContactMerge {
  merge_id: number;
  winner_id: number;
  loser_id: number;
  loser_snapshot: Record<string, unknown>;
  merged_fields: string[];
  created_at: string;
}

export interface DuplicateGroup {
  match_type: 'email' | 'phone' | 'business';
  match_value: string;
  contacts: Contact[];
}

// ─── Lifecycle Automation ───────────────────────────────────────────────────

export type LifecycleActionType = 'enroll_sequence' | 'create_task' | 'add_tag' | 'webhook';

export interface LifecycleRule {
  rule_id: number;
  name: string;
  from_stage: LifecycleStage;
  to_stage: LifecycleStage;
  action_type: LifecycleActionType;
  action_config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

// ─── Activity Feed ──────────────────────────────────────────────────────────

export interface ActivityFeedItem {
  touchpoint_id: number;
  contact_id: number;
  contact_name: string | null;
  business_name: string | null;
  channel: Channel;
  event_type: string;
  direction: 'inbound' | 'outbound';
  subject: string | null;
  body_preview: string | null;
  occurred_at: string;
}
