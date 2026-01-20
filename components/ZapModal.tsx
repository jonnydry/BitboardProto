import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Zap, Loader2, Copy, Check, ExternalLink, AlertTriangle } from 'lucide-react';
import { zapService } from '../services/zapService';
import { identityService } from '../services/identityService';
import { toastService } from '../services/toastService';
import { NostrConfig, UIConfig } from '../config';
import type { NostrIdentity } from '../types';

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
  const [identity, setIdentity] = useState<NostrIdentity | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);

  // Load identity
  useEffect(() => {
    identityService.getIdentityAsync().then(setIdentity);
  }, []);

  // Check if recipient can receive zaps
  useEffect(() => {
    setIsLoading(true);
    zapService.canReceiveZaps(recipientPubkey).then(result => {
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
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div 
        ref={modalRef}
        className="bg-terminal-bg border-2 border-terminal-text p-6 max-w-md w-full shadow-hard-lg font-mono relative overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* CRT Scanline effect overlay */}
        <div className="absolute inset-0 pointer-events-none opacity-5 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />

        {/* Header */}
        <div className="flex items-center justify-between mb-6 pb-3 border-b border-terminal-dim relative z-10">
          <div className="flex items-center gap-2 text-terminal-text">
            <Zap size={20} fill="currentColor" />
            <h2 className="text-xl font-bold uppercase tracking-widest">
              Transmit_Zap
            </h2>
          </div>
          <button onClick={onClose} className="text-terminal-dim hover:text-terminal-text transition-colors">
            <X size={24} />
          </button>
        </div>

        {isLoading && step === 'amount' && (
          <div className="py-12 flex flex-col items-center justify-center gap-4">
            <Loader2 size={40} className="animate-spin text-terminal-text" />
            <p className="text-sm text-terminal-dim uppercase animate-pulse">Establishing_Connection...</p>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 border border-terminal-alert bg-terminal-alert/5 text-terminal-alert flex items-start gap-3">
            <AlertTriangle size={20} className="shrink-0" />
            <div>
              <p className="font-bold uppercase mb-1">Error_Detected</p>
              <p className="text-xs leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {!isLoading && !error && step === 'amount' && (
          <div className="relative z-10">
            <div className="mb-6">
              <p className="text-xs text-terminal-dim uppercase mb-2">Recipient:</p>
              <p className="text-lg font-bold text-terminal-text truncate">
                {recipientName || recipientPubkey.slice(0, 16) + '...'}
              </p>
            </div>

            <div className="mb-6">
              <label className="text-xs text-terminal-dim uppercase mb-2 block">Select_Amount (SATS):</label>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {suggestedAmounts.map(amt => (
                  <button
                    key={amt}
                    onClick={() => setAmount(amt)}
                    className={`py-2 border-2 text-sm font-bold transition-all
                      ${amount === amt 
                        ? 'border-terminal-text bg-terminal-text text-black' 
                        : 'border-terminal-dim text-terminal-dim hover:border-terminal-text hover:text-terminal-text'}`}
                  >
                    {amt}
                  </button>
                ))}
              </div>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(parseInt(e.target.value) || 0)}
                  className="w-full bg-terminal-bg border-2 border-terminal-dim p-3 text-terminal-text focus:border-terminal-text outline-none font-bold"
                  placeholder="Custom amount..."
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-terminal-dim font-bold">SATS</span>
              </div>
            </div>

            <div className="mb-8">
              <label className="text-xs text-terminal-dim uppercase mb-2 block">Message (Optional):</label>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                maxLength={280}
                className="w-full bg-terminal-bg border-2 border-terminal-dim p-3 text-sm text-terminal-text focus:border-terminal-text outline-none resize-none h-20"
                placeholder="Add a comment to your zap..."
              />
              <div className="text-[10px] text-terminal-dim text-right mt-1">
                {comment.length}/280
              </div>
            </div>

            <button
              onClick={handleGetInvoice}
              disabled={!identity || amount <= 0}
              className="w-full py-4 bg-terminal-text text-black font-bold uppercase tracking-[0.2em] shadow-hard hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_0px_rgba(var(--color-terminal-text),0.3)] active:translate-x-0 active:translate-y-0 active:shadow-hard transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Zap size={18} fill="currentColor" />
              Generate_Invoice
            </button>
            {!identity && (
              <p className="text-[10px] text-terminal-alert mt-2 text-center">
                IDENTITY_REQUIRED: Please connect your Nostr identity.
              </p>
            )}
          </div>
        )}

        {step === 'invoice' && invoice && (
          <div className="relative z-10 text-center animate-fade-in">
            <p className="text-xs text-terminal-dim uppercase mb-4 font-bold">Lightning_Invoice_Ready</p>
            
            {/* Invoice box */}
            <div className="bg-terminal-highlight border-2 border-terminal-dim p-4 mb-6 relative group">
              <p className="text-[10px] text-terminal-text font-mono break-all line-clamp-4 mb-4 text-left opacity-70">
                {invoice}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={copyToClipboard}
                  className="flex-1 flex items-center justify-center gap-2 py-2 border-2 border-terminal-text text-terminal-text hover:bg-terminal-text hover:text-black transition-all text-xs font-bold uppercase"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Copied' : 'Copy_Invoice'}
                </button>
                <a
                  href={`lightning:${invoice}`}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-terminal-text text-black hover:bg-terminal-highlight hover:text-terminal-text border-2 border-terminal-text transition-all text-xs font-bold uppercase"
                >
                  <ExternalLink size={14} />
                  Open_Wallet
                </a>
              </div>
            </div>

            <div className="mb-6 p-4 border border-terminal-dim bg-terminal-dim/5 text-xs text-terminal-dim leading-relaxed text-left">
              <p className="mb-2 font-bold text-terminal-text">INSTRUCTIONS:</p>
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
                className="text-xs text-terminal-text underline hover:no-underline font-bold uppercase"
              >
                I_Have_Paid
              </button>
              <button
                onClick={() => setStatus('amount')}
                className="text-[10px] text-terminal-dim hover:text-terminal-text uppercase transition-colors"
              >
                Cancel_And_Change_Amount
              </button>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="py-12 text-center animate-fade-in relative z-10">
            <div className="w-20 h-20 border-4 border-terminal-text rounded-full flex items-center justify-center mx-auto mb-6 shadow-glow">
              <Check size={40} className="text-terminal-text" />
            </div>
            <h3 className="text-2xl font-bold text-terminal-text mb-4 uppercase tracking-widest">Zap_Transmitted</h3>
            <p className="text-sm text-terminal-dim mb-8">
              Transmission of {amount} SATS to {recipientName || 'creator'} completed successfully.
            </p>
            <button
              onClick={onClose}
              className="w-full py-3 border-2 border-terminal-text text-terminal-text hover:bg-terminal-text hover:text-black transition-all font-bold uppercase tracking-widest"
            >
              Close_Terminal
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
