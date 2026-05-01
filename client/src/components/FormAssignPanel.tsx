import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { apiRequest } from '../lib/api';
import type { FormAssignment, FormAssignmentDetail, FormTemplateDetail, LookupItem, LookupUser } from '../types';

type Props = {
  templateDetail: FormTemplateDetail;
  lookupUserTypes: LookupItem[];
  lookupUsers: LookupUser[];
  actorUserId: number;
  onClose: () => void;
  onSaved: () => void;
};

export function FormAssignPanel({ templateDetail, lookupUserTypes, lookupUsers, actorUserId, onClose, onSaved }: Props) {
  const latestVersion = templateDetail.versions[0] ?? null;

  const [selectedVersionId, setSelectedVersionId] = useState<number>(latestVersion?.id ?? 0);
  const [instructions, setInstructions] = useState('');
  const [openAt, setOpenAt] = useState('');
  const [closeAt, setCloseAt] = useState('');
  const [selectedUserTypeIds, setSelectedUserTypeIds] = useState<number[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [previousAssignments, setPreviousAssignments] = useState<FormAssignmentDetail[]>([]);
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'previouslyAssigned'>('details');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const applyAssignmentToForm = (assignment: FormAssignmentDetail | null) => {
    if (!assignment) {
      setInstructions('');
      setOpenAt('');
      setCloseAt('');
      setSelectedUserTypeIds([]);
      setSelectedUserIds([]);
      return;
    }

    setInstructions(assignment.instructions ?? '');
    setOpenAt(assignment.open_at ? assignment.open_at.slice(0, 10) : '');
    setCloseAt(assignment.close_at ? assignment.close_at.slice(0, 10) : '');
    setSelectedUserTypeIds(assignment.userTypeIds ?? []);
    setSelectedUserIds(assignment.userIds ?? []);
  };

  useEffect(() => {
    const loadPreviousAssignments = async () => {
      setLoadingPrevious(true);
      try {
        const rows = await apiRequest<FormAssignment[]>(
          `/form-assignments?actorUserId=${actorUserId}&templateId=${templateDetail.id}`
        );
        if (!rows || rows.length === 0) {
          setPreviousAssignments([]);
          return;
        }

        const details = await Promise.all(
          rows.map((row) => apiRequest<FormAssignmentDetail>(`/form-assignments/${row.id}?actorUserId=${actorUserId}`))
        );

        const validDetails = details.filter((d): d is FormAssignmentDetail => Boolean(d));
        setPreviousAssignments(validDetails);

        // Prepopulate the assignment form from the selected version if available,
        // otherwise use the most recent assignment for this template.
        const matchingVersion = validDetails.find((item) => item.template_version_id === selectedVersionId);
        applyAssignmentToForm(matchingVersion ?? validDetails[0] ?? null);
      } catch {
        setPreviousAssignments([]);
        applyAssignmentToForm(null);
      } finally {
        setLoadingPrevious(false);
      }
    };

    void loadPreviousAssignments();
  }, [actorUserId, templateDetail.id]);

  useEffect(() => {
    if (loadingPrevious) return;
    const matchingVersion = previousAssignments.find((item) => item.template_version_id === selectedVersionId);
    applyAssignmentToForm(matchingVersion ?? null);
  }, [loadingPrevious, previousAssignments, selectedVersionId]);

  const toggleUserType = (id: number) => {
    setSelectedUserTypeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleUser = (id: number) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleAssign = async () => {
    setError('');
    if (!selectedVersionId) { setError('Please select a template version.'); return; }
    if (selectedUserTypeIds.length === 0 && selectedUserIds.length === 0) {
      setError('Select at least one user type or individual user.');
      return;
    }

    setSaving(true);
    try {
      await apiRequest('/form-assignments', {
        method: 'POST',
        body: JSON.stringify({
          actorUserId,
          templateId: templateDetail.id,
          templateVersionId: selectedVersionId,
          instructions: instructions.trim(),
          openAt: openAt || undefined,
          closeAt: closeAt || undefined,
          userTypeIds: selectedUserTypeIds,
          userIds: selectedUserIds,
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assignment failed');
    } finally {
      setSaving(false);
    }
  };

  const publishedVersions = templateDetail.versions.filter((v) => v.status === 'published');
  const versionsForSelect = publishedVersions.length > 0 ? publishedVersions : templateDetail.versions;
  const endUsers = lookupUsers.filter((u) => u.role === 'USER');
  const userTypeNameById = new Map(lookupUserTypes.map((ut) => [ut.id, ut.name]));
  const userNameById = new Map(endUsers.map((u) => [u.id, u.full_name]));

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-slate-900/20"
      />
      <motion.aside
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.24, ease: 'easeInOut' }}
        className="fixed right-0 top-0 z-50 h-screen w-full max-w-2xl overflow-y-auto border-l border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-950"
      >
        <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-700">
          <div>
            <h3 className="text-lg font-semibold">Assign Form</h3>
            <p className="text-xs text-slate-500">
              {templateDetail.versions[0]?.title ?? 'Form Template'}
            </p>
          </div>
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
            Close
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-[3px] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {error}
          </div>
        )}

        <div className="mb-3 flex gap-4 border-b border-slate-200 text-sm dark:border-slate-700">
          <button
            onClick={() => setActiveTab('details')}
            className={`whitespace-nowrap border-b-2 px-1 py-2 ${
              activeTab === 'details'
                ? 'border-[var(--theme-button)] text-[var(--theme-button)]'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab('previouslyAssigned')}
            className={`whitespace-nowrap border-b-2 px-1 py-2 ${
              activeTab === 'previouslyAssigned'
                ? 'border-[var(--theme-button)] text-[var(--theme-button)]'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Previously Assigned
          </button>
        </div>

        <div className="space-y-4 text-sm">
          {activeTab === 'details' ? (
            <>
              {/* Version selector */}
              <label className="block">
                <span className="mb-1 block text-xs uppercase text-slate-500">Template Version</span>
                <select
                  value={selectedVersionId}
                  onChange={(e) => setSelectedVersionId(Number(e.target.value))}
                  className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700 dark:bg-slate-900"
                >
                  {versionsForSelect.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version_number} — {v.title} ({v.status})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  Existing assignments keep their original version. New submissions will use the selected version.
                </p>
              </label>

              {/* Instructions */}
              <label className="block">
                <span className="mb-1 block text-xs uppercase text-slate-500">Instructions for Recipients</span>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={3}
                  className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700 dark:bg-slate-900"
                  placeholder="e.g. Please complete this form by the end of the week."
                />
              </label>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs uppercase text-slate-500">Open Date (Optional)</span>
                  <input
                    type="date"
                    value={openAt}
                    onChange={(e) => setOpenAt(e.target.value)}
                    className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700 dark:bg-slate-900"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs uppercase text-slate-500">Close Date (Optional)</span>
                  <input
                    type="date"
                    value={closeAt}
                    onChange={(e) => setCloseAt(e.target.value)}
                    className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700 dark:bg-slate-900"
                  />
                </label>
              </div>

              {/* User types */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
                  Target User Types ({selectedUserTypeIds.length} selected)
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {lookupUserTypes.map((ut) => (
                    <label key={ut.id} className="flex cursor-pointer items-center gap-2 rounded-[3px] border border-slate-200 px-3 py-2 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                      <input
                        type="checkbox"
                        checked={selectedUserTypeIds.includes(ut.id)}
                        onChange={() => toggleUserType(ut.id)}
                        className="h-4 w-4"
                      />
                      <span className="text-sm">{ut.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Individual users */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
                  Specific Users ({selectedUserIds.length} selected)
                </p>
                {endUsers.length === 0 ? (
                  <p className="text-xs text-slate-400">No end users found.</p>
                ) : (
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-[3px] border border-slate-200 p-2 dark:border-slate-700">
                    {endUsers.map((u) => (
                      <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-[3px] px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">
                        <input
                          type="checkbox"
                          checked={selectedUserIds.includes(u.id)}
                          onChange={() => toggleUser(u.id)}
                          className="h-4 w-4"
                        />
                        <span className="text-sm">{u.full_name}</span>
                        <span className="text-xs text-slate-400">{u.user_type_name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
                <button
                  onClick={handleAssign}
                  disabled={saving}
                  className="rounded-[3px] border border-blue-400 bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'Assigning...' : 'Assign Form'}
                </button>
                <button
                  onClick={onClose}
                  className="rounded-[3px] border border-slate-300 px-4 py-2 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <section>
              <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Previously Assigned</p>
              {loadingPrevious ? (
                <div className="rounded-[3px] border border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-700">
                  Loading previous assignments...
                </div>
              ) : previousAssignments.length === 0 ? (
                <div className="rounded-[3px] border border-dashed border-slate-300 p-3 text-xs text-slate-400 dark:border-slate-700">
                  No previous assignments for this template.
                </div>
              ) : (
                <div className="max-h-[28rem] space-y-2 overflow-y-auto rounded-[3px] border border-slate-200 p-2 dark:border-slate-700">
                  {previousAssignments.map((item) => {
                    const assignedUserTypes = item.userTypeIds
                      .map((id) => userTypeNameById.get(id))
                      .filter((name): name is string => Boolean(name));
                    const assignedUsers = item.userIds
                      .map((id) => userNameById.get(id))
                      .filter((name): name is string => Boolean(name));

                    return (
                      <div key={item.id} className="rounded-[3px] border border-slate-200 p-2 dark:border-slate-700">
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                          {item.title_override || item.template_title} · v{item.version_number}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Assigned {new Date(item.created_at).toLocaleString()}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
                          User Types: {assignedUserTypes.length ? assignedUserTypes.join(', ') : 'None'}
                        </p>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300">
                          Users: {assignedUsers.length ? assignedUsers.join(', ') : 'None'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
