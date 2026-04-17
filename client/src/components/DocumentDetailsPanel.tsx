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
  activeUserId: number | null;
  activeUserRole: 'ADMINISTRATOR' | 'TEAM_MANAGER' | 'USER' | null;
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
  activeUserId,
  activeUserRole,
  onTogglePinned,
  onClose,
  onPanelWidthChange,
  onTabChange,
  onAcknowledge,
}: DocumentDetailsPanelProps) {
  const canViewSignatures = activeUserRole === 'ADMINISTRATOR' || activeUserRole === 'TEAM_MANAGER';
  const [isResizing, setIsResizing] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const updateViewport = () => {
      setIsMobileViewport(window.innerWidth < 768);
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  useEffect(() => {
    return () => {
      resizeCleanupRef.current?.();
    };
  }, []);

  const beginResize = (startEvent: React.PointerEvent<HTMLDivElement>) => {
    if (isMobileViewport) return;
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

  const mobileSheetAnimation = {
    initial: { y: '100%' },
    animate: { y: 0 },
    exit: { y: '100%' },
  };

  const desktopPanelAnimation = {
    initial: { x: '100%' },
    animate: { x: 0 },
    exit: { x: '100%' },
  };

  return (
    <AnimatePresence>
      {isOpen && docDetails && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => (isMobileViewport ? onClose() : panelPinned ? null : onClose())}
            className="fixed inset-0 z-30 bg-slate-900/20"
          />
          <motion.aside
            initial={isMobileViewport ? mobileSheetAnimation.initial : desktopPanelAnimation.initial}
            animate={isMobileViewport ? mobileSheetAnimation.animate : desktopPanelAnimation.animate}
            exit={isMobileViewport ? mobileSheetAnimation.exit : desktopPanelAnimation.exit}
            transition={{ duration: 0.24, ease: 'easeInOut' }}
            style={
              isMobileViewport
                ? undefined
                : { width: `${panelWidth}%` }
            }
            className={
              isMobileViewport
                ? 'fixed inset-x-0 bottom-0 z-40 h-[92vh] overflow-y-auto rounded-t-2xl border-t border-slate-300 bg-white p-3 dark:border-slate-700 dark:bg-slate-950'
                : 'fixed right-0 top-14 z-40 h-[calc(100vh-3.5rem)] overflow-y-auto border-l border-slate-300 bg-white p-3 dark:border-slate-700 dark:bg-slate-950 sm:p-4'
            }
          >
            {isMobileViewport && (
              <div className="mb-2 flex justify-center">
                <div className="h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600" />
              </div>
            )}
            {!isMobileViewport && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize document panel"
                onPointerDown={beginResize}
                className={`absolute left-0 top-0 h-full w-3 -translate-x-1/2 cursor-col-resize ${isResizing ? 'bg-blue-200/40 dark:bg-blue-400/20' : 'bg-transparent'}`}
              >
                <div className="absolute left-1/2 top-1/2 h-16 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-300 dark:bg-slate-600" />
              </div>
            )}
            <div className="mb-3 flex items-start justify-between gap-2 border-b border-slate-200 pb-2 dark:border-slate-700">
              <div>
                <h3 className="text-base font-semibold leading-snug sm:text-lg">{docDetails.document.title}</h3>
                <p className="text-xs text-slate-500">
                  {docDetails.document.team_name} • {docDetails.document.schedule}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!isMobileViewport && (
                  <button
                    onClick={onTogglePinned}
                    className="rounded-[3px] border border-slate-300 p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                  >
                    {panelPinned ? <Pin size={15} /> : <PinOff size={15} />}
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="rounded-[3px] border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="mb-3 flex gap-4 overflow-x-auto border-b border-slate-200 text-sm dark:border-slate-700">
              {(['DETAILS', 'ACTIVITY', ...(canViewSignatures ? ['SIGNATURES' as const] : [])] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => onTabChange(tab)}
                  className={`whitespace-nowrap border-b-2 px-1 py-2 ${activeDetailTab === tab ? 'border-[var(--theme-button)] text-[var(--theme-button)]' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'}`}
                >
                  {tab === 'DETAILS' ? 'Details' : tab === 'ACTIVITY' ? 'Activity' : `Signatures (${docDetails?.acknowledgments.length ?? 0})`}
                </button>
              ))}
            </div>

            {activeDetailTab === 'DETAILS' && (
              <div className="space-y-3 text-sm">
                <div className="rounded-[3px] border border-slate-200 p-3 dark:border-slate-700">
                  <p className="text-xs uppercase text-slate-500">Description</p>
                  <p className="mt-1 text-sm leading-relaxed">{docDetails.document.description}</p>
                  <p className="mt-2 text-sm text-slate-500">{docDetails.document.content}</p>
                </div>

                <PdfPreview url={docDetails.document.file_url} />

                {/* USER: show only their own signed ack */}
                {activeUserRole === 'USER' && (() => {
                  const myAck = activeUserId
                    ? docDetails.acknowledgments.find((a) => a.user_id === activeUserId)
                    : undefined;
                  if (myAck) {
                    const latestAck = myAck;
                    return (
                      <div className="rounded-[3px] border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950">
                        <p className="mb-1 text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-400">Your Acknowledgment</p>
                        <p className="text-xs text-emerald-800 dark:text-emerald-300">
                          Signed {new Date(latestAck.acknowledged_at).toLocaleString()}
                        </p>
                        {latestAck.signed_name && (
                          <p className="text-xs text-emerald-700 dark:text-emerald-400">As: {latestAck.signed_name}</p>
                        )}
                        {latestAck.signature_data && (
                          <img
                            src={latestAck.signature_data}
                            alt="Your signature"
                            className="mt-2 max-h-16 rounded-[3px] border border-emerald-200 bg-white p-1"
                          />
                        )}
                      </div>
                    );
                  }
                  return null;
                })()}

                {(docDetails.document.file_url || canAcknowledge) && (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    {docDetails.document.file_url && (
                      <a
                        href={docDetails.document.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex w-full items-center justify-center rounded-[3px] border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800 sm:w-auto sm:text-xs"
                      >
                        <Download size={14} className="mr-2" /> Open in External Tab
                      </a>
                    )}

                    {canAcknowledge && (
                      <button
                        onClick={onAcknowledge}
                        className="inline-flex w-full items-center justify-center rounded-[3px] border border-blue-400 bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto sm:px-3 sm:py-2 sm:text-xs"
                      >
                        <FileCheck2 size={14} className="mr-2" /> I've read and understand the document
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeDetailTab === 'ACTIVITY' && (
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

            {activeDetailTab === 'SIGNATURES' && canViewSignatures && (
              <div className="space-y-3">
                {docDetails.acknowledgments.length ? (
                  docDetails.acknowledgments.map((ack) => (
                    <div key={ack.id} className="rounded-[3px] border border-slate-200 p-3 text-sm dark:border-slate-700">
                      <p className="font-semibold">{ack.full_name}</p>
                      <p className="text-xs text-slate-500">{ack.school_name} • {ack.user_type_name}</p>
                      <p className="mt-1 font-mono text-xs text-slate-500">{new Date(ack.acknowledged_at).toLocaleString()}</p>
                      {ack.signed_name && (
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Signed as: <span className="font-medium">{ack.signed_name}</span></p>
                      )}
                      {ack.signature_data && (
                        <img
                          src={ack.signature_data}
                          alt={`Signature — ${ack.full_name}`}
                          className="mt-2 max-h-24 rounded-[3px] border border-slate-200 bg-white p-1 dark:border-slate-700"
                        />
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">No acknowledgments recorded for this document yet.</p>
                )}
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}