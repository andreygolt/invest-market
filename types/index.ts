export type UserRole = 'superadmin' | 'admin' | 'moderator' | 'manager' | 'investor' | 'project';
export type InviteRole = 'investor' | 'project' | 'admin' | 'moderator' | 'manager';
export type ProjectStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected';
export type AuditAction =
  | 'project_approved'
  | 'project_rejected'
  | 'application_approved'
  | 'application_rejected'
  | 'broadcast_sent'
  | 'invite_created'
  | 'user_role_changed';
export type ApplicationStatus =
  | 'pending'
  | 'reviewing'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'withdrawn';
export type DocumentType =
  | 'pitch_deck'
  | 'financial_model'
  | 'charter'
  | 'team_cv'
  | 'legal_docs'
  | 'other';

export interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
}
export type UserInsert = Omit<UserRow, 'id' | 'created_at' | 'updated_at' | 'is_active'> & {
  is_active?: boolean;
};

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
}

export interface UserProfileUpdate {
  role?: UserRole;
  is_active?: boolean;
}

export interface ProfileUpdate {
  full_name: string;
}

export interface PasswordUpdate {
  new_password: string;
}

export type PlatformSettingKey =
  | 'platform_name'
  | 'contact_email'
  | 'success_fee_default'
  | 'min_investment_amount'
  | 'max_investment_amount'
  | 'catalog_page_size';

export interface PlatformSetting {
  key: PlatformSettingKey;
  value: string;
  updated_at: string;
  updated_by: string | null;
}

export type PlatformSettings = Record<PlatformSettingKey, string>;

