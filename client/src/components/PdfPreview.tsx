import { useEffect, useRef, useState } from 'react';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';

GlobalWorkerOptions.workerSrc = pdfWorker;

export function PdfPreview({ url }: { url?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!url || !url.toLowerCase().includes('.pdf')) {
      setError('PDF preview unavailable for this document type.');
      return;
    }

    let disposed = false;
    setError('');

    (async () => {
      try {
        const pdf = await getDocument({
          url,
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
  }, [url]);

  return (
    <div className="rounded-[3px] border border-slate-200 bg-slate-50 p-3">
      {error ? (
        <p className="text-xs text-slate-600">{error}</p>
      ) : (
        <div className="max-h-72 overflow-auto">
          <canvas ref={canvasRef} className="w-full rounded-[3px] border border-slate-300" />
        </div>
      )}
    </div>
  );
}