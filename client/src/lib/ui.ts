import type { Role, Team } from '../types';

export function badgeClass(status: string): string {
  if (status === 'COMPLETED') return 'bg-emerald-100 text-emerald-900 border border-emerald-300';
  if (status === 'OVERDUE') return 'bg-red-100 text-red-900 border border-red-300';
  return 'bg-amber-100 text-amber-900 border border-amber-300';
}

export function teamBadgeClass(teamName: string): string {
  const pastelClasses = [
    'bg-sky-100 text-sky-900 border border-sky-200',
    'bg-emerald-100 text-emerald-900 border border-emerald-200',
    'bg-amber-100 text-amber-900 border border-amber-200',
    'bg-rose-100 text-rose-900 border border-rose-200',
    'bg-violet-100 text-violet-900 border border-violet-200',
    'bg-teal-100 text-teal-900 border border-teal-200',
  ];
  const hash = [...teamName].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return pastelClasses[hash % pastelClasses.length];
}

export function userTypeBadgeClass(userType: string): string {
  const pastelClasses = [
    'bg-pink-100 text-pink-900 border border-pink-200',
    'bg-cyan-100 text-cyan-900 border border-cyan-200',
    'bg-lime-100 text-lime-900 border border-lime-200',
    'bg-orange-100 text-orange-900 border border-orange-200',
    'bg-indigo-100 text-indigo-900 border border-indigo-200',
    'bg-teal-100 text-teal-900 border border-teal-200',
  ];
  const hash = [...userType].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return pastelClasses[hash % pastelClasses.length];
}

export function roleBadgeClass(role: Role): string {
  if (role === 'ADMINISTRATOR') return 'bg-blue-100 text-blue-900 border border-blue-200';
  if (role === 'TEAM_MANAGER') return 'bg-amber-100 text-amber-900 border border-amber-200';
  return 'bg-emerald-100 text-emerald-900 border border-emerald-200';
}

export function formatDueText(dateStr: string): string {
  const due = new Date(dateStr).getTime();
  const delta = Math.ceil((due - Date.now()) / 86400000);
  if (delta < 0) return `Overdue by ${Math.abs(delta)} day${Math.abs(delta) === 1 ? '' : 's'}`;
  if (delta === 0) return 'Due today';
  return `Due in ${delta} day${delta === 1 ? '' : 's'}`;
}

export function normalizeTeam(raw: Record<string, unknown>): Team {
  let managerUserIds: number[] = [];
  const rawIds = raw.manager_user_ids;
  if (Array.isArray(rawIds)) {
    managerUserIds = rawIds.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  } else if (typeof rawIds === 'string' && rawIds.trim()) {
    try {
      const parsed = JSON.parse(rawIds);
      if (Array.isArray(parsed)) {
        managerUserIds = parsed.map((v) => Number(v)).filter((v) => Number.isFinite(v));
      }
    } catch {
      managerUserIds = [];
    }
  }

  return {
    id: Number(raw.id),
    name: String(raw.name ?? ''),
    description: String(raw.description ?? ''),
    manager_user_id: raw.manager_user_id == null ? null : Number(raw.manager_user_id),
    manager_user_ids: managerUserIds,
    manager_names: String(raw.manager_names ?? ''),
  };
}