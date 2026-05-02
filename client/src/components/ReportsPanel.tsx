import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, FileSpreadsheet, FilterX, Signature } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { badgeClass, formatDueText, normalizeTeam } from '../lib/ui';
import type { DocumentItem, LookupItem, LookupUser, Team } from '../types';

type ReportsPanelProps = {
  activeUser: LookupUser;
};

type ReportFilters = {
  teamId: string;
  schoolId: string;
  userTypeId: string;
  status: 'ALL' | 'SIGNED' | 'UNSIGNED' | 'OVERDUE';
  from: string;
  to: string;
};

type ReportsTab = 'OUTSTANDING' | 'AUDIT';

type ReportAcknowledgment = {
  id: number;
  document_id: number;
  user_id: number;
  acknowledged_at: string;
  signed_at?: string | null;
  signed_name?: string | null;
  comment?: string | null;
  full_name: string;
  document_title: string;
};

type OutstandingReportRow = {
  document_id: number;
  document_title: string;
  team_name: string;
  audience: string;
  due_date: string;
  assigned_count: number;
  signed_count: number;
  outstanding_count: number;
  status: 'SIGNED' | 'UNSIGNED' | 'OVERDUE';
};

type AuditReportRow = {
  acknowledgment_id: number;
  signed_at: string;
  signed_name: string;
  person_name: string;
  document_title: string;
  team_name: string;
  school_name: string;
  user_type_name: string;
};

type CoverageAssignedUserRow = {
  user_id: number;
  full_name: string;
  school_name: string;
  user_type_name: string;
  status: 'COMPLETED' | 'PENDING';
  signed_at: string | null;
};

