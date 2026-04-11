import { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { UserSignature } from '../types';

type UserSignaturesPanelProps = {
  signatures: UserSignature[];
  loading: boolean;
  saving: boolean;
  deletingSignatureId: number | null;
  settingDefaultSignatureId: number | null;
  onCreate: (payload: { name: string; imageDataUrl: string }) => Promise<void>;
  onDelete: (signatureId: number) => Promise<void>;
  onSetDefault: (signatureId: number) => Promise<void>;
};

export function UserSignaturesPanel({
  signatures,
  loading,
  saving,
  deletingSignatureId,
  settingDefaultSignatureId,
  onCreate,
  onDelete,
  onSetDefault,
}: UserSignaturesPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [signatureName, setSignatureName] = useState('');
  const [hasSignature, setHasSignature] = useState(false);

  const sortedSignatures = useMemo(() => {
    return [...signatures].sort((left, right) => {
      if (left.is_default !== right.is_default) return right.is_default - left.is_default;
      return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
    });
  }, [signatures]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(ratio, ratio);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
    setHasSignature(false);
  }, []);

  const getCanvasCoordinates = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    const { x, y } = getCanvasCoordinates(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCanvasCoordinates(event);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    drawingRef.current = false;
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    setHasSignature(false);
  };

  const createSignature = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature || !signatureName.trim()) return;
    await onCreate({
      name: signatureName.trim(),
      imageDataUrl: canvas.toDataURL('image/png'),
    });
    setSignatureName('');
    clearSignature();
  };

  return (
    <section className="space-y-4">
      <div className="rounded-[3px] border border-slate-200 bg-[var(--theme-card)] p-4 dark:border-slate-700">
        <h3 className="text-sm font-semibold uppercase">Saved Signatures</h3>
        <p className="mt-1 text-xs text-slate-500">
          Save one or more signatures and reuse them during acknowledgment.
        </p>
      </div>

      <div className="rounded-[3px] border border-slate-200 bg-[var(--theme-card)] p-4 dark:border-slate-700">
        <h4 className="text-sm font-semibold">Create Signature</h4>
        <div className="mt-3 space-y-3">
          <input
            value={signatureName}
            onChange={(event) => setSignatureName(event.target.value)}
            placeholder="Signature name (for example: Formal, Initials)"
            className="w-full border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"
          />
          <canvas
            ref={canvasRef}
            className="h-44 w-full touch-none rounded-[3px] border border-slate-300 bg-white dark:border-slate-700"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDrawing}
            onPointerLeave={stopDrawing}
            onPointerCancel={stopDrawing}
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={clearSignature}
              className="rounded-[3px] border border-slate-300 px-3 py-2 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              Clear
            </button>
            <button
              onClick={createSignature}
              disabled={!hasSignature || !signatureName.trim() || saving}
              className="rounded-[3px] border border-blue-500 bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Signature'}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-[3px] border border-slate-200 bg-[var(--theme-card)] p-4 dark:border-slate-700">
        <h4 className="text-sm font-semibold">Your Signature Library</h4>
        {loading ? (
          <p className="mt-3 text-xs text-slate-500">Loading signatures...</p>
        ) : sortedSignatures.length ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sortedSignatures.map((signature) => (
              <div key={signature.id} className="rounded-[3px] border border-slate-200 p-3 dark:border-slate-700">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {signature.name}
                      {signature.is_default ? (
                        <span className="ml-2 rounded-[3px] border border-blue-300 bg-blue-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-blue-700">
                          Default
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-500">Updated {new Date(signature.updated_at).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onSetDefault(signature.id)}
                      disabled={signature.is_default === 1 || settingDefaultSignatureId === signature.id}
                      className="rounded-[3px] border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {settingDefaultSignatureId === signature.id ? 'Setting...' : signature.is_default === 1 ? 'Default' : 'Set Default'}
                    </button>
                    <button
                      onClick={() => onDelete(signature.id)}
                      disabled={deletingSignatureId === signature.id}
                      className="rounded-[3px] border border-red-300 bg-red-50 p-1.5 text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                      title="Delete signature"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <img src={signature.signature_data} alt={signature.name} className="max-h-20 w-full rounded-[3px] border border-slate-200 bg-white p-1 dark:border-slate-700" />
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-500">No saved signatures yet. Create your first one above.</p>
        )}
      </div>
    </section>
  );
}
