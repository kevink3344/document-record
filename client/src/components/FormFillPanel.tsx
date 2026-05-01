import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Edit3, Clock } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { SignatureModal } from './SignatureModal';
import type {
  FormAssignment,
  FormResponse,
  FormTemplateField,
  FormResponseAnswer,
  LookupUser,
  UserSignature,
} from '../types';

type Props = {
  assignment: FormAssignment;
  fields: FormTemplateField[];
  existingResponse: FormResponse | null;
  currentUserId: number;
  onClose: () => void;
  onSaved: () => void;
};

type AnswerMap = Record<number, string>; // fieldId → string value
type AnswerJsonMap = Record<number, string | null>; // fieldId -> JSON payload

type AttachmentValue = {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
};

type SignatureValue = {
  imageDataUrl: string;
  signedName: string;
  signedAt: string;
};

function getInitialAnswers(fields: FormTemplateField[], existing: FormResponse | null): AnswerMap {
  const map: AnswerMap = {};
  fields.forEach((f) => { map[f.id] = ''; });
  if (existing?.answers) {
    existing.answers.forEach((a: FormResponseAnswer) => { map[a.field_id] = a.value_text ?? ''; });
  }
  return map;
}

function getInitialAnswerJson(fields: FormTemplateField[], existing: FormResponse | null): AnswerJsonMap {
  const map: AnswerJsonMap = {};
  fields.forEach((f) => { map[f.id] = null; });
  if (existing?.answers) {
    existing.answers.forEach((a: FormResponseAnswer) => { map[a.field_id] = a.value_json ?? null; });
  }
  return map;
}

function parseAttachmentValue(valueJson: string | null | undefined): AttachmentValue | null {
  if (!valueJson) return null;
  try {
    const parsed = JSON.parse(valueJson) as Partial<AttachmentValue>;
    if (
      typeof parsed.name === 'string' &&
      typeof parsed.type === 'string' &&
      typeof parsed.size === 'number' &&
      typeof parsed.dataUrl === 'string'
    ) {
      return parsed as AttachmentValue;
    }
  } catch {
    // Ignore parse errors and treat as no attachment.
  }
  return null;
}

function parseSignatureValue(valueJson: string | null | undefined): SignatureValue | null {
  if (!valueJson) return null;
  try {
    const parsed = JSON.parse(valueJson) as Partial<SignatureValue>;
    if (
      typeof parsed.imageDataUrl === 'string' &&
      typeof parsed.signedName === 'string' &&
      typeof parsed.signedAt === 'string'
    ) {
      return parsed as SignatureValue;
    }
  } catch {
    // Ignore parse errors and treat as no signature.
  }
  return null;
}

function bytesToLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Unable to read file'));
    reader.readAsDataURL(file);
  });
}

function parseOptions(config_json: string): string[] {
  try {
    const parsed = JSON.parse(config_json) as { options?: string[] };
    return Array.isArray(parsed.options) ? parsed.options : [];
  } catch {
    return [];
  }
}

