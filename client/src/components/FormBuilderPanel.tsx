import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { FormFieldType, FormTemplateDetail } from '../types';

const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: 'short_text', label: 'Short Text' },
  { value: 'long_text', label: 'Long Text (Textarea)' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'single_select', label: 'Single Select (Dropdown)' },
  { value: 'multi_select', label: 'Multi Select' },
  { value: 'checkbox', label: 'Checkbox (Yes/No)' },
  { value: 'attachment', label: 'Attachment (Upload File)' },
  { value: 'signature', label: 'Signature' },
];

type DraftField = {
  id?: number;
  field_key: string;
  label: string;
  help_text: string;
  field_type: FormFieldType;
  is_required: number;
  sort_order: number;
  config_json: string; // JSON string with "options" for selects
};

type Props = {
  templateDetail: FormTemplateDetail | null; // null = create new
  actorUserId: number;
  onClose: () => void;
  onSaved: () => void;
};

function parseOptions(config_json: string): string {
  try {
    const parsed = JSON.parse(config_json) as { options?: string[] };
    return Array.isArray(parsed.options) ? parsed.options.join('\n') : '';
  } catch {
    return '';
  }
}

function buildConfigJson(fieldType: FormFieldType, optionsText: string): string {
  if (fieldType === 'single_select' || fieldType === 'multi_select') {
    const options = optionsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    return JSON.stringify({ options });
  }
  return '{}';
}

function makeKey(label: string, index: number): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || `field_${index + 1}`
  );
}

