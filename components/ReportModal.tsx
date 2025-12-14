import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Flag, AlertTriangle, Check, Globe } from 'lucide-react';
import { ReportReason, REPORT_REASON_LABELS, reportService } from '../services/reportService';
import type { NostrIdentity } from '../types';

interface ReportModalProps {
  targetType: 'post' | 'comment';
  targetId: string;
  targetPubkey?: string;           // Author of the reported content
  targetPreview?: string;          // Optional preview of reported content
  identity?: NostrIdentity;        // User's identity for Nostr publishing
  onClose: () => void;
  onSubmit?: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  targetType,
  targetId,
  targetPubkey,
  targetPreview,
  identity,
  onClose,
  onSubmit,
}) => {
  const dialogTitleId = `report-modal-title-${targetType}-${targetId}`;
  const dialogDescId = `report-modal-desc-${targetType}-${targetId}`;
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [wasPublishedToNostr, setWasPublishedToNostr] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReason) return;

    setIsSubmitting(true);

    try {
      // Use the new method that supports Nostr publishing
      const result = await reportService.submitReportWithNostr(
        targetType,
        targetId,
        targetPubkey || '',
        selectedReason,
        identity,
        details || undefined
      );

      setWasPublishedToNostr(!!result.nostrEvent);
      setIsSubmitted(true);
      onSubmit?.();

      // Close modal after showing success
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      console.error('[ReportModal] Failed to submit:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [targetType, targetId, targetPubkey, selectedReason, details, identity, onClose, onSubmit]);

  // Handle backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  // Focus first interactive element on open
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  if (isSubmitted) {
    return (
      <div 
        className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
        onClick={handleBackdropClick}
        role="presentation"
      >
        <div
          className="bg-terminal-bg border-2 border-terminal-text p-6 max-w-md w-full shadow-hard-lg animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby={dialogTitleId}
          aria-describedby={dialogDescId}
        >
          <div className="text-center">
            <div className="w-12 h-12 border-2 border-terminal-text rounded-full flex items-center justify-center mx-auto mb-4">
              <Check size={24} className="text-terminal-text" />
            </div>
            <h3 id={dialogTitleId} className="text-lg font-bold text-terminal-text mb-2">REPORT_SUBMITTED</h3>
            <p id={dialogDescId} className="text-sm text-terminal-dim mb-2">
              Thank you for helping keep BitBoard safe. Your report has been recorded.
            </p>
            {wasPublishedToNostr && (
              <div className="flex items-center justify-center gap-2 text-xs text-terminal-text mt-3 p-2 bg-terminal-dim/10 border border-terminal-dim/30">
                <Globe size={12} />
                <span>Report shared with the network (NIP-56)</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        className="bg-terminal-bg border-2 border-terminal-alert p-6 max-w-md w-full shadow-hard-lg animate-fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
        aria-describedby={dialogDescId}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-terminal-dim">
          <div className="flex items-center gap-2 text-terminal-alert">
            <Flag size={20} />
            <h2 id={dialogTitleId} className="text-lg font-bold uppercase">
              Report {targetType === 'post' ? 'Post' : 'Comment'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-terminal-dim hover:text-terminal-text transition-colors p-1"
            aria-label="Close report dialog"
            ref={closeButtonRef}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Preview */}
        {targetPreview && (
          <div className="mb-4 p-3 bg-terminal-dim/10 border border-terminal-dim/30 text-sm text-terminal-dim">
            <p id={dialogDescId} className="line-clamp-2 italic">"{targetPreview}"</p>
          </div>
        )}
        {!targetPreview && (
          <p id={dialogDescId} className="sr-only">
            Report dialog.
          </p>
        )}

        <form onSubmit={handleSubmit}>
          {/* Reason Selection */}
          <div className="mb-4">
            <label className="text-xs text-terminal-dim uppercase mb-2 block">
              Why are you reporting this?
            </label>
            <div className="space-y-2">
              {Object.values(ReportReason).map((reason) => (
                <label
                  key={reason}
                  className={`flex items-center gap-3 p-3 border cursor-pointer transition-colors
                    ${selectedReason === reason
                      ? 'border-terminal-text bg-terminal-dim/20 text-terminal-text'
                      : 'border-terminal-dim/50 text-terminal-dim hover:border-terminal-dim hover:text-terminal-text'
                    }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={reason}
                    checked={selectedReason === reason}
                    onChange={() => setSelectedReason(reason)}
                    className="sr-only"
                  />
                  <div className={`w-4 h-4 border rounded-full flex items-center justify-center
                    ${selectedReason === reason ? 'border-terminal-text' : 'border-terminal-dim'}
                  `}>
                    {selectedReason === reason && (
                      <div className="w-2 h-2 bg-terminal-text rounded-full" />
                    )}
                  </div>
                  <span className="text-sm">{REPORT_REASON_LABELS[reason]}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Additional Details */}
          <div className="mb-4">
            <label className="text-xs text-terminal-dim uppercase mb-2 block">
              Additional details (optional)
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Provide any additional context..."
              className="w-full bg-terminal-bg border border-terminal-dim p-2 text-sm text-terminal-text 
                focus:border-terminal-text focus:outline-none min-h-[80px] font-mono resize-y"
              maxLength={500}
            />
            <div className="text-[10px] text-terminal-dim text-right mt-1">
              {details.length}/500
            </div>
          </div>

          {/* Warning / Info */}
          <div className="mb-4 p-3 border border-terminal-alert/30 bg-terminal-alert/5 flex items-start gap-2">
            <AlertTriangle size={14} className="text-terminal-alert mt-0.5 shrink-0" />
            <div className="text-xs text-terminal-dim">
              {identity ? (
                <p>
                  Your report will be <span className="text-terminal-text">shared with the network</span> via Nostr (NIP-56). 
                  This helps the community moderate content.
                </p>
              ) : (
                <p>
                  Reports are stored locally only. Connect your identity to share reports with the network.
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-terminal-dim text-terminal-dim hover:text-terminal-text hover:border-terminal-text transition-colors uppercase text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedReason || isSubmitting}
              className="px-4 py-2 border border-terminal-alert text-terminal-alert hover:bg-terminal-alert hover:text-black transition-colors uppercase text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Flag size={14} />
              {isSubmitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
