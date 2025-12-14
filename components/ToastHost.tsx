import React, { useEffect, useMemo, useState } from 'react';
import { toastService, type Toast } from '../services/toastService';
import { UIConfig } from '../config';
import { X } from 'lucide-react';

function toastBorderClass(type: Toast['type']): string {
  if (type === 'error') return 'border-terminal-alert text-terminal-alert';
  if (type === 'success') return 'border-terminal-text text-terminal-text';
  return 'border-terminal-dim text-terminal-text';
}

function toastTitle(type: Toast['type']): string {
  if (type === 'error') return 'ERROR';
  if (type === 'success') return 'OK';
  return 'INFO';
}

export const ToastHost: React.FC = () => {
  const [toasts, setToasts] = useState<Toast[]>(() => toastService.getToasts());

  useEffect(() => {
    return toastService.subscribe(() => {
      setToasts(toastService.getToasts());
    });
  }, []);

  const limited = useMemo(() => toasts.slice(-5), [toasts]);

  if (limited.length === 0) return null;

  return (
    <div className="fixed right-4 top-4 z-[60] w-full max-w-sm space-y-2">
      {limited.map((t) => (
        <div
          key={t.id}
          className={`border bg-terminal-bg shadow-hard p-3 ${toastBorderClass(t.type)}`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-terminal-dim">
                {toastTitle(t.type)}
              </div>
              <div className="text-sm break-words">{t.message}</div>
              {t.detail && <div className="text-[11px] text-terminal-dim mt-1 break-words">{t.detail}</div>}
            </div>

            <button
              onClick={() => toastService.dismiss(t.id)}
              className="shrink-0 border border-terminal-dim p-1 text-terminal-dim hover:text-terminal-text hover:border-terminal-text transition-colors"
              title="Dismiss"
              aria-label="Dismiss toast"
            >
              <X size={12} />
            </button>
          </div>

          <div className="mt-2 h-1 w-full bg-terminal-dim/20">
            <div
              className="h-1 bg-terminal-text/60"
              style={{
                width: '100%',
                animation: `toastbar ${t.durationMs}ms linear forwards`,
              }}
            />
          </div>
        </div>
      ))}

      {/* Local keyframes (tiny) */}
      <style>
        {`@keyframes toastbar { from { width: 100%; } to { width: 0%; } }`}
      </style>
    </div>
  );
};

// Convenience wrapper for call sites
export function pushToast(args: { type: Toast['type']; message: string; detail?: string; durationMs?: number; dedupeKey?: string }) {
  return toastService.push({
    ...args,
    durationMs: args.durationMs ?? UIConfig.TOAST_DURATION_MS,
  });
}