function csvEscape(value: string | number): string {
  const text = String(value ?? '');
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>): void {
  const csv = [headers.map(csvEscape).join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

function dateKey(value: string | null | undefined): string {
  return (value ?? '').slice(0, 10);
}

function matchesDateRange(value: string, from: string, to: string): boolean {
  const key = dateKey(value);
  if (!key) return false;
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

export function ReportsPanel({ activeUser }: ReportsPanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<ReportsTab>('OUTSTANDING');
  const [selectedCoverageDocumentId, setSelectedCoverageDocumentId] = useState<number | null>(null);
  const [filters, setFilters] = useState<ReportFilters>({
    teamId: '',
    schoolId: '',
    userTypeId: '',
    status: 'ALL',
    from: '',
    to: '',
  });
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [acknowledgments, setAcknowledgments] = useState<ReportAcknowledgment[]>([]);
  const [documentUserTypeLinks, setDocumentUserTypeLinks] = useState<Array<{ document_id: number; user_type_id: number }>>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [schools, setSchools] = useState<LookupItem[]>([]);
  const [userTypes, setUserTypes] = useState<LookupItem[]>([]);
  const [users, setUsers] = useState<LookupUser[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [docsData, acksData, lookupsData, linksData] = await Promise.all([
          activeUser.role === 'TEAM_MANAGER'
            ? apiRequest<DocumentItem[]>(`/my-team-docs?managerUserId=${activeUser.id}`)
            : apiRequest<DocumentItem[]>(`/documents?userId=${activeUser.id}`),
          apiRequest<ReportAcknowledgment[]>('/acknowledgments'),
          apiRequest<{
            users: LookupUser[];
            teams: Array<Record<string, unknown>>;
            userTypes: LookupItem[];
            schools: LookupItem[];
          }>('/lookups'),
          apiRequest<Array<{ document_id: number; user_type_id: number }>>('/document-user-types'),
        ]);

        if (cancelled) return;

        const normalizedTeams = (((lookupsData?.teams as Array<Record<string, unknown>> | undefined) ?? []).map(normalizeTeam));
        const scopedTeams =
          activeUser.role === 'TEAM_MANAGER'
            ? normalizedTeams.filter((team) => team.manager_user_ids.includes(activeUser.id))
            : normalizedTeams;
        const scopedTeamIds = new Set(scopedTeams.map((team) => team.id));
        const scopedDocuments = ((docsData ?? []) as DocumentItem[]).filter((doc) => {
          if (activeUser.role !== 'TEAM_MANAGER') return true;
          return doc.team_id != null && scopedTeamIds.has(doc.team_id);
        });
        const scopedDocumentIds = new Set(scopedDocuments.map((doc) => doc.id));

        setDocuments(scopedDocuments);
        setAcknowledgments(((acksData ?? []) as ReportAcknowledgment[]).filter((ack) => scopedDocumentIds.has(ack.document_id)));
        setDocumentUserTypeLinks(((linksData ?? []) as Array<{ document_id: number; user_type_id: number }>).filter((link) => scopedDocumentIds.has(link.document_id)));
        setTeams(scopedTeams);
        setSchools(lookupsData?.schools ?? []);
        setUserTypes(lookupsData?.userTypes ?? []);
        setUsers(lookupsData?.users ?? []);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load reports');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [activeUser.id, activeUser.role]);

  const userTypeLabelById = useMemo(() => new Map(userTypes.map((item) => [item.id, item.name])), [userTypes]);
  const userById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const docById = useMemo(() => new Map(documents.map((doc) => [doc.id, doc])), [documents]);
  const docUserTypesMap = useMemo(() => {
    const map = new Map<number, number[]>();
    documentUserTypeLinks.forEach((link) => {
      const list = map.get(link.document_id) ?? [];
      if (!list.includes(link.user_type_id)) list.push(link.user_type_id);
      map.set(link.document_id, list);
    });
    return map;
  }, [documentUserTypeLinks]);

  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      if (filters.teamId && String(doc.team_id ?? '') !== filters.teamId) return false;
      if ((filters.from || filters.to) && !matchesDateRange(doc.due_date, filters.from, filters.to)) return false;
      if (filters.userTypeId) {
        const linkedUserTypes = docUserTypesMap.get(doc.id) ?? [];
        if (!linkedUserTypes.includes(Number(filters.userTypeId))) return false;
      }
      return true;
    });
  }, [documents, filters.from, filters.teamId, filters.to, filters.userTypeId, docUserTypesMap]);

  const outstandingRows = useMemo(() => {
    return filteredDocuments
      .map((doc) => {
        const linkedUserTypes = docUserTypesMap.get(doc.id) ?? [];
        const applicableUsers = users.filter((user) => {
          if (user.role !== 'USER') return false;
          if (user.user_type_id == null) return false;
          if (!linkedUserTypes.includes(user.user_type_id)) return false;
          if (filters.schoolId && String(user.school_id ?? '') !== filters.schoolId) return false;
          if (filters.userTypeId && String(user.user_type_id ?? '') !== filters.userTypeId) return false;
          return true;
        });

        const applicableUserIds = new Set(applicableUsers.map((user) => user.id));
        const signedUserIds = new Set(
          acknowledgments
            .filter((ack) => ack.document_id === doc.id && applicableUserIds.has(ack.user_id))
            .map((ack) => ack.user_id)
        );

        const assignedCount = applicableUsers.length;
        const signedCount = signedUserIds.size;
        const outstandingCount = Math.max(assignedCount - signedCount, 0);
        const isOverdue = new Date(doc.due_date).getTime() < Date.now() && outstandingCount > 0;
        const status: OutstandingReportRow['status'] = outstandingCount === 0 ? 'SIGNED' : isOverdue ? 'OVERDUE' : 'UNSIGNED';
        const audience = (filters.userTypeId
          ? [userTypeLabelById.get(Number(filters.userTypeId)) ?? '']
          : linkedUserTypes.map((id) => userTypeLabelById.get(id) ?? ''))
          .filter(Boolean)
          .join(', ');

        return {
          document_id: doc.id,
          document_title: doc.title,
          team_name: doc.team_name,
          audience: audience || doc.user_types || 'Unassigned',
          due_date: doc.due_date,
          assigned_count: assignedCount,
          signed_count: signedCount,
          outstanding_count: outstandingCount,
          status,
        } satisfies OutstandingReportRow;
      })
      .filter((row) => row.assigned_count > 0)
      .filter((row) => (filters.status === 'ALL' ? true : row.status === filters.status))
      .sort((left, right) => {
        const rank = { OVERDUE: 0, UNSIGNED: 1, SIGNED: 2 } as const;
        if (rank[left.status] !== rank[right.status]) return rank[left.status] - rank[right.status];
        return new Date(left.due_date).getTime() - new Date(right.due_date).getTime();
      });
  }, [acknowledgments, docUserTypesMap, filteredDocuments, filters.schoolId, filters.status, filters.userTypeId, userTypeLabelById, users]);

  const auditRows = useMemo(() => {
    return acknowledgments
      .map((ack) => {
        const doc = docById.get(ack.document_id);
        const user = userById.get(ack.user_id);
        if (!doc || !user) return null;
        if (filters.teamId && String(doc.team_id ?? '') !== filters.teamId) return null;
        if (filters.schoolId && String(user.school_id ?? '') !== filters.schoolId) return null;
        if (filters.userTypeId && String(user.user_type_id ?? '') !== filters.userTypeId) return null;
        const signedAt = ack.signed_at ?? ack.acknowledged_at;
        if ((filters.from || filters.to) && !matchesDateRange(signedAt, filters.from, filters.to)) return null;

        return {
          acknowledgment_id: ack.id,
          signed_at: signedAt,
          signed_name: ack.signed_name ?? ack.full_name,
          person_name: ack.full_name,
          document_title: doc.title,
          team_name: doc.team_name,
          school_name: user.school_name || 'Unknown school',
          user_type_name: user.user_type_name || 'Unknown type',
        } satisfies AuditReportRow;
      })
      .filter((row): row is AuditReportRow => Boolean(row))
      .sort((left, right) => new Date(right.signed_at).getTime() - new Date(left.signed_at).getTime());
  }, [acknowledgments, docById, filters.from, filters.schoolId, filters.teamId, filters.to, filters.userTypeId, userById]);

  const summary = useMemo(() => {
    const assigned = outstandingRows.reduce((sum, row) => sum + row.assigned_count, 0);
    const signed = outstandingRows.reduce((sum, row) => sum + row.signed_count, 0);
    const outstanding = outstandingRows.reduce((sum, row) => sum + row.outstanding_count, 0);
    const overdue = outstandingRows.filter((row) => row.status === 'OVERDUE').length;
    return { assigned, signed, outstanding, overdue };
  }, [outstandingRows]);

  const selectedCoverageRow = useMemo(
    () => outstandingRows.find((row) => row.document_id === selectedCoverageDocumentId) ?? null,
    [outstandingRows, selectedCoverageDocumentId]
  );

  const selectedCoverageDocument = useMemo(
    () => (selectedCoverageDocumentId ? docById.get(selectedCoverageDocumentId) ?? null : null),
    [docById, selectedCoverageDocumentId]
  );

  const selectedCoverageUsers = useMemo(() => {
    if (!selectedCoverageDocumentId) return [] as CoverageAssignedUserRow[];
    const linkedUserTypes = docUserTypesMap.get(selectedCoverageDocumentId) ?? [];
    const scopedUsers = users
      .filter((user) => {
        if (user.role !== 'USER') return false;
        if (user.user_type_id == null) return false;
        if (!linkedUserTypes.includes(user.user_type_id)) return false;
        if (filters.schoolId && String(user.school_id ?? '') !== filters.schoolId) return false;
        if (filters.userTypeId && String(user.user_type_id ?? '') !== filters.userTypeId) return false;
        return true;
      })
      .map((user) => {
        const userAcks = acknowledgments
          .filter((ack) => ack.document_id === selectedCoverageDocumentId && ack.user_id === user.id)
          .sort((left, right) => {
            const leftKey = left.signed_at ?? left.acknowledged_at;
            const rightKey = right.signed_at ?? right.acknowledged_at;
            return new Date(rightKey).getTime() - new Date(leftKey).getTime();
          });
        const latestAck = userAcks[0];

        return {
          user_id: user.id,
          full_name: user.full_name,
          school_name: user.school_name || 'Unknown school',
          user_type_name: user.user_type_name || 'Unknown type',
          status: latestAck ? 'COMPLETED' : 'PENDING',
          signed_at: latestAck ? latestAck.signed_at ?? latestAck.acknowledged_at : null,
        } satisfies CoverageAssignedUserRow;
      })
      .sort((left, right) => left.full_name.localeCompare(right.full_name));

    return scopedUsers;
  }, [acknowledgments, docUserTypesMap, filters.schoolId, filters.userTypeId, selectedCoverageDocumentId, users]);

  useEffect(() => {
    if (activeTab !== 'OUTSTANDING') {
      setSelectedCoverageDocumentId(null);
    }
  }, [activeTab]);

  useEffect(() => {
    if (!selectedCoverageDocumentId) return;
    if (!outstandingRows.some((row) => row.document_id === selectedCoverageDocumentId)) {
      setSelectedCoverageDocumentId(null);
    }
  }, [outstandingRows, selectedCoverageDocumentId]);

  const exportCurrentView = () => {
    if (activeTab === 'OUTSTANDING') {
      downloadCsv(
        'docrecord-outstanding-report.csv',
        ['Document', 'Team', 'Audience', 'Due Date', 'Assigned', 'Signed', 'Outstanding', 'Status'],
        outstandingRows.map((row) => [
          row.document_title,
          row.team_name,
          row.audience,
          dateKey(row.due_date),
          row.assigned_count,
          row.signed_count,
          row.outstanding_count,
          row.status,
        ])
      );
      return;
    }

    downloadCsv(
      'docrecord-signature-audit.csv',
      ['Signed At', 'Signed As', 'Person', 'Document', 'Team', 'School', 'User Type'],
      auditRows.map((row) => [
        row.signed_at,
        row.signed_name,
        row.person_name,
        row.document_title,
        row.team_name,
        row.school_name,
        row.user_type_name,
      ])
    );
  };

  const clearFilters = () => {
    setFilters({ teamId: '', schoolId: '', userTypeId: '', status: 'ALL', from: '', to: '' });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-[3px] border border-slate-200 bg-[var(--theme-card)] p-4 dark:border-slate-700">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Reports</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Filter compliance coverage and export current results for operational follow-up or audits.
            </p>
          </div>
          <button
            type="button"
            onClick={exportCurrentView}
            className="inline-flex items-center rounded-[3px] border border-blue-400 bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            <Download size={14} className="mr-2" /> Export {activeTab === 'OUTSTANDING' ? 'Coverage CSV' : 'Audit CSV'}
          </button>
        </div>
      </section>

      <section className="rounded-[3px] border border-slate-200 bg-[var(--theme-card)] p-4 dark:border-slate-700">
        <div className="mb-3 flex items-center justify-between">
          <div className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
            <FileSpreadsheet size={15} /> Report Filters
          </div>
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            <FilterX size={14} className="mr-1" /> Clear filters
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="space-y-1 text-xs text-slate-500">
            <span>Team</span>
            <select
              value={filters.teamId}
              onChange={(e) => setFilters((prev) => ({ ...prev, teamId: e.target.value }))}
              className="w-full border border-slate-300 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="">All teams</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs text-slate-500">
            <span>School</span>
            <select
              value={filters.schoolId}
              onChange={(e) => setFilters((prev) => ({ ...prev, schoolId: e.target.value }))}
              className="w-full border border-slate-300 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="">All schools</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs text-slate-500">
            <span>User Type</span>
            <select
              value={filters.userTypeId}
              onChange={(e) => setFilters((prev) => ({ ...prev, userTypeId: e.target.value }))}
              className="w-full border border-slate-300 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="">All user types</option>
              {userTypes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs text-slate-500">
            <span>Status</span>
            <select
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value as ReportFilters['status'] }))}
              className="w-full border border-slate-300 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="ALL">All statuses</option>
              <option value="SIGNED">Signed</option>
              <option value="UNSIGNED">Unsigned</option>
              <option value="OVERDUE">Overdue</option>
            </select>
          </label>

          <label className="space-y-1 text-xs text-slate-500">
            <span>From</span>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))}
              className="w-full border border-slate-300 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>

          <label className="space-y-1 text-xs text-slate-500">
            <span>To</span>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))}
              className="w-full border border-slate-300 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {[
          ['Assigned', summary.assigned],
          ['Signed', summary.signed],
          ['Outstanding', summary.outstanding],
          ['Overdue Docs', summary.overdue],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[3px] border border-slate-200 bg-[var(--theme-card)] p-3 dark:border-slate-700">
            <p className="text-xs uppercase text-slate-500">{label}</p>
            <p className="font-mono text-2xl font-bold">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-[3px] border border-slate-200 bg-[var(--theme-card)] p-4 dark:border-slate-700">
        <div className="mb-4 flex gap-6 border-b border-slate-200 dark:border-slate-700">
          {[
            { id: 'OUTSTANDING' as const, label: 'Coverage Analysis' },
            { id: 'AUDIT' as const, label: 'Signature Audit' },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`border-b-2 px-1 pb-2 text-sm font-semibold transition-colors ${
                  isActive
                    ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Loading reports...</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : activeTab === 'OUTSTANDING' ? (
          <div className="space-y-3">
            {selectedCoverageRow && selectedCoverageDocument ? (
              <>
                <button
                  type="button"
                  onClick={() => setSelectedCoverageDocumentId(null)}
                  className="inline-flex items-center text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  <ArrowLeft size={14} className="mr-1" /> Back to Coverage Analysis
                </button>

                <div className="rounded-[3px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Document Coverage</p>
                  <h3 className="mt-1 text-base font-semibold">{selectedCoverageDocument.title}</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{selectedCoverageDocument.team_name} • Due {dateKey(selectedCoverageDocument.due_date)}</p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="rounded-[3px] border border-slate-200 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                      <p className="text-xs uppercase text-slate-500">Signed / Assigned</p>
                      <p className="font-mono text-lg font-semibold">{selectedCoverageRow.signed_count} / {selectedCoverageRow.assigned_count}</p>
                    </div>
                    <div className="rounded-[3px] border border-slate-200 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                      <p className="text-xs uppercase text-slate-500">Outstanding</p>
                      <p className="font-mono text-lg font-semibold">{selectedCoverageRow.outstanding_count}</p>
                    </div>
                    <div className="rounded-[3px] border border-slate-200 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                      <p className="text-xs uppercase text-slate-500">Audience</p>
                      <p className="text-sm font-semibold">{selectedCoverageRow.audience}</p>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <tr>
                        <th className="px-3 py-2">User</th>
                        <th className="px-3 py-2">School</th>
                        <th className="px-3 py-2">User Type</th>
                        <th className="px-3 py-2">Signed At</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCoverageUsers.length ? (
                        selectedCoverageUsers.map((user) => (
                          <tr key={user.user_id} className="border-t border-slate-200 dark:border-slate-700">
                            <td className="px-3 py-2 font-semibold">{user.full_name}</td>
                            <td className="px-3 py-2">{user.school_name}</td>
                            <td className="px-3 py-2">{user.user_type_name}</td>
                            <td className="px-3 py-2">{user.signed_at ? new Date(user.signed_at).toLocaleString() : '-'}</td>
                            <td className="px-3 py-2">
                              <span className={`rounded-[3px] px-2 py-1 text-xs font-semibold ${badgeClass(user.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING')}`}>
                                {user.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">
                            No assigned users match the current filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Coverage analysis uses due dates for date filters and counts regular users assigned through document user types.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <tr>
                        <th className="px-3 py-2">Document</th>
                        <th className="px-3 py-2">Team</th>
                        <th className="px-3 py-2">Audience</th>
                        <th className="px-3 py-2">Due</th>
                        <th className="px-3 py-2">Signed / Assigned</th>
                        <th className="px-3 py-2">Outstanding</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outstandingRows.length ? (
                        outstandingRows.map((row) => (
                          <tr
                            key={row.document_id}
                            onClick={() => setSelectedCoverageDocumentId(row.document_id)}
                            className="cursor-pointer border-t border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
                          >
                            <td className="px-3 py-2 font-semibold">{row.document_title}</td>
                            <td className="px-3 py-2">{row.team_name}</td>
                            <td className="px-3 py-2">{row.audience}</td>
                            <td className="px-3 py-2">
                              <div>{dateKey(row.due_date)}</div>
                              <div className="text-xs text-slate-500">{formatDueText(row.due_date)}</div>
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              {row.signed_count} / {row.assigned_count}
                            </td>
                            <td className="px-3 py-2 tabular-nums">{row.outstanding_count}</td>
                            <td className="px-3 py-2">
                              <span className={`rounded-[3px] px-2 py-1 text-xs font-semibold ${badgeClass(row.status === 'SIGNED' ? 'COMPLETED' : row.status)}`}>
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">
                            No coverage rows match the current filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Signature size={13} /> Signature audit uses signed timestamps for date filters.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <tr>
                    <th className="px-3 py-2">Signed At</th>
                    <th className="px-3 py-2">Signed As</th>
                    <th className="px-3 py-2">Person</th>
                    <th className="px-3 py-2">Document</th>
                    <th className="px-3 py-2">Team</th>
                    <th className="px-3 py-2">School</th>
                    <th className="px-3 py-2">User Type</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.length ? (
                    auditRows.map((row) => (
                      <tr key={row.acknowledgment_id} className="border-t border-slate-200 dark:border-slate-700">
                        <td className="px-3 py-2 whitespace-nowrap">{new Date(row.signed_at).toLocaleString()}</td>
                        <td className="px-3 py-2">{row.signed_name}</td>
                        <td className="px-3 py-2">{row.person_name}</td>
                        <td className="px-3 py-2 font-semibold">{row.document_title}</td>
                        <td className="px-3 py-2">{row.team_name}</td>
                        <td className="px-3 py-2">{row.school_name}</td>
                        <td className="px-3 py-2">{row.user_type_name}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">
                        No signature audit rows match the current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}