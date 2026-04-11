import { useEffect, useMemo, useRef, useState } from 'react';
import type { UserSignature } from '../types';

type SignatureModalProps = {
  isOpen: boolean;
  userName: string;
  disclaimerText: string;
  savedSignatures: UserSignature[];
  loadingSavedSignatures: boolean;
  saving: boolean;
  onClose: () => void;
  onAgree: (payload: { imageDataUrl: string; signedName: string; signedAt: string }) => void;
};

export function SignatureModal({
  isOpen,
  userName,
  disclaimerText,
  savedSignatures,
  loadingSavedSignatures,
  saving,
  onClose,
  onAgree,
}: SignatureModalProps) {
  const [mode, setMode] = useState<'SAVED' | 'DRAW'>('DRAW');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [signedName, setSignedName] = useState(userName);
  const [selectedSavedSignatureId, setSelectedSavedSignatureId] = useState<number | null>(null);

  const sortedSavedSignatures = useMemo(() => {
    return [...savedSignatures].sort((left, right) => {
      if (left.is_default !== right.is_default) return right.is_default - left.is_default;
      return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
    });
  }, [savedSignatures]);

  useEffect(() => {
    if (!isOpen) return;
    setSignedName(userName);
    setHasSignature(false);
    if (sortedSavedSignatures.length) {
      const preferred = sortedSavedSignatures.find((item) => item.is_default === 1) ?? sortedSavedSignatures[0];
      setMode('SAVED');
      setSelectedSavedSignatureId(preferred.id);
    } else {
      setMode('DRAW');
      setSelectedSavedSignatureId(null);
    }

    if (sortedSavedSignatures.length && mode !== 'DRAW') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    canvas.width = Math.floor(displayWidth * ratio);
    canvas.height = Math.floor(displayHeight * ratio);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(ratio, ratio);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, displayWidth, displayHeight);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
  }, [isOpen, userName, sortedSavedSignatures]);

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

  const handleAgree = () => {
    if (!signedName.trim()) return;

    if (mode === 'SAVED') {
      const selected = sortedSavedSignatures.find((item) => item.id === selectedSavedSignatureId);
      if (!selected) return;
      onAgree({
        imageDataUrl: selected.signature_data,
        signedName: signedName.trim(),
        signedAt: new Date().toISOString(),
      });
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return;

    onAgree({
      imageDataUrl: canvas.toDataURL('image/png'),
      signedName: signedName.trim(),
      signedAt: new Date().toISOString(),
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-3xl rounded-[4px] border border-slate-300 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-950">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Signature Required</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Sign below to acknowledge that you have read and understand this document.
        </p>

        <div className="mt-3 rounded-[3px] border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          {disclaimerText ||
            'By signing this acknowledgment, you confirm that you have read and understood the document and agree to comply with its requirements.'}
        </div>

        <div className="mt-3 flex gap-5 border-b border-slate-200 text-sm dark:border-slate-700">
          {[
            { id: 'SAVED' as const, label: `Saved (${savedSignatures.length})` },
            { id: 'DRAW' as const, label: 'Draw Signature' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMode(tab.id)}
              className={`border-b-2 px-1 py-2 ${mode === tab.id ? 'border-[var(--theme-button)] text-[var(--theme-button)]' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-3">
          <label className="mb-1 block text-xs uppercase text-slate-500">Signed Name</label>
          <input
            value={signedName}
            onChange={(event) => setSignedName(event.target.value)}
            className="w-full border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"
            placeholder="Type your full name"
          />
        </div>

        {mode === 'SAVED' ? (
          <div className="mt-3 space-y-2">
            {loadingSavedSignatures ? (
              <p className="text-xs text-slate-500">Loading saved signatures...</p>
            ) : sortedSavedSignatures.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {sortedSavedSignatures.map((signature) => (
                  <button
                    key={signature.id}
                    type="button"
                    onClick={() => setSelectedSavedSignatureId(signature.id)}
                    className={`rounded-[3px] border p-2 text-left ${selectedSavedSignatureId === signature.id ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/40' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'}`}
                  >
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {signature.name}
                      {signature.is_default ? (
                        <span className="ml-2 rounded-[3px] border border-blue-300 bg-blue-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-blue-700">
                          Default
                        </span>
                      ) : null}
                    </p>
                    <img src={signature.signature_data} alt={signature.name} className="mt-2 max-h-20 w-full rounded-[3px] border border-slate-200 bg-white p-1 dark:border-slate-700" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                No saved signatures found. Switch to "Draw Signature" to continue.
              </p>
            )}
          </div>
        ) : (
          <div className="mt-3">
            <label className="mb-1 block text-xs uppercase text-slate-500">Draw Signature</label>
            <canvas
              ref={canvasRef}
              className="h-52 w-full touch-none rounded-[3px] border border-slate-300 bg-white dark:border-slate-700"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={stopDrawing}
              onPointerLeave={stopDrawing}
              onPointerCancel={stopDrawing}
            />
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {mode === 'DRAW' && (
            <button
              onClick={clearSignature}
              className="rounded-[3px] border border-slate-300 px-3 py-2 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              Clear Signature
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-[3px] border border-slate-300 px-3 py-2 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={handleAgree}
            disabled={
              !signedName.trim() ||
              saving ||
              (mode === 'DRAW' ? !hasSignature : !selectedSavedSignatureId)
            }
            className="rounded-[3px] border border-blue-500 bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'I Agree'}
          </button>
        </div>
      </div>
    </div>
  );
}
