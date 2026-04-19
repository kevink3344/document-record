import { useEffect, useRef, useState } from 'react';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import type { PDFPageProxy } from 'pdfjs-dist';

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

function PdfPageCanvas({ page }: { page: PDFPageProxy }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const renderPage = async () => {
      const viewport = page.getViewport({ scale: 1.1 });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvas, canvasContext: context, viewport }).promise;
    };
    renderPage();
  }, [page]);

  return <canvas ref={canvasRef} className="w-full mb-2 rounded-[3px] border border-slate-300" />;
}

export function PdfPreview({ url }: { url?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>('');
  const [pages, setPages] = useState<PDFPageProxy[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const normalizedUrl = (url ?? '').trim();
  const googleDocPreviewUrl = normalizedUrl ? getGoogleDocPreviewUrl(normalizedUrl) : null;
  const isGoogleDoc = Boolean(googleDocPreviewUrl);
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3001/api';

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const maxScroll = scrollHeight - clientHeight;
      const currentProgress = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0;
      setProgress(currentProgress);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [pages]);

  useEffect(() => {
    const _isPdf = normalizedUrl.toLowerCase().includes('.pdf');
    const _pdfUrlForPreview = (() => {
      if (!normalizedUrl) return '';
      try {
        const parsed = new URL(normalizedUrl);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          return `${apiBase}/pdf-proxy?url=${encodeURIComponent(parsed.toString())}`;
        }
      } catch {
        // Keep original URL for relative/local paths.
      }
      return normalizedUrl;
    })();

    if (!normalizedUrl) {
      setError('No document URL available for preview.');
      return;
    }

    if (!_isPdf) {
      setError('Inline preview unavailable for this document type. You can open it externally.');
      return;
    }

    let disposed = false;
    setError('');
    setLoading(true);
    setPages([]);
    setProgress(0);

    (async () => {
      try {
        const pdf = await getDocument({
          url: _pdfUrlForPreview,
          withCredentials: false,
        }).promise;
        const numPages = pdf.numPages;
        const loadedPages: PDFPageProxy[] = [];
        for (let i = 1; i <= numPages; i++) {
          if (disposed) break;
          const page = await pdf.getPage(i);
          loadedPages.push(page);
        }
        if (!disposed) {
          setPages(loadedPages);
          setLoading(false);
        }
      } catch (err) {
        if (!disposed) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          const errorName = err instanceof Error ? err.name : 'Unknown';
          console.error('[PDF Error]', { name: errorName, message: errorMsg, fullError: err });
          setError(`Unable to render PDF preview (${errorName}). You can open it externally.`);
          setLoading(false);
        }
      }
    })();

    return () => {
      disposed = true;
    };
  }, [apiBase, normalizedUrl]);

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
        <div className="relative">
          <div
            ref={containerRef}
            className="max-h-56 overflow-auto sm:max-h-72 pb-3"
          >
            {loading ? (
              <p className="text-sm text-slate-600">Loading PDF...</p>
            ) : (
              pages.map((page, index) => (
                <PdfPageCanvas key={index} page={page} />
              ))
            )}
          </div>
          {!loading && pages.length > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-200 rounded-b-[3px]">
              <div
                className="h-full bg-blue-500 transition-all duration-100"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}