import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Plus, RefreshCw, Trash2, AlertTriangle } from 'lucide-react';
import { nostrService } from '../services/nostr/NostrService';
import { diagnosticsService, type DiagnosticEvent } from '../services/diagnosticsService';

type RelayStatus = ReturnType<typeof nostrService.getRelayStatuses>[number];

function normalizeRelayUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('wss://') && !trimmed.startsWith('ws://')) return null;
  return trimmed;
}

export const RelaySettings: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [userRelays, setUserRelays] = useState<string[]>(() => nostrService.getUserRelays());
  const [statuses, setStatuses] = useState<RelayStatus[]>(() => nostrService.getRelayStatuses());
  const [diagnostics, setDiagnostics] = useState<DiagnosticEvent[]>(() =>
    diagnosticsService.getEvents(),
  );

  const [newRelay, setNewRelay] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);

  const lastStatusJsonRef = useRef<string>('');

  const effectiveRelays = nostrService.getRelays();
  const queuedCount = nostrService.getQueuedMessageCount();

  const connectedCount = useMemo(() => statuses.filter((s) => s.isConnected).length, [statuses]);

  const refreshStatuses = useCallback(() => {
    const next = nostrService.getRelayStatuses();

    // Avoid rerender churn if nothing changed
    const json = JSON.stringify(
      next.map((s) => ({
        url: s.url,
        isConnected: s.isConnected,
        lastConnectedAt: s.lastConnectedAt,
        lastDisconnectedAt: s.lastDisconnectedAt,
        reconnectAttempts: s.reconnectAttempts,
        nextReconnectTime: s.nextReconnectTime,
        lastError: s.lastError ? s.lastError.message : null,
      })),
    );

    if (json !== lastStatusJsonRef.current) {
      lastStatusJsonRef.current = json;
      setStatuses(next);
    }
  }, []);

  useEffect(() => {
    // Initial snapshot
    refreshStatuses();

    // Poll in UI (service updates status opportunistically during operations)
    const id = window.setInterval(refreshStatuses, 1500);
    return () => window.clearInterval(id);
  }, [refreshStatuses]);

  // Subscribe to diagnostics changes
  useEffect(() => {
    return diagnosticsService.subscribe(() => {
      setDiagnostics(diagnosticsService.getEvents());
    });
  }, []);

  const syncUserRelays = useCallback(
    (next: string[]) => {
      setUserRelays(next);
      nostrService.setUserRelays(next);
      // Ensure we show statuses for newly added relays
      refreshStatuses();
    },
    [refreshStatuses],
  );

  const handleAddRelay = useCallback(() => {
    setError(null);

    const normalized = normalizeRelayUrl(newRelay);
    if (!normalized) {
      setError('Relay URL must start with wss:// (or ws:// for dev).');
      return;
    }

    if (userRelays.includes(normalized)) {
      setError('That relay is already in your list.');
      return;
    }

    syncUserRelays([...userRelays, normalized]);
    setNewRelay('');
  }, [newRelay, syncUserRelays, userRelays]);

  const handleRemoveRelay = useCallback(
    (url: string) => {
      setError(null);
      syncUserRelays(userRelays.filter((r) => r !== url));
    },
    [syncUserRelays, userRelays],
  );

  const handleResetDefaults = useCallback(() => {
    setError(null);
    syncUserRelays([]);
    setIsConfirmingReset(false);
  }, [syncUserRelays]);

  const handleRetry = useCallback(
    (url: string) => {
      nostrService.retryConnection(url);
      refreshStatuses();
    },
    [refreshStatuses],
  );

  return (
    <div className="ui-surface-editor max-w-3xl overflow-hidden">
      <div className="flex items-center justify-between border-b border-terminal-dim/15 px-5 py-3">
        <div>
          <h2 className="font-display text-2xl font-semibold text-terminal-text">Relay Settings</h2>
          <p className="mt-1 text-xs text-terminal-dim">
            Connected: <span className="font-bold text-terminal-text">{connectedCount}</span> /{' '}
            {statuses.length}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-terminal-dim hover:text-terminal-text transition-colors"
        >
          ESC
        </button>
      </div>

      <div className="px-5 py-5">
        {error && (
          <div className="mb-4 flex items-center gap-2 border border-terminal-alert/40 bg-terminal-alert/10 p-3 text-sm text-terminal-alert">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        <div className="mb-6 border border-terminal-dim/30 bg-terminal-dim/10 p-4 text-sm leading-relaxed text-terminal-dim">
          Relays are independent servers that store and distribute your Nostr messages. Add a few
          trusted relays for better reach and resilience.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="border border-terminal-dim/25 p-4">
            <h3 className="ui-section-title mb-3">User Relays</h3>

            <div className="flex gap-2 mb-3">
              <label htmlFor="relay-url-input" className="sr-only">
                Relay URL
              </label>
              <input
                id="relay-url-input"
                value={newRelay}
                onChange={(e) => setNewRelay(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddRelay();
                }}
                placeholder="wss://relay.example.com"
                className="ui-input flex-1 min-w-0 py-2"
              />
              <button
                onClick={handleAddRelay}
                className="ui-button-secondary flex items-center gap-2 whitespace-nowrap px-4 py-2"
                title="Add relay"
              >
                <Plus size={14} />
                ADD
              </button>
            </div>

            {userRelays.length === 0 ? (
              <p className="text-xs text-terminal-dim">No user relays set. Using defaults only.</p>
            ) : (
              <ul className="space-y-2">
                {userRelays.map((url) => (
                  <li key={url} className="flex items-center gap-2">
                    <code className="flex-1 break-all border border-terminal-dim/20 bg-terminal-dim/10 p-2 text-xs">
                      {url}
                    </code>
                    <button
                      onClick={() => handleRemoveRelay(url)}
                      className="border border-terminal-alert/40 p-2 text-terminal-alert transition-colors hover:bg-terminal-alert hover:text-black"
                      title="Remove relay"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex items-center justify-between border-t border-terminal-dim/20 pt-3">
              <button
                onClick={() => setIsConfirmingReset(true)}
                className="ui-button-secondary px-3 py-2 text-xs"
              >
                RESET_TO_DEFAULTS
              </button>
            </div>

            {isConfirmingReset && (
              <div className="mt-3 space-y-3 border border-terminal-alert/40 bg-terminal-alert/10 p-3">
                <div className="flex items-start gap-2 text-terminal-alert">
                  <AlertTriangle size={14} className="mt-0.5" />
                  <div>
                    <p className="text-sm font-bold uppercase tracking-wide">Reset relay list?</p>
                    <p className="mt-1 text-sm text-terminal-dim">
                      This removes all custom relays and falls back to the default set.
                    </p>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setIsConfirmingReset(false)}
                    className="ui-button-secondary px-3 py-2 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleResetDefaults}
                    className="border border-terminal-alert/40 bg-terminal-alert px-3 py-2 text-xs uppercase tracking-[0.12em] text-black transition-colors hover:opacity-90"
                  >
                    Confirm Reset
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="border border-terminal-dim/25 p-4">
            <h3 className="ui-section-title mb-3">Effective Relays</h3>
            <p className="text-xs text-terminal-dim mb-3">
              These are the relays BitBoard will use for reads/writes (user relays first, then
              defaults).
            </p>
            <ul className="space-y-2">
              {effectiveRelays.map((relay) => (
                <li key={relay.url}>
                  <code className="block break-all border border-terminal-dim/20 bg-terminal-dim/10 p-2 text-xs">
                    {relay.url}
                  </code>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="mt-6 border border-terminal-dim/25 p-4">
          <div className="mb-3 flex items-center justify-between border-b border-terminal-dim/20 pb-1">
            <h3 className="ui-section-title border-b-0 pb-0">Relay Status</h3>
            <button
              onClick={refreshStatuses}
              className="ui-button-secondary flex items-center gap-2 px-3 py-1 text-xs"
            >
              <RefreshCw size={12} />
              Refresh
            </button>
          </div>

          <div className="space-y-3 md:hidden">
            {statuses.map((s) => {
              const statusText = s.isConnected
                ? 'CONNECTED'
                : s.lastError
                  ? 'ERROR'
                  : 'DISCONNECTED';
              const nextRetry = s.nextReconnectTime
                ? new Date(s.nextReconnectTime).toLocaleTimeString()
                : '-';

              return (
                <div
                  key={s.url}
                  className="space-y-2 border border-terminal-dim/20 p-3 text-sm font-mono"
                >
                  <div className="break-all text-terminal-text">{s.url}</div>
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={
                        s.isConnected
                          ? 'text-terminal-text'
                          : s.lastError
                            ? 'text-terminal-alert'
                            : 'text-terminal-dim'
                      }
                      title={s.lastError ? s.lastError.message : ''}
                    >
                      {statusText}
                    </span>
                    <button
                      onClick={() => handleRetry(s.url)}
                      className="ui-button-secondary px-2 py-1 text-xs"
                    >
                      Retry
                    </button>
                  </div>
                  <div className="text-xs text-terminal-dim space-y-1">
                    <div>Retries: {s.reconnectAttempts}</div>
                    <div>Next retry: {nextRetry}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden md:block overflow-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-terminal-dim border-b border-terminal-dim/30">
                  <th className="text-left py-2 pr-2">URL</th>
                  <th className="text-left py-2 pr-2">STATUS</th>
                  <th className="text-left py-2 pr-2">RETRIES</th>
                  <th className="text-left py-2 pr-2">NEXT_RETRY</th>
                  <th className="text-left py-2 pr-2">ACTION</th>
                </tr>
              </thead>
              <tbody>
                {statuses.map((s) => {
                  const statusText = s.isConnected
                    ? 'CONNECTED'
                    : s.lastError
                      ? 'ERROR'
                      : 'DISCONNECTED';
                  const nextRetry = s.nextReconnectTime
                    ? new Date(s.nextReconnectTime).toLocaleTimeString()
                    : '-';
                  return (
                    <tr key={s.url} className="border-b border-terminal-dim/10">
                      <td className="py-2 pr-2 break-all">{s.url}</td>
                      <td
                        className={`py-2 pr-2 ${s.isConnected ? 'text-terminal-text' : s.lastError ? 'text-terminal-alert' : 'text-terminal-dim'}`}
                        title={s.lastError ? s.lastError.message : ''}
                      >
                        {statusText}
                      </td>
                      <td className="py-2 pr-2 text-terminal-dim">{s.reconnectAttempts}</td>
                      <td className="py-2 pr-2 text-terminal-dim">{nextRetry}</td>
                      <td className="py-2 pr-2">
                        <button
                          onClick={() => handleRetry(s.url)}
                          className="ui-button-secondary px-2 py-1 text-xs"
                        >
                          Retry
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 border border-terminal-dim/25 p-4">
          <div className="mb-3 flex items-center justify-between border-b border-terminal-dim/20 pb-1">
            <div className="flex items-center gap-3">
              <h3 className="ui-section-title border-b-0 pb-0">Diagnostics</h3>
              <span className="text-2xs text-terminal-dim border border-terminal-dim/30 px-2 py-0.5">
                Queued Messages: {queuedCount}
              </span>
            </div>
            <button
              onClick={() => diagnosticsService.clear()}
              className="ui-button-secondary px-3 py-1 text-xs"
            >
              Clear
            </button>
          </div>

          {diagnostics.length === 0 ? (
            <p className="text-xs text-terminal-dim">No diagnostics recorded.</p>
          ) : (
            <>
              <div className="space-y-2 md:hidden max-h-48 overflow-auto">
                {diagnostics
                  .slice(-20)
                  .reverse()
                  .map((d) => (
                    <div key={d.id} className="border border-terminal-dim/20 p-2 text-xs font-mono">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-terminal-dim">
                          {new Date(d.at).toLocaleTimeString()}
                        </span>
                        <span
                          className={
                            d.level === 'error'
                              ? 'text-terminal-alert'
                              : d.level === 'warn'
                                ? 'text-terminal-text'
                                : 'text-terminal-dim'
                          }
                        >
                          {d.level.toUpperCase()}
                        </span>
                      </div>
                      <div className="mt-1 text-terminal-dim">{d.source}</div>
                      <div className="mt-1 text-terminal-text break-words">{d.message}</div>
                      {d.detail ? (
                        <div className="mt-1 text-terminal-dim break-words">{d.detail}</div>
                      ) : null}
                    </div>
                  ))}
              </div>

              <div className="hidden md:block max-h-48 overflow-auto border border-terminal-dim/30">
                <table className="w-full text-2xs font-mono">
                  <thead>
                    <tr className="text-terminal-dim border-b border-terminal-dim/30">
                      <th className="text-left py-2 px-2">TIME</th>
                      <th className="text-left py-2 px-2">LVL</th>
                      <th className="text-left py-2 px-2">SRC</th>
                      <th className="text-left py-2 px-2">MSG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnostics
                      .slice(-40)
                      .reverse()
                      .map((d) => (
                        <tr key={d.id} className="border-b border-terminal-dim/10 align-top">
                          <td className="py-2 px-2 text-terminal-dim whitespace-nowrap">
                            {new Date(d.at).toLocaleTimeString()}
                          </td>
                          <td
                            className={`py-2 px-2 whitespace-nowrap ${
                              d.level === 'error'
                                ? 'text-terminal-alert'
                                : d.level === 'warn'
                                  ? 'text-terminal-text'
                                  : 'text-terminal-dim'
                            }`}
                          >
                            {d.level.toUpperCase()}
                          </td>
                          <td className="py-2 px-2 text-terminal-dim whitespace-nowrap">
                            {d.source}
                          </td>
                          <td className="py-2 px-2 text-terminal-text break-words">
                            {d.message}
                            {d.detail ? (
                              <div className="text-terminal-dim mt-1 break-words">{d.detail}</div>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <div className="mt-6 border-t border-terminal-dim/20 pt-4">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-terminal-dim hover:text-terminal-text transition-colors uppercase text-sm font-bold group"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            BACK
          </button>
        </div>
      </div>
    </div>
  );
};