export function FormFillPanel({ assignment, fields, existingResponse, currentUserId, onClose, onSaved }: Props) {
  const isSubmitted = existingResponse?.status === 'submitted';
  const [editMode, setEditMode] = useState(!isSubmitted);
  const [answers, setAnswers] = useState<AnswerMap>(() => getInitialAnswers(fields, existingResponse));
  const [answerJson, setAnswerJson] = useState<AnswerJsonMap>(() => getInitialAnswerJson(fields, existingResponse));
  const [changeSummary, setChangeSummary] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'form' | 'history'>('form');
  const [signatureModalFieldId, setSignatureModalFieldId] = useState<number | null>(null);
  const [savedSignatures, setSavedSignatures] = useState<UserSignature[]>([]);
  const [loadingSavedSignatures, setLoadingSavedSignatures] = useState(false);
  const [currentUserName, setCurrentUserName] = useState(`User ${currentUserId}`);

  useEffect(() => {
    const loadCurrentUserName = async () => {
      try {
        const lookups = await apiRequest<{ users: LookupUser[] }>('/lookups');
        const match = lookups?.users?.find((u) => u.id === currentUserId);
        setCurrentUserName(match?.full_name ?? `User ${currentUserId}`);
      } catch {
        setCurrentUserName(`User ${currentUserId}`);
      }
    };

    void loadCurrentUserName();
  }, [currentUserId]);

  useEffect(() => {
    setAnswers(getInitialAnswers(fields, existingResponse));
    setAnswerJson(getInitialAnswerJson(fields, existingResponse));
    setEditMode(!isSubmitted);
  }, [existingResponse, fields, isSubmitted]);

  const setAnswer = (fieldId: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
  };

  const setAnswerPayload = (fieldId: number, valueText: string, valueJson: string | null) => {
    setAnswers((prev) => ({ ...prev, [fieldId]: valueText }));
    setAnswerJson((prev) => ({ ...prev, [fieldId]: valueJson }));
  };

  const toggleMultiOption = (fieldId: number, option: string) => {
    setAnswers((prev) => {
      const current = prev[fieldId] ? prev[fieldId].split('||') : [];
      const next = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option];
      return { ...prev, [fieldId]: next.join('||') };
    });
  };

  const validateRequired = (): boolean => {
    for (const field of fields) {
      if (field.is_required && !answers[field.id]?.trim()) {
        setError(`"${field.label}" is required.`);
        return false;
      }
    }
    return true;
  };

  const buildAnswerPayload = () =>
    fields.map((f) => ({
      fieldId: f.id,
      valueText: answers[f.id] ?? '',
      valueJson: answerJson[f.id] ?? null,
    }));

  const handleAttachmentChange = async (fieldId: number, file: File | null) => {
    if (!file) {
      setAnswerPayload(fieldId, '', null);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const payload: AttachmentValue = {
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl,
      };
      setAnswerPayload(fieldId, file.name, JSON.stringify(payload));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'File upload failed');
    }
  };

  const openSignatureModal = async (fieldId: number) => {
    setError('');
    setSignatureModalFieldId(fieldId);
    setLoadingSavedSignatures(true);
    try {
      const signatures = await apiRequest<UserSignature[]>(
        `/signatures?actorUserId=${currentUserId}&userId=${currentUserId}`
      );
      setSavedSignatures(signatures ?? []);
    } catch {
      setSavedSignatures([]);
    } finally {
      setLoadingSavedSignatures(false);
    }
  };

  const handleSignatureAgree = (payload: { imageDataUrl: string; signedName: string; signedAt: string }) => {
    if (signatureModalFieldId == null) return;
    setAnswerPayload(signatureModalFieldId, payload.signedName || 'Signature captured', JSON.stringify(payload));
    setSignatureModalFieldId(null);
  };

  const handleSubmit = async () => {
    setError('');
    if (!validateRequired()) return;
    setSaving(true);
    try {
      if (existingResponse) {
        await apiRequest(`/form-responses/${existingResponse.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            actorUserId: currentUserId,
            answers: buildAnswerPayload(),
            changeSummary: changeSummary.trim() || 'Response updated',
            submit: true,
          }),
        });
      } else {
        await apiRequest('/form-responses', {
          method: 'POST',
          body: JSON.stringify({
            actorUserId: currentUserId,
            assignmentId: assignment.id,
            userId: currentUserId,
            answers: buildAnswerPayload(),
            submit: true,
          }),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSaving(false);
    }
  };

  const displayTitle = assignment.title_override || assignment.template_title;
  const revisions = existingResponse?.revisions ?? [];

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
        {/* Header */}
        <div className="mb-3 flex items-start justify-between border-b border-slate-200 pb-2 dark:border-slate-700">
          <div>
            <h3 className="text-lg font-semibold leading-snug">{displayTitle}</h3>
            <p className="text-xs text-slate-500">
              v{assignment.version_number}
              {assignment.close_at && ` · Due ${new Date(assignment.close_at).toLocaleDateString()}`}
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
            Close
          </button>
        </div>

        {/* Status banner */}
        {isSubmitted && !editMode && (
          <div className="mb-3 flex items-center justify-between rounded-[3px] border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950">
            <div>
              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Submitted</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                {existingResponse?.last_submitted_at
                  ? new Date(existingResponse.last_submitted_at).toLocaleString()
                  : ''}
                {existingResponse?.last_edited_at && (
                  <span className="ml-2 text-emerald-600">
                    · Last edited {new Date(existingResponse.last_edited_at).toLocaleString()}
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={() => setEditMode(true)}
              className="flex items-center gap-1 rounded-[3px] border border-emerald-400 bg-white px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 dark:border-emerald-700 dark:bg-slate-900 dark:text-emerald-300"
            >
              <Edit3 size={12} /> Edit
            </button>
          </div>
        )}

        {/* Instructions */}
        {assignment.instructions && (
          <div className="mb-3 rounded-[3px] border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
            {assignment.instructions}
          </div>
        )}

        {/* Tabs — only when there's revision history */}
        {isSubmitted && revisions.length > 0 && (
          <div className="mb-3 flex gap-4 border-b border-slate-200 text-sm dark:border-slate-700">
            {(['form', 'history'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap border-b-2 px-1 py-2 capitalize ${
                  activeTab === tab
                    ? 'border-[var(--theme-button)] text-[var(--theme-button)]'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab === 'form' ? 'Form' : `Revision History (${revisions.length})`}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-[3px] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {error}
          </div>
        )}

        {/* Form tab */}
        {activeTab === 'form' && (
          <div className="space-y-4">
            {fields.map((field) => {
              const value = answers[field.id] ?? '';
              const options = parseOptions(field.config_json);

              return (
                <div key={field.id}>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-800 dark:text-slate-200">
                      {field.label}
                      {field.is_required === 1 && <span className="ml-1 text-red-500">*</span>}
                    </span>
                    {field.help_text && (
                      <p className="mb-1.5 text-xs text-slate-500">{field.help_text}</p>
                    )}

                    {/* Render based on type */}
                    {field.field_type === 'short_text' && (
                      <input
                        value={value}
                        onChange={(e) => setAnswer(field.id, e.target.value)}
                        disabled={!editMode}
                        className="w-full border border-slate-300 px-2 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:disabled:bg-slate-800"
                      />
                    )}

                    {field.field_type === 'long_text' && (
                      <textarea
                        value={value}
                        onChange={(e) => setAnswer(field.id, e.target.value)}
                        disabled={!editMode}
                        rows={5}
                        className="w-full border border-slate-300 px-2 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:disabled:bg-slate-800"
                      />
                    )}

                    {field.field_type === 'number' && (
                      <input
                        type="number"
                        value={value}
                        onChange={(e) => setAnswer(field.id, e.target.value)}
                        disabled={!editMode}
                        className="w-full border border-slate-300 px-2 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:disabled:bg-slate-800"
                      />
                    )}

                    {field.field_type === 'date' && (
                      <input
                        type="date"
                        value={value}
                        onChange={(e) => setAnswer(field.id, e.target.value)}
                        disabled={!editMode}
                        className="w-full border border-slate-300 px-2 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:disabled:bg-slate-800"
                      />
                    )}

                    {field.field_type === 'checkbox' && (
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`chk-${field.id}`}
                          checked={value === '1'}
                          onChange={(e) => setAnswer(field.id, e.target.checked ? '1' : '0')}
                          disabled={!editMode}
                          className="h-4 w-4"
                        />
                        <label htmlFor={`chk-${field.id}`} className="text-sm">
                          {value === '1' ? 'Yes' : 'No'}
                        </label>
                      </div>
                    )}

                    {field.field_type === 'single_select' && (
                      <select
                        value={value}
                        onChange={(e) => setAnswer(field.id, e.target.value)}
                        disabled={!editMode}
                        className="w-full border border-slate-300 px-2 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900"
                      >
                        <option value="">-- Select --</option>
                        {options.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    )}

                    {field.field_type === 'multi_select' && (
                      <div className="space-y-1">
                        {options.map((o) => {
                          const selected = value.split('||').includes(o);
                          return (
                            <label key={o} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => editMode && toggleMultiOption(field.id, o)}
                                disabled={!editMode}
                                className="h-4 w-4"
                              />
                              <span className="text-sm">{o}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {field.field_type === 'attachment' && (
                      <div className="space-y-2">
                        {editMode ? (
                          <input
                            type="file"
                            onChange={(e) => void handleAttachmentChange(field.id, e.target.files?.[0] ?? null)}
                            className="w-full border border-slate-300 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                          />
                        ) : null}

                        {(() => {
                          const attachment = parseAttachmentValue(answerJson[field.id]);
                          if (!attachment && !value) {
                            return <p className="text-xs italic text-slate-400">No attachment uploaded</p>;
                          }
                          if (!attachment) {
                            return <p className="text-sm">{value}</p>;
                          }
                          return (
                            <div className="rounded-[3px] border border-slate-200 p-2 text-xs dark:border-slate-700">
                              <p className="font-semibold text-slate-800 dark:text-slate-200">{attachment.name}</p>
                              <p className="text-slate-500">{attachment.type} · {bytesToLabel(attachment.size)}</p>
                              <a
                                href={attachment.dataUrl}
                                download={attachment.name}
                                className="mt-1 inline-block text-[var(--theme-button)] underline"
                                target="_blank"
                                rel="noreferrer"
                              >
                                Download / Open
                              </a>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {field.field_type === 'signature' && (
                      <div className="space-y-2">
                        {(() => {
                          const signature = parseSignatureValue(answerJson[field.id]);
                          if (!signature) {
                            return <p className="text-xs italic text-slate-400">No signature captured</p>;
                          }
                          return (
                            <div className="rounded-[3px] border border-slate-200 p-2 text-xs dark:border-slate-700">
                              <img
                                src={signature.imageDataUrl}
                                alt="Captured signature"
                                className="max-h-24 w-full rounded-[3px] border border-slate-200 bg-white p-1 dark:border-slate-700"
                              />
                              <p className="mt-1 text-slate-600 dark:text-slate-300">
                                Signed by {signature.signedName || 'Unknown'}
                                {signature.signedAt ? ` · ${new Date(signature.signedAt).toLocaleString()}` : ''}
                              </p>
                            </div>
                          );
                        })()}

                        {editMode && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => void openSignatureModal(field.id)}
                              className="rounded-[3px] border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300"
                            >
                              {parseSignatureValue(answerJson[field.id]) ? 'Replace Signature' : 'Select or Sign'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setAnswerPayload(field.id, '', null)}
                              className="rounded-[3px] border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                            >
                              Clear
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </label>
                </div>
              );
            })}

            {/* Change summary when editing an existing submission */}
            {editMode && existingResponse && (
              <label className="block">
                <span className="mb-1 block text-xs uppercase text-slate-500">Change Summary (Optional)</span>
                <input
                  value={changeSummary}
                  onChange={(e) => setChangeSummary(e.target.value)}
                  className="w-full border border-slate-300 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  placeholder="e.g. Added missing staff name"
                />
              </label>
            )}

            {/* Actions */}
            {editMode && (
              <div className="flex gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="rounded-[3px] border border-blue-400 bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'Submitting...' : existingResponse ? 'Re-submit' : 'Submit Form'}
                </button>
                {existingResponse && (
                  <button
                    onClick={() => {
                      setEditMode(false);
                      setAnswers(getInitialAnswers(fields, existingResponse));
                      setAnswerJson(getInitialAnswerJson(fields, existingResponse));
                    }}
                    className="rounded-[3px] border border-slate-300 px-4 py-2 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                  >
                    Cancel Edit
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="rounded-[3px] border border-slate-300 px-4 py-2 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        )}

        {/* History tab */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            {revisions.length === 0 ? (
              <p className="text-xs text-slate-500">No revision history yet.</p>
            ) : (
              revisions.map((rev) => (
                <div key={rev.id} className="rounded-[3px] border border-slate-200 p-3 dark:border-slate-700">
                  <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
                    <Clock size={12} />
                    <span className="font-semibold">Revision {rev.revision_number}</span>
                    <span>·</span>
                    <span>{new Date(rev.created_at).toLocaleString()}</span>
                    {rev.edited_by_name && (
                      <>
                        <span>·</span>
                        <span>{rev.edited_by_name}</span>
                      </>
                    )}
                  </div>
                  {rev.change_summary && (
                    <p className="mb-2 text-xs italic text-slate-600 dark:text-slate-400">
                      "{rev.change_summary}"
                    </p>
                  )}
                  <div className="space-y-1">
                    {(() => {
                      try {
                        const snapshot = JSON.parse(rev.snapshot_json) as Array<{ field_id: number; value_text: string }>;
                        return snapshot.map((a) => {
                          const field = fields.find((f) => f.id === a.field_id);
                          if (!field) return null;
                          return (
                            <div key={a.field_id} className="text-xs">
                              <span className="font-medium text-slate-600 dark:text-slate-400">{field.label}: </span>
                              <span className="text-slate-800 dark:text-slate-200">{a.value_text || <em className="text-slate-400">empty</em>}</span>
                            </div>
                          );
                        });
                      } catch {
                        return <p className="text-xs text-slate-400">Snapshot unavailable.</p>;
                      }
                    })()}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </motion.aside>

      <SignatureModal
        isOpen={signatureModalFieldId !== null}
        userName={answers[signatureModalFieldId ?? -1] || currentUserName}
        disclaimerText="Sign this field to confirm your response."
        savedSignatures={savedSignatures}
        loadingSavedSignatures={loadingSavedSignatures}
        saving={false}
        onClose={() => setSignatureModalFieldId(null)}
        onAgree={handleSignatureAgree}
      />
    </AnimatePresence>
  );
}