export function FormBuilderPanel({ templateDetail, actorUserId, onClose, onSaved }: Props) {
  const isEdit = templateDetail !== null;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('published');
  const [fields, setFields] = useState<DraftField[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expandedFieldIndex, setExpandedFieldIndex] = useState<number | null>(null);

  useEffect(() => {
    if (templateDetail) {
      const latest = templateDetail.versions[0];
      if (latest) {
        setTitle(latest.title);
        setDescription(latest.description);
        setStatus(latest.status === 'published' ? 'published' : 'draft');
      }
      setFields(
        templateDetail.latestFields.map((f) => ({
          id: f.id,
          field_key: f.field_key,
          label: f.label,
          help_text: f.help_text,
          field_type: f.field_type,
          is_required: f.is_required,
          sort_order: f.sort_order,
          config_json: f.config_json,
        }))
      );
    }
  }, [templateDetail]);

  const addField = () => {
    const newField: DraftField = {
      field_key: `field_${fields.length + 1}`,
      label: '',
      help_text: '',
      field_type: 'short_text',
      is_required: 0,
      sort_order: fields.length,
      config_json: '{}',
    };
    setFields((prev) => [...prev, newField]);
    setExpandedFieldIndex(fields.length);
  };

  const removeField = (index: number) => {
    setFields((prev) => prev.filter((_, i) => i !== index).map((f, i) => ({ ...f, sort_order: i })));
    setExpandedFieldIndex(null);
  };

  const updateField = (index: number, patch: Partial<DraftField>) => {
    setFields((prev) =>
      prev.map((f, i) => {
        if (i !== index) return f;
        const updated = { ...f, ...patch };
        if ('label' in patch) {
          updated.field_key = makeKey(patch.label ?? f.label, index);
        }
        return updated;
      })
    );
  };

  const moveField = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    setFields((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((f, i) => ({ ...f, sort_order: i }));
    });
    setExpandedFieldIndex(target);
  };

  const handleSave = async () => {
    setError('');
    if (!title.trim()) { setError('Title is required.'); return; }
    if (fields.some((f) => !f.label.trim())) { setError('All fields must have a label.'); return; }

    const payload = {
      actorUserId,
      title: title.trim(),
      description: description.trim(),
      status,
      fields: fields.map((f) => ({
        field_key: f.field_key,
        label: f.label.trim(),
        help_text: f.help_text.trim(),
        field_type: f.field_type,
        is_required: f.is_required,
        sort_order: f.sort_order,
        config_json: f.config_json,
      })),
    };

    setSaving(true);
    try {
      if (isEdit && templateDetail) {
        await apiRequest(`/form-templates/${templateDetail.id}/versions`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/form-templates', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMetadata = async () => {
    if (!isEdit || !templateDetail) return;
    setError('');
    if (!title.trim()) { setError('Title is required.'); return; }

    setSaving(true);
    try {
      await apiRequest(`/form-templates/${templateDetail.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          actorUserId,
          title: title.trim(),
          description: description.trim(),
          status,
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

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
            <h3 className="text-lg font-semibold">
              {isEdit ? 'Edit Template (New Version)' : 'New Form Template'}
            </h3>
            {isEdit && (
              <p className="text-xs text-slate-500">
                Use Save for title/description/status only. Use Save as New Version to change structure while preserving assignment history.
              </p>
            )}
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

        <div className="space-y-4 text-sm">
          {/* Metadata */}
          <section>
            <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Template Info</p>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs uppercase text-slate-500">Title *</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700 dark:bg-slate-900"
                  placeholder="e.g. CPR Staff"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs uppercase text-slate-500">Description</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700 dark:bg-slate-900"
                  placeholder="Optional description shown to users"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs uppercase text-slate-500">Status</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'draft' | 'published')}
                  className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </label>
            </div>
          </section>

          {/* Fields */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Form Fields ({fields.length})
              </p>
              <button
                onClick={addField}
                className="flex items-center gap-1 border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300"
              >
                <Plus size={12} /> Add Field
              </button>
            </div>

            {fields.length === 0 && (
              <p className="rounded-[3px] border border-dashed border-slate-300 p-4 text-center text-xs text-slate-400">
                No fields yet. Click "Add Field" to start building your form.
              </p>
            )}

            <div className="space-y-2">
              {fields.map((field, index) => (
                <div key={index} className="rounded-[3px] border border-slate-200 dark:border-slate-700">
                  {/* Field header */}
                  <div
                    className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800"
                    onClick={() => setExpandedFieldIndex(expandedFieldIndex === index ? null : index)}
                  >
                    <GripVertical size={14} className="shrink-0 text-slate-400" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-xs font-semibold">
                        {field.label || <span className="text-slate-400 italic">Untitled field</span>}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {FIELD_TYPES.find((t) => t.value === field.field_type)?.label ?? field.field_type}
                        {field.is_required ? ' · Required' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); moveField(index, -1); }}
                        disabled={index === 0}
                        className="px-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                        title="Move up"
                      >↑</button>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveField(index, 1); }}
                        disabled={index === fields.length - 1}
                        className="px-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                        title="Move down"
                      >↓</button>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeField(index); }}
                        className="text-red-400 hover:text-red-700"
                        title="Remove field"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Field editor */}
                  {expandedFieldIndex === index && (
                    <div className="space-y-3 border-t border-slate-200 p-3 dark:border-slate-700">
                      <label className="block">
                        <span className="mb-1 block text-xs uppercase text-slate-500">Label *</span>
                        <input
                          value={field.label}
                          onChange={(e) => updateField(index, { label: e.target.value })}
                          className="w-full border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                          placeholder="e.g. Enter your Staff List"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs uppercase text-slate-500">Help Text</span>
                        <input
                          value={field.help_text}
                          onChange={(e) => updateField(index, { help_text: e.target.value })}
                          className="w-full border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                          placeholder="Optional hint shown below the field"
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="block">
                          <span className="mb-1 block text-xs uppercase text-slate-500">Field Type</span>
                          <select
                            value={field.field_type}
                            onChange={(e) =>
                              updateField(index, {
                                field_type: e.target.value as FormFieldType,
                                config_json: '{}',
                              })
                            }
                            className="w-full border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                          >
                            {FIELD_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex items-center gap-2 pt-5">
                          <input
                            type="checkbox"
                            checked={field.is_required === 1}
                            onChange={(e) => updateField(index, { is_required: e.target.checked ? 1 : 0 })}
                            className="h-4 w-4"
                          />
                          <span className="text-sm">Required</span>
                        </label>
                      </div>
                      {(field.field_type === 'single_select' || field.field_type === 'multi_select') && (
                        <label className="block">
                          <span className="mb-1 block text-xs uppercase text-slate-500">
                            Options (one per line)
                          </span>
                          <textarea
                            value={parseOptions(field.config_json)}
                            onChange={(e) =>
                              updateField(index, {
                                config_json: buildConfigJson(field.field_type, e.target.value),
                              })
                            }
                            rows={4}
                            className="w-full border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                            placeholder={"Option A\nOption B\nOption C"}
                          />
                        </label>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Actions */}
          <div className="flex gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
            {isEdit && (
              <button
                onClick={handleSaveMetadata}
                disabled={saving}
                className="rounded-[3px] border border-emerald-400 bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-[3px] border border-blue-400 bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving...' : isEdit ? 'Save as New Version' : 'Create Template'}
            </button>
            <button
              onClick={onClose}
              className="rounded-[3px] border border-slate-300 px-4 py-2 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
