import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Plus, RefreshCw, Trash2, AlertTriangle } from 'lucide-react';
import { nostrService } from '../services/nostrService';
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
  const [diagnostics, setDiagnostics] = useState<DiagnosticEvent[]>(() => diagnosticsService.getEvents());

  const [newRelay, setNewRelay] = useState('');
  const [error, setError] = useState<string | null>(null);

  const lastStatusJsonRef = useRef<string>('');

  const effectiveRelays = nostrService.getRelays();
  const queuedCount = nostrService.getQueuedMessageCount();

  const connectedCount = useMemo(() => statuses.filter(s => s.isConnected).length, [statuses]);

  const refreshStatuses = useCallback(() => {
    const next = nostrService.getRelayStatuses();

    // Avoid rerender churn if nothing changed
    const json = JSON.stringify(
      next.map(s => ({
        url: s.url,
        isConnected: s.isConnected,
        lastConnectedAt: s.lastConnectedAt,
        lastDisconnectedAt: s.lastDisconnectedAt,
        reconnectAttempts: s.reconnectAttempts,
        nextReconnectTime: s.nextReconnectTime,
        lastError: s.lastError ? s.lastError.message : null,
      }))
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

  const syncUserRelays = useCallback((next: string[]) => {
    setUserRelays(next);
    nostrService.setUserRelays(next);
    // Ensure we show statuses for newly added relays
    refreshStatuses();
  }, [refreshStatuses]);

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

  const handleRemoveRelay = useCallback((url: string) => {
    setError(null);
    syncUserRelays(userRelays.filter(r => r !== url));
  }, [syncUserRelays, userRelays]);

  const handleResetDefaults = useCallback(() => {
    setError(null);
    syncUserRelays([]);
  }, [syncUserRelays]);

  const handleRetry = useCallback((url: string) => {
    nostrService.retryConnection(url);
    refreshStatuses();
  }, [refreshStatuses]);

  return (
    <div className="border-2 border-terminal-text bg-terminal-bg p-6 max-w-3xl mx-auto w-full shadow-hard-lg animate-fade-in">
      <div className="flex items-center justify-between mb-6 border-b border-terminal-dim pb-2">
        <div>
          <h2 className="text-xl font-bold">RELAY_SETTINGS</h2>
          <p className="text-xs text-terminal-dim mt-1">
            CONNECTED: <span className="text-terminal-text font-bold">{connectedCount}</span> / {statuses.length}
          </p>
        </div>
        <button onClick={onClose} className="text-terminal-dim hover:text-terminal-text transition-colors">
          [ ESC ]
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 border border-terminal-alert bg-terminal-alert/10 text-terminal-alert flex items-center gap-2 text-sm">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="border border-terminal-dim p-4">
          <h3 className="font-bold border-b border-terminal-dim mb-3 pb-1 text-sm">USER_RELAYS</h3>

          <div className="flex gap-2 mb-3">
            <input
              value={newRelay}
              onChange={(e) => setNewRelay(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddRelay();
              }}
              placeholder="wss://relay.example.com"
              className="flex-1 min-w-0 bg-terminal-bg border border-terminal-dim p-2 text-terminal-text font-mono focus:outline-none focus:border-terminal-text"
            />
            <button
              onClick={handleAddRelay}
              className="px-4 border border-terminal-dim text-terminal-dim hover:text-terminal-text hover:border-terminal-text transition-colors flex items-center gap-2 whitespace-nowrap font-bold"
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
                  <code className="flex-1 text-xs bg-terminal-dim/10 border border-terminal-dim/30 p-2 break-all">{url}</code>
                  <button
                    onClick={() => handleRemoveRelay(url)}
                    className="p-2 border border-terminal-alert text-terminal-alert hover:bg-terminal-alert hover:text-black transition-colors"
                    title="Remove relay"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 pt-3 border-t border-terminal-dim/30 flex items-center justify-between">
            <button
              onClick={handleResetDefaults}
              className="text-xs border border-terminal-dim px-3 py-2 text-terminal-dim hover:text-terminal-text hover:border-terminal-text transition-colors"
            >
              RESET_TO_DEFAULTS
            </button>
          </div>
        </section>

        <section className="border border-terminal-dim p-4">
          <h3 className="font-bold border-b border-terminal-dim mb-3 pb-1 text-sm">EFFECTIVE_RELAYS</h3>
          <p className="text-xs text-terminal-dim mb-3">
            These are the relays BitBoard will use for reads/writes (user relays first, then defaults).
          </p>
          <ul className="space-y-2">
            {effectiveRelays.map((url) => (
              <li key={url}>
                <code className="block text-xs bg-terminal-dim/10 border border-terminal-dim/30 p-2 break-all">{url}</code>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-6 border border-terminal-dim p-4">
        <div className="flex items-center justify-between border-b border-terminal-dim mb-3 pb-1">
          <h3 className="font-bold text-sm">RELAY_STATUS</h3>
          <button
            onClick={refreshStatuses}
            className="text-xs border border-terminal-dim px-3 py-1 text-terminal-dim hover:text-terminal-text hover:border-terminal-text transition-colors flex items-center gap-2"
          >
            <RefreshCw size={12} />
            REFRESH
          </button>
        </div>

        <div className="overflow-auto">
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
                const statusText = s.isConnected ? 'CONNECTED' : (s.lastError ? 'ERROR' : 'DISCONNECTED');
                const nextRetry = s.nextReconnectTime ? new Date(s.nextReconnectTime).toLocaleTimeString() : '-';
                return (
                  <tr key={s.url} className="border-b border-terminal-dim/10">
                    <td className="py-2 pr-2 break-all">{s.url}</td>
                    <td className={`py-2 pr-2 ${s.isConnected ? 'text-terminal-text' : (s.lastError ? 'text-terminal-alert' : 'text-terminal-dim')}`}
                        title={s.lastError ? s.lastError.message : ''}>
                      {statusText}
                    </td>
                    <td className="py-2 pr-2 text-terminal-dim">{s.reconnectAttempts}</td>
                    <td className="py-2 pr-2 text-terminal-dim">{nextRetry}</td>
                    <td className="py-2 pr-2">
                      <button
                        onClick={() => handleRetry(s.url)}
                        className="text-xs border border-terminal-dim px-2 py-1 text-terminal-dim hover:text-terminal-text hover:border-terminal-text transition-colors"
                      >
                        RETRY
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 border border-terminal-dim p-4">
        <div className="flex items-center justify-between border-b border-terminal-dim mb-3 pb-1">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-sm">DIAGNOSTICS</h3>
            <span className="text-[10px] text-terminal-dim border border-terminal-dim/30 px-2 py-0.5">
              QUEUED_MESSAGES: {queuedCount}
            </span>
          </div>
          <button
            onClick={() => diagnosticsService.clear()}
            className="text-xs border border-terminal-dim px-3 py-1 text-terminal-dim hover:text-terminal-text hover:border-terminal-text transition-colors"
          >
            CLEAR
          </button>
        </div>

        {diagnostics.length === 0 ? (
          <p className="text-xs text-terminal-dim">No diagnostics recorded.</p>
        ) : (
          <div className="max-h-48 overflow-auto border border-terminal-dim/30">
            <table className="w-full text-[10px] font-mono">
              <thead>
                <tr className="text-terminal-dim border-b border-terminal-dim/30">
                  <th className="text-left py-2 px-2">TIME</th>
                  <th className="text-left py-2 px-2">LVL</th>
                  <th className="text-left py-2 px-2">SRC</th>
                  <th className="text-left py-2 px-2">MSG</th>
                </tr>
              </thead>
              <tbody>
                {diagnostics.slice(-40).reverse().map((d) => (
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
                    <td className="py-2 px-2 text-terminal-dim whitespace-nowrap">{d.source}</td>
                    <td className="py-2 px-2 text-terminal-text break-words">
                      {d.message}
                      {d.detail ? <div className="text-terminal-dim mt-1 break-words">{d.detail}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-6 pt-4 border-t border-terminal-dim/30">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-terminal-dim hover:text-terminal-text transition-colors uppercase text-sm font-bold group"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          BACK
        </button>
      </div>
    </div>
  );
};



















