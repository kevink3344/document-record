export type Role = 'ADMINISTRATOR' | 'TEAM_MANAGER' | 'USER';

export type LookupUser = {
  id: number;
  full_name: string;
  email: string;
  role: Role;
  school_name: string;
  user_type_name: string;
  school_id: number;
  user_type_id: number;
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
  trend: Array<{ day: string; team_name: string; ticket_count: number }>;
  overdueList: Array<{ id: number; title: string; due_date: string; team_name: string }>;
};

export type DocumentDetails = {
  document: DocumentItem;
  activity: Array<{ id: number; message: string; created_at: string; actor_name: string }>;
  acknowledgments: Array<{
    id: number;
    acknowledged_at: string;
    comment: string;
    full_name: string;
    school_name: string;
    user_type_name: string;
  }>;
};

export type EditEntity = 'TEAM' | 'USER_TYPE' | 'SCHOOL' | 'USER' | 'DOCUMENT';

export type EditPanelState = {
  entity: EditEntity;
  id: number;
  title: string;
  payload: Record<string, unknown>;
};

export type DetailTab = 'DETAILS' | 'ACTIVITY';