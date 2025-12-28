import React, { useEffect, useState, useCallback } from 'react';
import { Wifi, WifiOff, Upload, Download, Loader2 } from 'lucide-react';
import { nostrService } from '../services/nostrService';

/**
 * NetworkIndicator - Shows real-time network activity status
 * 
 * Provides immediate feedback on:
 * - Relay connection status
 * - Active publishing operations
 * - Active fetch operations
 */

interface NetworkState {
  connectedRelays: number;
  totalRelays: number;
  isPublishing: boolean;
  isFetching: boolean;
  lastActivity: number;
  pendingOps: number;
}

export const NetworkIndicator: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const [state, setState] = useState<NetworkState>({
    connectedRelays: 0,
    totalRelays: 0,
    isPublishing: false,
    isFetching: false,
    lastActivity: 0,
    pendingOps: 0,
  });

  // Poll relay status and network activity
  useEffect(() => {
    const updateStatus = () => {
      const relays = nostrService.getRelays();
      const connected = relays.filter(r => r.status === 'connected').length;
      const networkStatus = nostrService.getNetworkStatus?.() ?? { isPublishing: false, isFetching: false, pendingOps: 0 };

      setState(prev => ({
        ...prev,
        connectedRelays: connected,
        totalRelays: relays.length,
        isPublishing: networkStatus.isPublishing,
        isFetching: networkStatus.isFetching,
        pendingOps: networkStatus.pendingOps,
        lastActivity: networkStatus.isPublishing || networkStatus.isFetching ? Date.now() : prev.lastActivity,
      }));
    };

    updateStatus();
    const interval = setInterval(updateStatus, 500); // Fast polling for responsiveness
    return () => clearInterval(interval);
  }, []);

  const isActive = state.isPublishing || state.isFetching;
  const isConnected = state.connectedRelays > 0;
  const recentActivity = Date.now() - state.lastActivity < 2000;

  if (compact) {
    return (
      <div className="flex items-center gap-1 text-xs font-mono">
        {/* Connection dot */}
        <span
          className={`w-2 h-2 rounded-full ${
            isConnected
              ? isActive
                ? 'bg-terminal-text animate-pulse'
                : 'bg-terminal-text/60'
              : 'bg-terminal-alert'
          }`}
          title={`${state.connectedRelays}/${state.totalRelays} relays`}
        />
        
        {/* Activity spinner */}
        {isActive && (
          <Loader2 size={10} className="animate-spin text-terminal-text" />
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs font-mono text-terminal-dim">
      {/* Connection status */}
      <div className="flex items-center gap-1" title={`${state.connectedRelays}/${state.totalRelays} relays connected`}>
        {isConnected ? (
          <Wifi size={12} className={isActive ? 'text-terminal-text' : 'text-terminal-dim'} />
        ) : (
          <WifiOff size={12} className="text-terminal-alert" />
        )}
        <span className={isConnected ? 'text-terminal-text' : 'text-terminal-alert'}>
          {state.connectedRelays}/{state.totalRelays}
        </span>
      </div>

      {/* Activity indicators */}
      {state.isPublishing && (
        <div className="flex items-center gap-0.5 text-terminal-text animate-pulse" title="Publishing to relays...">
          <Upload size={10} />
          <span>TX</span>
        </div>
      )}
      
      {state.isFetching && (
        <div className="flex items-center gap-0.5 text-terminal-text animate-pulse" title="Fetching from relays...">
          <Download size={10} />
          <span>RX</span>
        </div>
      )}

      {/* Pending operations badge */}
      {state.pendingOps > 0 && (
        <span className="px-1 py-0.5 bg-terminal-dim/20 border border-terminal-dim/40 rounded text-[10px]">
          {state.pendingOps} pending
        </span>
      )}

      {/* Recent activity flash */}
      {recentActivity && !isActive && (
        <span className="text-terminal-text/50 text-[10px]">•</span>
      )}
    </div>
  );
};

/**
 * InlineNetworkStatus - Minimal inline status for headers
 */
export const InlineNetworkStatus: React.FC = () => {
  const [connected, setConnected] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const updateStatus = () => {
      const relays = nostrService.getRelays();
      setConnected(relays.filter(r => r.status === 'connected').length);
      setTotal(relays.length);
    };

    updateStatus();
    const interval = setInterval(updateStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="text-terminal-dim text-xs font-mono">
      [{connected}/{total}]
    </span>
  );
};

export default NetworkIndicator;
