import React, { useState, useEffect, useRef } from 'react';
import { X, Zap, Loader2, Copy, Check, ExternalLink, AlertTriangle } from 'lucide-react';
import { zapService } from '../services/zapService';
import { identityService } from '../services/identityService';
import { toastService } from '../services/toastService';
import { NostrConfig } from '../config';
import type { PublicNostrIdentity } from '../types';

interface ZapModalProps {
  recipientPubkey: string;
  recipientName?: string;
  eventId?: string; // Optional: zapping a specific post/comment
  onClose: () => void;
  onSuccess?: (amount: number) => void;
}

export const ZapModal: React.FC<ZapModalProps> = ({
  recipientPubkey,
  recipientName,
  eventId,
  onClose,
  onSuccess,
}) => {
  const [step, setStatus] = useState<'amount' | 'invoice' | 'success'>('amount');
  const [amount, setAmount] = useState<number>(100); // Default 100 sats
  const [comment, setComment] = useState('');
  const [lnurl, setLnurl] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [identity, setIdentity] = useState<PublicNostrIdentity | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);

  // Load identity
  useEffect(() => {
    identityService.getIdentityAsync().then(() => {
      setIdentity(identityService.getPublicIdentity());
    });
  }, []);

  // Check if recipient can receive zaps
  useEffect(() => {
    setIsLoading(true);
    zapService.canReceiveZaps(recipientPubkey).then((result) => {
      if (result.canZap && result.lnurl) {
        setLnurl(result.lnurl);
      } else {
        setError(result.error || 'Recipient cannot receive zaps');
      }
      setIsLoading(false);
    });
  }, [recipientPubkey]);

  const handleGetInvoice = async () => {
    if (!lnurl || !identity) return;

    setIsLoading(true);
    setError(null);

    try {
      // 1. Build unsigned zap request
      const unsignedReq = zapService.buildZapRequest({
        recipientPubkey,
        eventId,
        amount,
        relays: [...NostrConfig.DEFAULT_RELAYS],
        content: comment,
        senderPubkey: identity.pubkey,
      });

      // 2. Sign the request
      const signedReq = await identityService.signEvent(unsignedReq);

      // 3. Get invoice from LNURL provider
      const result = await zapService.getZapInvoice({
        lnurl,
        amount,
        zapRequest: signedReq,
      });

      if ('error' in result) {
        setError(result.error);
      } else {
        setInvoice(result.invoice);
        setStatus('invoice');

        // Attempt to open in wallet automatically
        window.location.href = `lightning:${result.invoice}`;
      }
    } catch (err) {
      console.error('[ZapModal] Failed to get invoice:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate invoice');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!invoice) return;
    navigator.clipboard.writeText(invoice);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toastService.push({
      type: 'success',
      message: 'Invoice copied to clipboard',
      durationMs: 2000,
    });
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const suggestedAmounts = zapService.getSuggestedAmounts();

  return (
    <div
      className="ui-overlay flex items-center justify-center p-4 animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="ui-surface-modal relative w-full max-w-md overflow-hidden p-6 font-mono"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative z-10 mb-6 flex items-center justify-between border-b border-terminal-dim/15 pb-3">
          <div className="flex items-center gap-2 text-terminal-text">
            <Zap size={20} fill="currentColor" />
            <h2 className="font-display text-2xl font-semibold">Transmit Zap</h2>
          </div>
          <button
            onClick={onClose}
            className="text-terminal-dim hover:text-terminal-text transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {isLoading && step === 'amount' && (
          <div className="py-12 flex flex-col items-center justify-center gap-4">
            <Loader2 size={40} className="animate-spin text-terminal-text" />
            <p className="text-sm uppercase text-terminal-dim animate-pulse">
              Establishing connection...
            </p>
          </div>
        )}

        {error && (
          <div className="mb-6 flex items-start gap-3 border border-terminal-alert/30 bg-terminal-alert/5 p-4 text-terminal-alert">
            <AlertTriangle size={20} className="shrink-0" />
            <div>
              <p className="mb-1 font-bold uppercase">Error detected</p>
              <p className="text-xs leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {!isLoading && !error && step === 'amount' && (
          <div className="relative z-10">
            <div className="mb-6">
              <p className="mb-2 text-xs uppercase tracking-[0.12em] text-terminal-dim">
                Recipient
              </p>
              <p className="text-lg font-bold text-terminal-text truncate">
                {recipientName || recipientPubkey.slice(0, 16) + '...'}
              </p>
            </div>

            <div className="mb-6">
              <label className="mb-2 block text-xs uppercase tracking-[0.12em] text-terminal-dim">
                Select Amount (Sats)
              </label>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {suggestedAmounts.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setAmount(amt)}
                    className={`border py-2 text-sm font-bold transition-all
                       ${
                         amount === amt
                           ? 'border-terminal-dim/60 bg-terminal-dim/10 text-terminal-text'
                           : 'border-terminal-dim/25 text-terminal-dim hover:border-terminal-dim/50 hover:text-terminal-text'
                       }`}
                  >
                    {amt}
                  </button>
                ))}
              </div>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(parseInt(e.target.value) || 0)}
                  className="ui-input pr-16 font-bold"
                  placeholder="Custom amount..."
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-terminal-dim font-bold">
                  SATS
                </span>
              </div>
            </div>

            <div className="mb-8">
              <label className="mb-2 block text-xs uppercase tracking-[0.12em] text-terminal-dim">
                Message (Optional)
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={280}
                className="ui-input h-20 resize-none text-sm"
                placeholder="Add a comment to your zap..."
              />
              <div className="text-2xs text-terminal-dim text-right mt-1">{comment.length}/280</div>
            </div>

            <button
              onClick={handleGetInvoice}
              disabled={!identity || amount <= 0}
              className="ui-button-primary flex w-full items-center justify-center gap-2 py-4"
            >
              <Zap size={18} fill="currentColor" />
              Generate Invoice
            </button>
            {!identity && (
              <p className="text-2xs text-terminal-alert mt-2 text-center">
                IDENTITY_REQUIRED: Please connect your Nostr identity.
              </p>
            )}
          </div>
        )}

        {step === 'invoice' && invoice && (
          <div className="relative z-10 text-center animate-fade-in">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-terminal-dim">
              Lightning Invoice Ready
            </p>

            {/* Invoice box */}
            <div className="group relative mb-6 border border-terminal-dim/25 bg-terminal-dim/10 p-4">
              <p className="text-2xs text-terminal-dim font-mono break-all line-clamp-4 mb-4 text-left">
                {invoice}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={copyToClipboard}
                  className="ui-button-secondary flex flex-1 items-center justify-center gap-2 py-2 text-xs"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Copied' : 'Copy Invoice'}
                </button>
                <a
                  href={`lightning:${invoice}`}
                  className="ui-button-primary flex flex-1 items-center justify-center gap-2 py-2 text-xs"
                >
                  <ExternalLink size={14} />
                  Open Wallet
                </a>
              </div>
            </div>

            <div className="mb-6 border border-terminal-dim/25 bg-terminal-dim/5 p-4 text-left text-xs leading-relaxed text-terminal-dim">
              <p className="mb-2 font-bold text-terminal-text">Instructions:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Copy the invoice or click 'Open Wallet'</li>
                <li>Pay using any Lightning-enabled wallet</li>
                <li>Receipt will be published automatically</li>
              </ol>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setStatus('success');
                  onSuccess?.(amount);
                }}
                className="text-xs font-bold uppercase text-terminal-text underline hover:no-underline"
              >
                I Have Paid
              </button>
              <button
                onClick={() => setStatus('amount')}
                className="text-2xs uppercase text-terminal-dim transition-colors hover:text-terminal-text"
              >
                Cancel And Change Amount
              </button>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="py-12 text-center animate-fade-in relative z-10">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-terminal-dim/30 bg-terminal-dim/10 shadow-glow">
              <Check size={40} className="text-terminal-text" />
            </div>
            <h3 className="mb-4 font-display text-3xl font-semibold text-terminal-text">
              Zap transmitted
            </h3>
            <p className="text-sm text-terminal-dim mb-8">
              Transmission of {amount} SATS to {recipientName || 'creator'} completed successfully.
            </p>
            <button
              onClick={onClose}
              className="ui-button-secondary w-full py-3 text-terminal-text hover:border-terminal-dim/60"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
