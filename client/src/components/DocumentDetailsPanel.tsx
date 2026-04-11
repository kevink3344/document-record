import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Download, FileCheck2, Pin, PinOff } from 'lucide-react';
import { PdfPreview } from './PdfPreview';
import type { DetailTab, DocumentDetails } from '../types';

type DocumentDetailsPanelProps = {
  docDetails: DocumentDetails | null;
  isOpen: boolean;
  panelWidth: number;
  panelPinned: boolean;
  activeDetailTab: DetailTab;
  canAcknowledge: boolean;
  onTogglePinned: () => void;
  onClose: () => void;
  onPanelWidthChange: (width: number) => void;
  onTabChange: (tab: DetailTab) => void;
  onAcknowledge: () => void;
};

export function DocumentDetailsPanel({
  docDetails,
  isOpen,
  panelWidth,
  panelPinned,
  activeDetailTab,
  canAcknowledge,
  onTogglePinned,
  onClose,
  onPanelWidthChange,
  onTabChange,
  onAcknowledge,
}: DocumentDetailsPanelProps) {
  const [isResizing, setIsResizing] = useState(false);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      resizeCleanupRef.current?.();
    };
  }, []);

  const beginResize = (startEvent: React.PointerEvent<HTMLDivElement>) => {
    startEvent.preventDefault();
    setIsResizing(true);

    const updateWidth = (clientX: number) => {
      const viewportWidth = window.innerWidth || 1;
      const nextWidth = ((viewportWidth - clientX) / viewportWidth) * 100;
      const clampedWidth = Math.min(70, Math.max(35, nextWidth));
      onPanelWidthChange(Number(clampedWidth.toFixed(2)));
    };

    updateWidth(startEvent.clientX);

    const handlePointerMove = (event: PointerEvent) => {
      updateWidth(event.clientX);
    };

    const stopResize = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      resizeCleanupRef.current = null;
      setIsResizing(false);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
    resizeCleanupRef.current = stopResize;
  };

  return (
    <AnimatePresence>
      {isOpen && docDetails && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => (panelPinned ? null : onClose())}
            className="fixed inset-0 z-30 bg-slate-900/20"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.24, ease: 'easeInOut' }}
            style={{ width: `${panelWidth}%` }}
            className="fixed right-0 top-0 z-40 h-screen overflow-y-auto border-l border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-950"
          >
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize document panel"
              onPointerDown={beginResize}
              className={`absolute left-0 top-0 h-full w-3 -translate-x-1/2 cursor-col-resize ${isResizing ? 'bg-blue-200/40 dark:bg-blue-400/20' : 'bg-transparent'}`}
            >
              <div className="absolute left-1/2 top-1/2 h-16 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>
            <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-700">
              <div>
                <h3 className="text-lg font-semibold">{docDetails.document.title}</h3>
                <p className="text-xs text-slate-500">
                  {docDetails.document.team_name} • {docDetails.document.schedule}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onTogglePinned}
                  className="rounded-[3px] border border-slate-300 p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                >
                  {panelPinned ? <Pin size={15} /> : <PinOff size={15} />}
                </button>
                <button
                  onClick={onClose}
                  className="rounded-[3px] border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="mb-3 flex gap-5 border-b border-slate-200 text-sm dark:border-slate-700">
              {(['DETAILS', 'ACTIVITY'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => onTabChange(tab)}
                  className={`border-b-2 px-1 py-2 ${activeDetailTab === tab ? 'border-[var(--theme-button)] text-[var(--theme-button)]' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'}`}
                >
                  {tab === 'DETAILS' ? 'Details' : 'Activity'}
                </button>
              ))}
            </div>

            {activeDetailTab === 'DETAILS' ? (
              <div className="space-y-3 text-sm">
                <div className="rounded-[3px] border border-slate-200 p-3 dark:border-slate-700">
                  <p className="text-xs uppercase text-slate-500">Description</p>
                  <p>{docDetails.document.description}</p>
                  <p className="mt-2 text-xs text-slate-500">{docDetails.document.content}</p>
                </div>

                <PdfPreview url={docDetails.document.file_url} />

                {docDetails.document.file_url && (
                  <a
                    href={docDetails.document.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-[3px] border border-slate-300 px-3 py-2 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                  >
                    <Download size={14} className="mr-2" /> Open in External Tab
                  </a>
                )}

                <div className="rounded-[3px] border border-slate-200 p-3 dark:border-slate-700">
                  <p className="mb-2 text-xs uppercase text-slate-500">Acknowledgment History</p>
                  <div className="space-y-2">
                    {docDetails.acknowledgments.length ? (
                      docDetails.acknowledgments.map((ack) => (
                        <div key={ack.id} className="rounded-[3px] border border-slate-200 p-2 text-xs dark:border-slate-700">
                          <p className="font-semibold">{ack.full_name}</p>
                          <p>
                            {ack.school_name} • {ack.user_type_name}
                          </p>
                          <p className="font-mono text-slate-500">{new Date(ack.acknowledged_at).toLocaleString()}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-500">No acknowledgments yet.</p>
                    )}
                  </div>
                </div>

                {canAcknowledge && (
                  <button
                    onClick={onAcknowledge}
                    className="inline-flex items-center rounded-[3px] border border-blue-400 bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    <FileCheck2 size={14} className="mr-2" /> I've read and understand the document
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {docDetails.activity.length ? (
                  docDetails.activity.map((event) => (
                    <div key={event.id} className="rounded-[3px] border border-slate-200 p-3 text-sm dark:border-slate-700">
                      <p>{event.message}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {event.actor_name ?? 'System'} • {new Date(event.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">No activity recorded for this document.</p>
                )}
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}