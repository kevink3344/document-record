import { useEffect, useRef, useState } from 'react';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';

GlobalWorkerOptions.workerSrc = pdfWorker;

function getGoogleDocPreviewUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname !== 'docs.google.com') return null;
    if (!parsed.pathname.startsWith('/document/d/')) return null;

    const parts = parsed.pathname.split('/').filter(Boolean);
    const docId = parts[2];
    if (!docId) return null;

    return `https://docs.google.com/document/d/${docId}/preview`;
  } catch {
    return null;
  }
}

export function PdfPreview({ url }: { url?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string>('');

  const normalizedUrl = (url ?? '').trim();
  const isPdf = normalizedUrl.toLowerCase().includes('.pdf');
  const googleDocPreviewUrl = normalizedUrl ? getGoogleDocPreviewUrl(normalizedUrl) : null;
  const isGoogleDoc = Boolean(googleDocPreviewUrl);

  useEffect(() => {
    if (!normalizedUrl) {
      setError('No document URL available for preview.');
      return;
    }

    if (!isPdf) {
      setError('Inline preview unavailable for this document type. You can open it externally.');
      return;
    }

    let disposed = false;
    setError('');

    (async () => {
      try {
        const pdf = await getDocument({
          url: normalizedUrl,
          withCredentials: false,
        }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.1 });
        const canvas = canvasRef.current;
        if (!canvas || disposed) return;
        const context = canvas.getContext('2d');
        if (!context) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvas, canvasContext: context, viewport }).promise;
      } catch (err) {
        if (!disposed) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          const errorName = err instanceof Error ? err.name : 'Unknown';
          console.error('[PDF Error]', { name: errorName, message: errorMsg, fullError: err });
          setError(`Unable to render PDF preview (${errorName}). You can open it externally.`);
        }
      }
    })();

    return () => {
      disposed = true;
    };
  }, [isPdf, normalizedUrl]);

  return (
    <div className="rounded-[3px] border border-slate-200 bg-slate-50 p-2 sm:p-3">
      {isGoogleDoc ? (
        <div className="h-[26rem] w-full overflow-hidden rounded-[3px] border border-slate-300 bg-white">
          <iframe
            src={googleDocPreviewUrl ?? undefined}
            title="Google Doc preview"
            className="h-full w-full"
            loading="lazy"
          />
        </div>
      ) : error ? (
        <p className="text-sm text-slate-600 sm:text-xs">{error}</p>
      ) : (
        <div className="max-h-56 overflow-auto sm:max-h-72">
          <canvas ref={canvasRef} className="w-full rounded-[3px] border border-slate-300" />
        </div>
      )}
    </div>
  );
}