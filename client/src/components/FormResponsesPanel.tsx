import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Clock, ChevronLeft } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type {
  FormAssignment,
  FormResponse,
  FormTemplateField,
} from '../types';

type Props = {
  assignment: FormAssignment;
  fields: FormTemplateField[];
  actorUserId: number;
  onClose: () => void;
};

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
    // Ignore parse errors.
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
    // Ignore parse errors.
  }
  return null;
}

function bytesToLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUtcTimestamp(value: string | null | undefined): string {
  if (!value) return '';
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const withZone = /Z|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
  const parsed = new Date(withZone);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export function FormResponsesPanel({ assignment, fields, actorUserId, onClose }: Props) {
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedResponse, setSelectedResponse] = useState<FormResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'answers' | 'history'>('answers');

  useEffect(() => {
    setLoading(true);
    apiRequest<FormResponse[]>(
      `/form-responses/assignment/${assignment.id}?actorUserId=${actorUserId}`
    )
      .then((data) => setResponses(data ?? []))
      .finally(() => setLoading(false));
  }, [assignment.id, actorUserId]);

  const loadFullResponse = async (responseId: number) => {
    const full = await apiRequest<FormResponse>(
      `/form-responses/${responseId}?actorUserId=${actorUserId}`
    );
    if (full) setSelectedResponse(full);
  };

  const displayTitle = assignment.title_override || assignment.template_title;

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
            <h3 className="text-lg font-semibold">{selectedResponse ? 'Response Detail' : 'Responses'}</h3>
            <p className="text-xs text-slate-500">
              {displayTitle} · v{assignment.version_number}
            </p>
          </div>
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
            Close
          </button>
        </div>

        {/* Response detail view */}
        {selectedResponse ? (
          <div>
            <button
              onClick={() => setSelectedResponse(null)}
              className="mb-3 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              <ChevronLeft size={13} /> Back to all responses
            </button>

            {/* User info */}
            <div className="mb-3 rounded-[3px] border border-slate-200 p-3 text-xs dark:border-slate-700">
              <p className="font-semibold text-sm">{selectedResponse.user_name ?? `User #${selectedResponse.user_id}`}</p>
              <p className="mt-1 text-slate-500">
                {selectedResponse.first_submitted_at
                  ? `First submitted: ${formatUtcTimestamp(selectedResponse.first_submitted_at)}`
                  : 'Not yet submitted'}
              </p>
              {selectedResponse.last_edited_at && (
                <p className="text-slate-500">
                  Last edited: {formatUtcTimestamp(selectedResponse.last_edited_at)}
                </p>
              )}
              <span
                className={`mt-1 inline-flex rounded-[3px] px-1.5 py-0.5 text-xs font-semibold ${
                  selectedResponse.status === 'submitted'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                }`}
              >
                {selectedResponse.status.toUpperCase()}
              </span>
            </div>

            {/* Tabs */}
            <div className="mb-3 flex gap-4 border-b border-slate-200 text-sm dark:border-slate-700">
              {(['answers', 'history'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`whitespace-nowrap border-b-2 px-1 py-2 capitalize ${
                    activeTab === tab
                      ? 'border-[var(--theme-button)] text-[var(--theme-button)]'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab === 'answers' ? 'Answers' : `Revisions (${selectedResponse.revisions?.length ?? 0})`}
                </button>
              ))}
            </div>

            {activeTab === 'answers' && (
              <div className="space-y-3">
                {fields.map((field) => {
                  const answer = selectedResponse.answers?.find((a) => a.field_id === field.id);
                  const attachment = field.field_type === 'attachment' ? parseAttachmentValue(answer?.value_json) : null;
                  const signature = field.field_type === 'signature' ? parseSignatureValue(answer?.value_json) : null;
                  return (
                    <div key={field.id} className="rounded-[3px] border border-slate-200 p-3 dark:border-slate-700">
                      <p className="text-xs font-semibold uppercase text-slate-500">{field.label}</p>
                      {field.field_type === 'attachment' ? (
                        <div className="mt-1">
                          {attachment ? (
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
                          ) : (
                            <p className="whitespace-pre-wrap text-sm">
                              {answer?.value_text ? answer.value_text : <span className="italic text-slate-400">No answer</span>}
                            </p>
                          )}
                        </div>
                      ) : field.field_type === 'signature' ? (
                        <div className="mt-1">
                          {signature ? (
                            <div className="rounded-[3px] border border-slate-200 p-2 text-xs dark:border-slate-700">
                              <img
                                src={signature.imageDataUrl}
                                alt="Submitted signature"
                                className="max-h-24 w-full rounded-[3px] border border-slate-200 bg-white p-1 dark:border-slate-700"
                              />
                              <p className="mt-1 text-slate-500">
                                Signed by {signature.signedName || 'Unknown'}
                                {signature.signedAt ? ` · ${new Date(signature.signedAt).toLocaleString()}` : ''}
                              </p>
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap text-sm">
                              {answer?.value_text ? answer.value_text : <span className="italic text-slate-400">No answer</span>}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="mt-1 whitespace-pre-wrap text-sm">
                          {answer?.value_text ? answer.value_text : <span className="italic text-slate-400">No answer</span>}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'history' && (
              <div className="space-y-3">
                {(selectedResponse.revisions ?? []).length === 0 ? (
                  <p className="text-xs text-slate-500">No revisions recorded.</p>
                ) : (
                  (selectedResponse.revisions ?? []).map((rev) => (
                    <div key={rev.id} className="rounded-[3px] border border-slate-200 p-3 dark:border-slate-700">
                      <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
                        <Clock size={12} />
                        <span className="font-semibold">Revision {rev.revision_number}</span>
                        <span>·</span>
                        <span>{formatUtcTimestamp(rev.created_at)}</span>
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
                                  <span className="whitespace-pre-wrap text-slate-800 dark:text-slate-200">
                                    {a.value_text || <em className="text-slate-400">empty</em>}
                                  </span>
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
          </div>
        ) : (
          /* Response list view */
          <div>
            {loading ? (
              <p className="text-sm text-slate-500">Loading responses...</p>
            ) : responses.length === 0 ? (
              <div className="rounded-[3px] border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400">
                No responses yet for this assignment.
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">
                  {responses.length} response{responses.length !== 1 ? 's' : ''} ·{' '}
                  {responses.filter((r) => r.status === 'submitted').length} submitted
                </p>
                {responses.map((resp) => (
                  <button
                    key={resp.id}
                    onClick={() => loadFullResponse(resp.id)}
                    className="w-full rounded-[3px] border border-slate-200 p-3 text-left hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-500"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">
                          {(resp as FormResponse & { user_name?: string }).user_name ?? `User #${resp.user_id}`}
                        </p>
                        <p className="text-xs text-slate-500">
                          {resp.last_submitted_at
                            ? `Submitted ${formatUtcTimestamp(resp.last_submitted_at)}`
                            : 'Draft'}
                          {resp.last_edited_at && ` · Edited ${formatUtcTimestamp(resp.last_edited_at)}`}
                        </p>
                      </div>
                      <span
                        className={`inline-flex rounded-[3px] px-1.5 py-0.5 text-xs font-semibold ${
                          resp.status === 'submitted'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}
                      >
                        {resp.status}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </motion.aside>
    </AnimatePresence>
  );
}