export interface AuditLogRow {
  id: string;
  actor_id: string;
  actor_email: string | null;
  action: AuditAction;
  entity_type: string;
  entity_id: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogInsert {
  actor_id: string;
  actor_email?: string | null;
  action: AuditAction;
  entity_type: string;
  entity_id?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface InviteRow {
  id: string;
  code: string;
  role: InviteRole;
  email: string | null;
  created_by: string;
  used_by: string | null;
  used_at: string | null;
  expires_at: string | null;
  created_at: string;
  note: string | null;
}

export interface Invite {
  id: string;
  code: string;
  role: InviteRole;
  email: string | null;
  used_by: string | null;
  used_at: string | null;
  created_by: string;
  created_at: string;
  expires_at: string | null;
  note: string | null;
}

export interface InviteInsert {
  role: InviteRole;
  email?: string;
  expires_at?: string;
  note?: string;
}

export type NotificationType =
  | 'project_approved'
  | 'project_rejected'
  | 'application_approved'
  | 'application_rejected'
  | 'project_update'
  | 'new_application'
  | 'new_application_manager'
  | 'new_project_submission'
  | 'announcement';

export type BroadcastTargetRole =
  | 'all'
  | 'investor'
  | 'project'
  | 'manager'
  | 'moderator'
  | 'admin'
  | 'superadmin';

export interface BroadcastRequest {
  title: string;
  body: string;
  target_role: BroadcastTargetRole;
  link?: string;
}

export interface BroadcastResult {
  sent: number;
  target_role: BroadcastTargetRole;
}

export interface ProjectExportRow {
  id: string;
  name: string;
  category: string;
  status: string;
  created_at: string;
  investment_min: number | null;
  investment_max: number | null;
  target_amount: number | null;
  currency: string | null;
}

export interface ApplicationExportRow {
  id: string;
  project_id: string;
  project_name: string;
  investor_id: string;
  investor_email: string;
  amount: number | null;
  currency: string | null;
  status: string;
  created_at: string;
}

export interface InvestorExportRow {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  email_sent?: boolean;
  email_sent_at?: string | null;
  created_at: string;
}

export interface NotificationPreferences {
  user_id: string;
  email_enabled: boolean;
  updated_at: string;
}

export interface NotificationsResponse {
  notifications: NotificationRow[];
  unread_count: number;
  total_count: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface NotificationInsert {
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
}

export interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  status: ProjectStatus;
  moderated_by: string | null;
  moderated_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}
export type ProjectInsert = Omit<ProjectRow, 'id' | 'created_at' | 'updated_at'>;

export interface ProjectDashboardData {
  id: string;
  name: string;
  status: ProjectStatus;
  questionnaire_s1: Record<string, unknown> | null;
  questionnaire_s5: Record<string, unknown> | null;
  video_path: string | null;
  created_at: string;
  rejection_reason: string | null;
}

export interface ProjectOwnerDashboardData {
  project: {
    id: string;
    name: string;
    status: string;
    created_at: string;
    category?: string | null;
    short_description?: string | null;
  } | null;
  viewsCount: number;
  applicationsCount: number;
  recentUpdates: Array<{
    id: string;
    title: string;
    created_at: string;
    ai_summary?: string | null;
  }>;
}

export interface ProjectChecklist {
  questionnaire14: boolean;
  questionnaire58: boolean;
  hasDocuments: boolean;
  hasVideo: boolean;
  submitted: boolean;
}

export interface ProjectStats {
  favorites_count: number;
  portfolio_count: number;
  views_count: number;
  unique_viewers: number;
  applications: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    cancelled: number;
    withdrawn: number;
  };
}

export interface FunnelRow {
  project_id: string;
  project_name: string;
  category: string;
  views_count: number;
  unique_viewers: number;
  favorites_count: number;
  applications_count: number;
  portfolio_count: number;
  conversion_rate: number;
}

export interface InvestorActivityRow {
  investor_id: string;
  investor_name: string;
  email: string;
  views_count: number;
  favorites_count: number;
  applications_count: number;
  portfolio_count: number;
  last_active_at: string | null;
}

export interface DocumentRow {
  id: string;
  project_id: string;
  type: DocumentType;
  name: string;
  storage_path: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
}
export type DocumentInsert = Omit<DocumentRow, 'id' | 'created_at'>;

export interface ApplicationRow {
  id: string;
  investor_id: string;
  project_id: string;
  amount: number | null;
  instrument: string | null;
  status: ApplicationStatus;
  message: string | null;
  comment: string | null;
  created_at: string;
  updated_at: string;
}
export type ApplicationInsert = Omit<ApplicationRow, 'id' | 'created_at' | 'updated_at'>;

export interface ApplicationNote {
  id: string;
  application_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author_email?: string | null;
}

export interface ApplicationNoteInsert {
  application_id: string;
  content: string;
}

export type QuestionnaireSection = 's1' | 's2' | 's3' | 's4';

export type ProjectStage = 'idea' | 'pre_seed' | 'seed' | 'series_a_plus';
export type ProductStage = 'concept' | 'mvp' | 'beta' | 'launched';

export interface QS1Answers {
  description: string;
  industry: string;
  stage: ProjectStage;
  legal_form: string;
  country: string;
  city: string;
  founding_year: string;
}

export interface QS2Answers {
  founders: Array<{ name: string; role: string; linkedin: string; bio: string }>;
  team_size: string;
  key_skills: string;
}

export interface QS3Answers {
  problem: string;
  solution: string;
  usp: string;
  product_stage: ProductStage;
}

export interface QS4Answers {
  target_audience: string;
  tam_description: string;
  competitors: string;
  competitive_advantage: string;
}

export interface QS5Answers {
  revenue_current: string;
  revenue_last_year: string;
  burn_rate: string;
  runway_months: string;
  unit_economics: string;
  financial_model_ready: boolean;
}

export interface QS6Answers {
  investment_ask: string;
  valuation_pre_money: string;
  investment_type: 'equity' | 'convertible_note' | 'safe' | 'debt' | '';
  use_of_funds: string;
  previous_rounds: string;
  total_raised: string;
}

export interface QS7Answers {
  monthly_users: string;
  paying_customers: string;
  mrr: string;
  growth_rate_mom: string;
  key_metrics: string;
  notable_clients: string;
  awards: string;
}

export interface QS8Answers {
  exit_strategy: string;
  risks: string;
  additional_info: string;
  how_found_platform: string;
}

export interface ProjectDocument {
  id: string;
  project_id: string;
  doc_type: DocumentType;
  storage_path: string;
  filename: string;
  uploaded_at: string;
}

export interface ProjectStatusLog {
  id: string;
  project_id: string;
  from_status: ProjectStatus | null;
  to_status: ProjectStatus;
  changed_by: string | null;
  changed_at: string;
  comment: string | null;
}

export interface ProjectStatusLogEntry {
  id: string;
  project_id: string;
  old_status: string | null;
  new_status: string;
  changed_at: string;
  changed_by: string | null;
}

export type ExtractionStatus = 'pending' | 'processing' | 'done' | 'error';

export interface DocumentExtraction {
  id: string;
  document_id: string;
  project_id: string;
  status: ExtractionStatus;
  extracted_text: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export type AnalysisStatus = 'pending' | 'processing' | 'done' | 'error';

export type RedFlagSeverity = 'high' | 'medium' | 'low';
export type MissingFieldImportance = 'critical' | 'important' | 'nice_to_have';

export interface RedFlag {
  severity: RedFlagSeverity;
  description: string;
}

export interface MissingField {
  field: string;
  importance: MissingFieldImportance;
}

export interface AIAnalysisReport {
  red_flags: RedFlag[];
  missing_data: MissingField[];
  draft_card: string;
  ai_score: number;
  summary: string;
}

export interface AIReportRow {
  id: string;
  project_id: string;
  report: AIAnalysisReport | Record<string, never>;
  status: AnalysisStatus;
  created_at: string;
  updated_at: string;
}

export interface InvestorCatalogItem {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  industry: string | null;
  stage: ProjectStage | null;
  country: string | null;
  city: string | null;
  description: string | null;
  short_description: string | null;
  investment_ask: string | null;
  investment_type: QS6Answers['investment_type'] | null;
  valuation_pre_money: string | null;
  ai_score: number | null;
  ai_summary: string | null;
}

export interface CatalogResponse {
  items: InvestorCatalogItem[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export type CatalogSortOrder = 'newest' | 'score_desc' | 'ask_asc';

export interface DealRoomDocument {
  id: string;
  doc_type: DocumentType;
  filename: string;
  signed_url: string;
}

export interface InvestorDocumentItem {
  id: string;
  document_type: DocumentType;
  file_name: string;
  file_size: number | null;
  created_at: string;
  download_url: string;
}

export interface DealRoomProject {
  id: string;
  name: string;
  created_at: string;
  video_signed_url: string | null;
  // Из s1
  description: string | null;
  industry: string | null;
  stage: ProjectStage | null;
  legal_form: string | null;
  country: string | null;
  city: string | null;
  founding_year: string | null;
  // Из s2
  founders: Array<{ name: string; role: string; linkedin: string; bio: string }> | null;
  team_size: string | null;
  key_skills: string | null;
  // Из s3
  problem: string | null;
  solution: string | null;
  usp: string | null;
  product_stage: ProductStage | null;
  // Из s4
  target_audience: string | null;
  tam_description: string | null;
  competitors: string | null;
  competitive_advantage: string | null;
  // Из s5
  revenue_current: string | null;
  revenue_last_year: string | null;
  burn_rate: string | null;
  runway_months: string | null;
  unit_economics: string | null;
  // Из s6
  investment_ask: string | null;
  valuation_pre_money: string | null;
  investment_type: QS6Answers['investment_type'] | null;
  use_of_funds: string | null;
  previous_rounds: string | null;
  total_raised: string | null;
  // Из s7
  monthly_users: string | null;
  paying_customers: string | null;
  mrr: string | null;
  growth_rate_mom: string | null;
  key_metrics: string | null;
  notable_clients: string | null;
  // Из s8
  exit_strategy: string | null;
  // AI
  ai_score: number | null;
  ai_summary: string | null;
  // Документы
  documents: DealRoomDocument[];
}

export interface ApplicationListItem {
  id: string;
  project_id: string;
  project_name: string;
  investor_id: string;
  investor_name: string | null;
  investor_email: string;
  amount: number | null;
  status: ApplicationStatus;
  message: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminApplicationItem {
  id: string;
  project_id: string;
  project_name: string | null;
  investor_id: string;
  investor_email: string | null;
  amount: number | null;
  instrument: string | null;
  comment: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  rejection_reason: string | null;
  created_at: string;
}

export type ApplicationFilterStatus = 'all' | 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface ApplicationDetail {
  id: string;
  project_id: string;
  project_name: string;
  amount: number | null;
  status: ApplicationStatus;
  message: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export type InvestorPersonalStatus = 'watching' | 'interested' | 'passed';

export interface InvestorFavoriteRow {
  id: string;
  investor_id: string;
  project_id: string;
  notes: string | null;
  personal_status: InvestorPersonalStatus | null;
  created_at: string;
  updated_at: string;
}

export type InvestorFavoriteInsert = Omit<InvestorFavoriteRow, 'id' | 'created_at' | 'updated_at'>;

export interface InvestorFavoriteDetail {
  id: string;
  investor_id: string;
  project_id: string;
  project_name: string;
  project_industry: string | null;
  project_stage: ProjectStage | null;
  project_ai_score: number | null;
  notes: string | null;
  personal_status: InvestorPersonalStatus | null;
  created_at: string;
  updated_at: string;
}

export interface CalcScenario {
  label: string;
  cagr: number; // % в год (может быть отрицательным)
  total_return: number; // итоговая сумма, руб.
  profit: number; // прибыль (< 0 = убыток)
  return_multiple: number; // множитель (e.g. 1.5 = x1.5)
  return_pct: number; // % прибыли/убытка на весь горизонт
}

export interface CalcResult {
  amount: number; // инвестируемая сумма
  horizon_years: number; // горизонт в годах
  pessimistic: CalcScenario;
  base: CalcScenario;
  optimistic: CalcScenario;
}

export type PortfolioInstrument =
  | 'equity'
  | 'convertible_note'
  | 'safe'
  | 'debt'
  | 'other';

export type PortfolioDealStatus = 'active' | 'exited' | 'written_off';

export interface PortfolioRow {
  id: string;
  investor_id: string;
  project_id: string;
  amount_invested: number;
  date_invested: string; // ISO date: "YYYY-MM-DD"
  instrument: PortfolioInstrument;
  deal_status: PortfolioDealStatus;
  notes: string | null;
  exit_amount: number | null;
  created_at: string;
  updated_at: string;
}
export type PortfolioInsert = Omit<PortfolioRow, 'id' | 'created_at' | 'updated_at'>;

export interface PortfolioDetail extends PortfolioRow {
  project_name: string;
  project_industry: string | null;
  project_stage: ProjectStage | null;
}

export interface PortfolioStats {
  total_entries: number;
  total_invested: number;      // сумма всех amount_invested
  total_active: number;        // кол-во активных позиций
  total_exited: number;        // кол-во выходов
  total_written_off: number;   // кол-во списанных
  total_exit_amount: number;   // сумма exit_amount у выходов
}

export interface DashboardPortfolioStats {
  total_invested: number;
  active_count: number;
  exited_count: number;
  defaulted_count: number;
}

export interface DashboardApplicationStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

export interface RecentDeal {
  id: string;
  name: string;
  industry: string | null;
  investment_stage: string | null;
  min_investment: number | null;
}

export interface InvestorDashboard {
  portfolio: DashboardPortfolioStats;
  applications: DashboardApplicationStats;
  favorites_count: number;
  recent_deals: RecentDeal[];
}

export interface CommercialTermsRow {
  id: string;
  project_id: string;
  success_fee_pct: number;
  fixed_fee: number;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}
export type CommercialTermsInsert = Omit<CommercialTermsRow, 'id' | 'created_at' | 'updated_at'>;
export type CommercialTermsUpdate = Partial<Pick<CommercialTermsRow, 'success_fee_pct' | 'fixed_fee' | 'notes'>>;

export interface CommercialTermsWithProject extends CommercialTermsRow {
  project_name: string;
}

export interface SuccessFeeSummary {
  terms: CommercialTermsRow | null;
  estimated_fee: number | null;
}

export type ReferralRewardStatus = 'pending' | 'approved' | 'paid';

export interface ReferralCodeRow {
  id: string;
  user_id: string;
  code: string;
  created_at: string;
}

export interface ReferralLinkRow {
  id: string;
  referrer_id: string;
  referee_id: string;
  level: 1 | 2 | 3;
  created_at: string;
}

export interface ReferralRewardRow {
  id: string;
  referrer_id: string;
  referee_id: string;
  portfolio_id: string | null;
  level: 1 | 2 | 3;
  amount: number;
  status: ReferralRewardStatus;
  created_at: string;
  updated_at: string;
}

export interface ReferralStats {
  code: string | null;
  total_referrals: number;       // сумма по уровням 1+2+3
  level1_count: number;
  level2_count: number;
  level3_count: number;
  rewards_pending: number;       // сумма в ₽
  rewards_approved: number;
  rewards_paid: number;
}

// T18 — Project Updates
export interface ProjectUpdate {
  id: string
  project_id: string
  title: string
  body: string
  ai_summary: string | null
  created_at: string
  updated_at: string
}

export type ProjectUpdateInsert = Pick<ProjectUpdate, 'title' | 'body'>

export interface ProjectUpdateNotification {
  projectId: string
  projectName: string
  updateTitle: string
  updateId: string
}

// T19 — Admin AI Report
export interface AdminReportDocument {
  id: string
  file_name: string
  document_type: string
  extraction_status: string | null
}

export interface AdminAIReportResponse {
  report: AIReportRow | null
  documents: AdminReportDocument[]
}

// T20 — Disclaimer
export type DisclaimerVariant = 'default' | 'compact'

// T23 — Admin Statistics Dashboard
export interface AdminProjectStats {
  draft: number
  submitted: number
  approved: number
  rejected: number
  total: number
}

export interface AdminUserStats {
  investor: number
  project: number
  admin: number
  moderator: number
  manager: number
  total: number
}

export interface AdminApplicationStats {
  pending: number
  approved: number
  rejected: number
  total: number
}

export interface AdminActivityItem {
  project_id: string
  status: string
  changed_at: string
  project_name: string | null
}

export interface AdminStats {
  projects: AdminProjectStats
  users: AdminUserStats
  applications: AdminApplicationStats
  portfolio: { total_records: number }
  invites: { total: number; used: number; unused: number }
  recent_activity: AdminActivityItem[]
}

// T54 — Admin Analytics
export type AnalyticsPeriod = '7d' | '30d' | '90d'

export interface AnalyticsBucket {
  label: string
  date_from: string
  registrations: number
  project_submissions: number
  deal_room_views: number
  applications: number
  portfolio_entries: number
}

export interface AnalyticsResponse {
  period: AnalyticsPeriod
  buckets: AnalyticsBucket[]
  totals: {
    registrations: number
    project_submissions: number
    deal_room_views: number
    applications: number
    portfolio_entries: number
  }
}

// T55 — Admin Global Search
export interface SearchProjectResult {
  id: string
  name: string
  category: string
  status: string
}

export interface SearchInvestorResult {
  id: string
  full_name: string | null
  email: string
  created_at: string
}

export interface SearchApplicationResult {
  id: string
  project_id: string
  project_name: string
  investor_id: string
  investor_email: string
  amount: number | null
  status: string
}

export interface GlobalSearchResponse {
  query: string
  projects: SearchProjectResult[]
  investors: SearchInvestorResult[]
  applications: SearchApplicationResult[]
}

// T64 — Manager Dashboard
export interface ManagerDashboardStats {
  pending: number
  approved: number
  rejected: number
  cancelled: number
}

export interface ManagerDashboardApplication {
  id: string
  status: string
  amount: number | null
  instrument: string | null
  created_at: string
  project_name: string | null
  investor_email: string | null
}

export interface ManagerDashboardData {
  stats: ManagerDashboardStats
  recentApplications: ManagerDashboardApplication[]
}
