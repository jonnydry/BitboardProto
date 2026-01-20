import React, { useState, useEffect, useCallback } from 'react';
import { Zap, Loader2 } from 'lucide-react';
import { zapService } from '../services/zapService';
import { FeatureFlags } from '../config';
import { ZapModal } from './ZapModal';
import { createPortal } from 'react-dom';

interface ZapButtonProps {
  authorPubkey: string;
  authorName?: string;
  eventId?: string; // If zapping a post/comment
  initialZapTotal?: number;
  initialZapCount?: number;
  compact?: boolean;
}

export const ZapButton: React.FC<ZapButtonProps> = ({
  authorPubkey,
  authorName,
  eventId,
  initialZapTotal = 0,
  initialZapCount = 0,
  compact = false,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [canZap, setCanZap] = useState<boolean>(false);
  const [zapTally, setZapTally] = useState({ total: initialZapTotal, count: initialZapCount });
  const [isLoading, setIsLoading] = useState(true);

  // Check if author can receive zaps
  useEffect(() => {
    if (!FeatureFlags.ENABLE_ZAPS || !authorPubkey) {
      setCanZap(false);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    zapService.canReceiveZaps(authorPubkey)
      .then(result => {
        if (!cancelled) {
          setCanZap(result.canZap);
          setIsLoading(false);
        }
      })
      .catch(error => {
        if (!cancelled) {
          console.error('[ZapButton] Failed to check zap capability:', error);
          setCanZap(false);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authorPubkey]);

  // Fetch zap tally if eventId is provided
  useEffect(() => {
    if (!FeatureFlags.ENABLE_ZAPS || !eventId) {
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    zapService.getZapTally(eventId)
      .then(tally => {
        if (!cancelled) {
          setZapTally({ total: tally.totalSats, count: tally.zapCount });
        }
      })
      .catch(error => {
        if (!cancelled) {
          console.error('[ZapButton] Failed to fetch zap tally:', error);
        }
      });

    // Subscribe to real-time zaps
    unsubscribe = zapService.subscribeToZaps([eventId], (receipt) => {
      if (!cancelled) {
        setZapTally(prev => ({
          total: prev.total + receipt.amount,
          count: prev.count + 1
        }));
      }
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [eventId]);

  const handleOpenModal = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (canZap) {
      setShowModal(true);
    }
  }, [canZap]);

  const handleZapSuccess = useCallback((amount: number) => {
    // Optimistically update if we don't have an eventId (profile zap)
    if (!eventId) {
      setZapTally(prev => ({
        total: prev.total + amount,
        count: prev.count + 1
      }));
    }
  }, [eventId]);

  if (!FeatureFlags.ENABLE_ZAPS || (!isLoading && !canZap)) {
    return null;
  }

  if (isLoading) {
    return (
      <div className={`flex items-center gap-1 text-terminal-dim animate-pulse ${compact ? 'px-1' : 'px-2'}`}>
        <Loader2 size={compact ? 14 : 16} className="animate-spin" />
      </div>
    );
  }

  return (
    <>
      <button
        onClick={handleOpenModal}
        className={`flex items-center gap-1.5 transition-all group rounded
          ${compact 
            ? 'p-1 hover:bg-terminal-text/10 text-terminal-dim hover:text-terminal-text' 
            : 'px-3 py-1.5 border border-terminal-dim hover:border-terminal-text bg-terminal-bg text-terminal-dim hover:text-terminal-text shadow-sm hover:shadow-glow'
          }
        `}
        title={`Zap ${authorName || 'this creator'}`}
      >
        <Zap 
          size={compact ? 16 : 18} 
          className={`transition-transform group-hover:scale-110 group-active:scale-95 ${zapTally.count > 0 ? 'text-terminal-text' : ''}`}
          fill={zapTally.count > 0 ? 'currentColor' : 'none'}
        />
        
        {zapTally.total > 0 && (
          <span className={`font-mono font-bold ${compact ? 'text-[10px]' : 'text-xs'}`}>
            {zapService.formatSats(zapTally.total)}
          </span>
        )}
        
        {!compact && zapTally.count === 0 && (
          <span className="text-[10px] font-bold uppercase tracking-tighter opacity-70">
            Zap
          </span>
        )}
      </button>

      {showModal && createPortal(
        <ZapModal
          recipientPubkey={authorPubkey}
          recipientName={authorName}
          eventId={eventId}
          onClose={() => setShowModal(false)}
          onSuccess={handleZapSuccess}
        />,
        document.body
      )}
    </>
  );
};
