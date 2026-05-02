export type Role = 'ADMINISTRATOR' | 'TEAM_MANAGER' | 'USER';

export type LookupUser = {
  id: number;
  full_name: string;
  email: string;
  role: Role;
  school_name: string | null;
  user_type_name: string | null;
  school_id: number | null;
  user_type_id: number | null;
};

export type LookupItem = { id: number; name: string };

export type Team = {
  id: number;
  name: string;
  description: string;
  manager_user_id: number | null;
  manager_user_ids: number[];
  manager_names?: string;
};

export type UserType = { id: number; name: string };

export type School = { id: number; name: string };

export type AdminUser = {
  id: number;
  full_name: string;
  email: string;
  role: Role;
  school_id: number | null;
  user_type_id: number | null;
  is_active: number;
};

export type DocumentItem = {
  id: number;
  title: string;
  description: string;
  content: string;
  team_id?: number;
  team_name: string;
  due_date: string;
  end_date: string;
  schedule: 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  document_type: string;
  file_url?: string;
  user_types: string;
  status: 'PENDING' | 'OVERDUE' | 'COMPLETED';
};

export type DashboardResponse = {
  summary: {
    total_documents: number;
    completed: number;
    assigned: number;
    overdue: number;
  };
  trend: Array<{ day: string; team_name: string; acknowledgment_count: number }>;
  overdueList: Array<{ id: number; title: string; due_date: string; team_name: string }>;
  compliance: Array<{ team_name: string; signed: number; total: number }>;
};

export type DocumentDetails = {
  document: DocumentItem;
  activity: Array<{ id: number; message: string; created_at: string; actor_name: string }>;
  acknowledgments: Array<{
    id: number;
    user_id: number;
    acknowledged_at: string;
    comment: string;
    signature_data?: string;
    signed_name?: string;
    signed_at?: string;
    full_name: string;
    school_name: string;
    user_type_name: string;
  }>;
};

export type UserSignature = {
  id: number;
  user_id: number;
  name: string;
  signature_data: string;
  is_default: number;
  created_at: string;
  updated_at: string;
};

export type EditEntity = 'TEAM' | 'USER_TYPE' | 'SCHOOL' | 'USER' | 'DOCUMENT';

export type EditPanelState = {
  entity: EditEntity;
  id: number;
  title: string;
  payload: Record<string, unknown>;
};

export type DetailTab = 'DETAILS' | 'ACTIVITY' | 'SIGNATURES';

// ─── Form Template Types ─────────────────────────────────────────────────────

export type FormFieldType =
  | 'short_text'
  | 'long_text'
  | 'number'
  | 'date'
  | 'single_select'
  | 'multi_select'
  | 'checkbox'
  | 'attachment'
  | 'signature';

export type FormTemplateStatus = 'draft' | 'published' | 'archived';
export type FormResponseStatus = 'draft' | 'submitted';

export type FormTemplateField = {
  id: number;
  template_version_id: number;
  field_key: string;
  label: string;
  help_text: string;
  field_type: FormFieldType;
  is_required: number;
  sort_order: number;
  config_json: string;
};

export type FormTemplateVersion = {
  id: number;
  template_id: number;
  version_number: number;
  title: string;
  description: string;
  status: FormTemplateStatus;
  created_by_user_id: number | null;
  created_by_name?: string;
  created_at: string;
};

export type FormTemplateListItem = {
  id: number;
  created_by_user_id: number | null;
  created_by_name?: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  // latest version columns joined
  latest_version_id: number | null;
  version_number: number | null;
  title: string | null;
  description: string | null;
  status: FormTemplateStatus | null;
  version_created_at: string | null;
};

export type FormTemplateDetail = {
  id: number;
  created_by_user_id: number | null;
  created_by_name?: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  versions: FormTemplateVersion[];
  latestFields: FormTemplateField[];
};

export type FormAssignment = {
  id: number;
  template_id: number;
  template_version_id: number;
  assigned_by_user_id: number | null;
  assigned_by_name?: string;
  title_override: string | null;
  instructions: string;
  open_at: string | null;
  close_at: string | null;
  created_at: string;
  template_title: string;
  version_number: number;
  description?: string;
  response_count?: number;
  submitted_count?: number;
  // for-user view
  response_id?: number | null;
  response_status?: FormResponseStatus | null;
  first_submitted_at?: string | null;
  last_submitted_at?: string | null;
  last_edited_at?: string | null;
};

export type FormAssignmentDetail = FormAssignment & {
  fields: FormTemplateField[];
  userTypeIds: number[];
  userIds: number[];
  userResponse: FormResponseSummary | null;
};

export type FormResponseSummary = {
  id: number;
  status: FormResponseStatus;
  first_submitted_at: string | null;
  last_submitted_at: string | null;
  last_edited_at: string | null;
};

export type FormResponseAnswer = {
  id: number;
  response_id: number;
  field_id: number;
  value_text: string;
  value_json: string | null;
};

export type FormResponseRevision = {
  id: number;
  response_id: number;
  edited_by_user_id: number | null;
  edited_by_name?: string;
  revision_number: number;
  change_summary: string;
  snapshot_json: string;
  created_at: string;
};

export type FormResponse = {
  id: number;
  assignment_id: number;
  template_id: number;
  template_version_id: number;
  user_id: number;
  user_name?: string;
  status: FormResponseStatus;
  first_submitted_at: string | null;
  last_submitted_at: string | null;
  last_edited_at: string | null;
  submitted_to_user_id: number | null;
  created_at: string;
  updated_at: string;
  answers: FormResponseAnswer[];
  revisions: FormResponseRevision[];
};