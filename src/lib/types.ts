// ─── Newsletter Research Types ──────────────────────────────────────────────

export interface NewsletterInsight {
  id: number;
  source_subject: string;
  source_sender: string;
  source_date: string;
  insight_text: string;
  tags: string[];
  relevance_score: number;
  used_in_deals: string[];
  extracted_at: string;
}

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

export type StepType = 'email' | 'phone' | 'linkedin' | 'sms' | 'manual' | 'ai_chat' | 'ai_call';

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
  deal_id: string | null;
  external_deal_id: string | null;
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

// ─── Inbound Leads (Signups) ─────────────────────────────────────────────────

export interface InboundLead {
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
  external_account_id: string | null;
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

// Email angles are now dynamic per-org via config.email_angles.
// This type is kept for backward compatibility but angles can be any string.
export type EmailAngle = string;

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

// ─── Deal Types ─────────────────────────────────────────────────────────────

export interface FollowUpDeal {
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

export interface FollowUpEmailDraft {
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

// ─── Conversation Outcomes (Session 3) ──────────────────────────────────────

export type ConversationTerminalState = 'in_progress' | 'demo_booked' | 'lead_captured' | 'abandoned' | 'escalated';

export interface ConversationOutcome {
  id: string;
  conversation_id: string;
  org_id: number;
  started_at: string;
  ended_at: string | null;
  messages_count: number;
  qualification_completeness: number;
  demo_booked: boolean;
  lead_captured: boolean;
  abandonment_point: string | null;
  terminal_state: ConversationTerminalState;
  total_duration_seconds: number | null;
  qualification_slots: Record<string, unknown>;
  roi_presented: boolean;
  objections_raised: string[];
  effective_patterns: Array<{
    pattern_type: string;
    pattern_text: string;
    effectiveness: string;
  }>;
  visitor_context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ─── External Intelligence (Session 3) ──────────────────────────────────────

export type IntelType = 'competitor_mention' | 'pricing_intel' | 'feature_request' | 'market_trend' | 'prospect_pain';
export type IntelSourceType = 'chatbot' | 'call' | 'email' | 'manual';

export interface ExternalIntelligence {
  id: string;
  org_id: number;
  intel_type: IntelType;
  source_type: IntelSourceType;
  source_id: string | null;
  competitor_name: string | null;
  content: string;
  context: Record<string, unknown>;
  confidence: number;
  verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
}

// ─── Pattern Attribution / Leaderboard (Session 3) ──────────────────────────

export interface PatternAttribution {
  id: string;
  org_id: number;
  pattern_id: string;
  pattern_source: 'call_pattern' | 'auto_learned';
  owner_email: string;
  adopted_count: number;
  win_count: number;
  created_at: string;
  updated_at: string;
}

export interface LeaderboardEntry {
  rep_email: string;
  total_patterns: number;
  avg_effectiveness: number;
  high_performer_count: number;
  pattern_types: string;
  ai_times_referenced: number;
  ai_adopted_patterns: number;
  wins_attributed: number;
  top_pattern: {
    type: string;
    text: string;
    score: number;
  } | null;
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

// ─── Scheduling Types ───────────────────────────────────────────────────

export type CalendarProvider = 'google' | 'zoom';

export type SchedulingLocationType = 'google_meet' | 'zoom' | 'phone' | 'in_person' | 'custom';

export type BookingStatus = 'confirmed' | 'cancelled' | 'completed' | 'no_show' | 'rescheduled';

export interface CalendarConnection {
  connection_id: number;
  org_id: number;
  user_id: number;
  provider: CalendarProvider;
  account_email: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomQuestion {
  type: 'text' | 'textarea' | 'select' | 'radio';
  label: string;
  required: boolean;
  options?: string[];
}

export interface SchedulingEventType {
  event_type_id: number;
  org_id: number;
  host_user_id: number;
  availability_id: number | null;
  name: string;
  slug: string;
  description: string | null;
  duration_minutes: number;
  color: string;
  location_type: SchedulingLocationType;
  location_value: string | null;
  buffer_before: number;
  buffer_after: number;
  min_notice: number;
  max_days_ahead: number;
  max_per_day: number | null;
  custom_questions: CustomQuestion[];
  ai_agenda_enabled: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  host_name?: string;
  host_email?: string;
}

export interface TimeWindow {
  start: string;  // "HH:mm"
  end: string;    // "HH:mm"
}

export interface WeeklyHours {
  monday: TimeWindow[];
  tuesday: TimeWindow[];
  wednesday: TimeWindow[];
  thursday: TimeWindow[];
  friday: TimeWindow[];
  saturday: TimeWindow[];
  sunday: TimeWindow[];
}

export interface SchedulingAvailability {
  availability_id: number;
  org_id: number;
  user_id: number;
  name: string;
  timezone: string;
  is_default: boolean;
  weekly_hours: WeeklyHours;
  date_overrides: Record<string, TimeWindow[]>;
  created_at: string;
  updated_at: string;
}

export interface SchedulingBooking {
  booking_id: number;
  org_id: number;
  event_type_id: number;
  host_user_id: number;
  contact_id: number | null;
  invitee_name: string;
  invitee_email: string;
  invitee_phone: string | null;
  invitee_timezone: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  location_type: string;
  meeting_url: string | null;
  google_event_id: string | null;
  zoom_meeting_id: string | null;
  cancel_token: string;
  cancel_reason: string | null;
  rescheduled_to: number | null;
  answers: Record<string, unknown>;
  ai_agenda: string | null;
  metadata: Record<string, unknown>;
  reminder_24h_sent: boolean;
  reminder_1h_sent: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  event_type_name?: string;
  host_name?: string;
  host_email?: string;
}

export interface SchedulingWebhookLog {
  log_id: number;
  org_id: number;
  booking_id: number | null;
  event_name: string;
  webhook_url: string;
  request_body: Record<string, unknown> | null;
  response_status: number | null;
  response_body: string | null;
  success: boolean;
  attempted_at: string;
}

export interface AvailableSlot {
  start: string;  // ISO 8601
  end: string;    // ISO 8601
}

// ─── Unified Calendar Types ─────────────────────────────────────────────

export type CalendarEventSource = 'google' | 'booking' | 'send';

export interface UnifiedCalendarEvent {
  id: string;
  source: CalendarEventSource;
  title: string;
  description?: string;
  start: string;       // ISO 8601
  end: string;         // ISO 8601
  allDay: boolean;
  color: string;       // hex color for display
  url?: string;        // link to event detail (booking page, Google Calendar, etc.)
  meetingUrl?: string;  // Google Meet / Zoom link
  status?: string;
  metadata?: Record<string, unknown>;
}

// ─── Customer Hub Types ─────────────────────────────────────────────────────

export type CustomerAccountStatus = 'active' | 'inactive' | 'churned' | 'suspended' | 'deleted';

export type CustomerCampaignType =
  | 'upsell'
  | 'retention'
  | 'winback'
  | 'feature_adoption'
  | 'review_request'
  | 'announcement';

export type CustomerCampaignStatus = 'draft' | 'active' | 'paused' | 'completed';

export type CampaignSendStatus = 'draft' | 'approved' | 'scheduled' | 'sent' | 'delivered' | 'opened' | 'replied' | 'bounced';

export interface Customer {
  id: number;
  org_id: number;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  shipday_company_id: number | null;
  shipday_account_id: string | null;
  account_plan: string | null;
  plan_display_name: string | null;
  account_status: CustomerAccountStatus;
  signup_date: string | null;
  last_active: string | null;
  num_locations: number | null;
  num_drivers: number | null;
  avg_completed_orders: number | null;
  avg_order_value: number | null;
  avg_cost_per_order: number | null;
  discount_pct: number | null;
  health_score: number;
  last_email_date: string | null;
  last_email_subject: string | null;
  total_emails: number;
  notes: string | null;
  tags: string[];
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  imported_from: string | null;
}

export interface CustomerEmail {
  id: number;
  org_id: number;
  customer_id: number;
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  direction: 'inbound' | 'outbound';
  from_email: string | null;
  to_email: string | null;
  subject: string | null;
  snippet: string | null;
  body_preview: string | null;
  date: string | null;
  labels: string[];
  has_attachment: boolean;
  created_at: string;
}

export interface CustomerPlanChange {
  id: number;
  org_id: number;
  customer_id: number;
  previous_plan: string | null;
  new_plan: string | null;
  change_type: string | null;
  change_date: string | null;
  commission: number | null;
  notes: string | null;
  created_at: string;
}

export interface CustomerCampaign {
  id: number;
  org_id: number;
  name: string;
  campaign_type: CustomerCampaignType | null;
  target_segment: Record<string, unknown>;
  subject_template: string | null;
  body_template: string | null;
  status: CustomerCampaignStatus;
  total_recipients: number;
  sent_count: number;
  open_count: number;
  reply_count: number;
  conversion_count: number;
  created_at: string;
  updated_at: string;
}

export interface CustomerCampaignSend {
  id: number;
  org_id: number;
  campaign_id: number;
  customer_id: number | null;
  to_email: string;
  subject: string | null;
  body: string | null;
  personalization_context: Record<string, unknown>;
  status: CampaignSendStatus;
  scheduled_for: string | null;
  sent_at: string | null;
  opened_at: string | null;
  replied_at: string | null;
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerStats {
  total_active: number;
  total_inactive: number;
  total_churned: number;
  by_plan: Record<string, number>;
  avg_health_score: number;
  avg_order_value: number;
  total_locations: number;
  at_risk_count: number;
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

// ─── Voice Agent Types ──────────────────────────────────────────────────────

// ─── Campaign Integration Types (Session 9) ─────────────────────────────────

/** Context passed from campaign email links to chatbot/voice agent */
export interface CampaignContext {
  campaign_template_id: number;
  campaign_step: number;
  lead_id: number;
  tier: string | null;
  angle: string | null;
  variant: string | null;
  business_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  source_channel: 'email' | 'sms';
}

/** Warm lead with cross-touchpoint scoring */
export interface WarmLead {
  lead_id: number;
  contact_id: number | null;
  business_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  phone: string | null;
  tier: string | null;
  warmth_score: number;
  warmth_signals: WarmthSignal[];
  last_activity_at: string;
  recommended_action: 'ai_call' | 'human_call' | 'ai_chat' | 'email_followup';
  qualification_data: Record<string, unknown>;
}

export interface WarmthSignal {
  signal_type: 'email_opened' | 'email_clicked' | 'email_replied' | 'chat_started' | 'chat_qualified' | 'chat_demo_booked' | 'voice_completed' | 'voice_qualified' | 'multi_open' | 'link_clicked';
  count: number;
  last_at: string;
  weight: number;
}

/** Campaign step execution for ai_chat and ai_call channels */
export interface CampaignAIStepExecution {
  id: number;
  campaign_email_id: number;
  lead_id: number;
  channel: 'ai_chat' | 'ai_call';
  status: 'pending' | 'link_sent' | 'chat_started' | 'call_initiated' | 'completed' | 'no_response' | 'failed';
  tracking_token: string;
  campaign_context: CampaignContext;
  conversation_id: string | null;
  call_sid: string | null;
  outcome: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Voice Agent Types ──────────────────────────────────────────────────────

export type VoiceCallStatus = 'initiated' | 'in_progress' | 'completed' | 'transferred' | 'failed' | 'voicemail';

export type VoiceStage =
  | 'greeting'
  | 'hook'
  | 'rapport'
  | 'discovery'
  | 'implication'
  | 'solution_mapping'
  | 'roi_crystallization'
  | 'commitment'
  | 'close'
  | 'handoff'
  | 'ended';

export interface VoiceAgentCall {
  id: number;
  call_sid: string;
  session_id: string;
  contact_id: number | null;
  org_id: number | null;
  direction: 'inbound' | 'outbound';
  status: VoiceCallStatus;
  duration_seconds: number;
  messages_count: number;
  transcript: string | null;
  qualification_slots: Record<string, unknown>;
  computed_roi: string | null;
  final_stage: VoiceStage | null;
  handoff_triggered: boolean;
  handoff_reason: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}
