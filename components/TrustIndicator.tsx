import React, { useState, useEffect } from 'react';
import { Users, ShieldCheck, ShieldAlert, Shield } from 'lucide-react';
import { wotService } from '../services/wotService';
import { FeatureFlags } from '../config';

interface TrustIndicatorProps {
  pubkey: string;
  showDistance?: boolean;
  compact?: boolean;
}

export const TrustIndicator: React.FC<TrustIndicatorProps> = ({
  pubkey,
  showDistance = true,
  compact = false,
}) => {
  const [wotInfo, setWotInfo] = useState<{ distance: number; score: number; followedBy: string[] } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!FeatureFlags.ENABLE_WOT || !pubkey) {
      setWotInfo(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    wotService.getScore(pubkey)
      .then(score => {
        if (!cancelled) {
          if (score) {
            setWotInfo({
              distance: score.distance,
              score: score.score,
              followedBy: score.followedBy,
            });
          } else {
            setWotInfo(null);
          }
          setIsLoading(false);
        }
      })
      .catch(error => {
        if (!cancelled) {
          console.error('[TrustIndicator] Failed to fetch WoT score:', error);
          setWotInfo(null);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pubkey]);

  if (!FeatureFlags.ENABLE_WOT || (!isLoading && !wotInfo)) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-1 opacity-50 animate-pulse">
        <Shield size={compact ? 10 : 12} className="text-terminal-dim" />
        {!compact && <div className="w-8 h-2 bg-terminal-dim/20 rounded" />}
      </div>
    );
  }

  const distance = wotInfo?.distance ?? Infinity;
  
  // Terminal-style color logic based on distance
  const getTrustColor = (dist: number) => {
    if (dist === 0) return 'text-terminal-text border-terminal-text'; // Self
    if (dist === 1) return 'text-terminal-text border-terminal-text'; // Direct follow
    if (dist === 2) return 'text-terminal-text opacity-80 border-terminal-dim'; // Friend of friend
    return 'text-terminal-dim border-terminal-dim opacity-60'; // Distant
  };

  const colorClass = getTrustColor(distance);

  return (
    <div className={`group relative inline-flex items-center gap-1 cursor-help`}>
      {distance <= 1 ? (
        <ShieldCheck size={compact ? 12 : 14} className="text-terminal-text" />
      ) : distance === 2 ? (
        <Shield size={compact ? 12 : 14} className="text-terminal-text opacity-80" />
      ) : (
        <ShieldAlert size={compact ? 12 : 14} className="text-terminal-dim opacity-60" />
      )}

      {showDistance && !compact && (
        <span className={`text-[9px] font-bold uppercase tracking-tighter px-1 border border-current rounded-sm ${colorClass}`}>
          DIST_{distance === 0 ? 'SELF' : distance}
        </span>
      )}

      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 bg-terminal-bg border-2 border-terminal-text shadow-glow opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 text-[10px] uppercase leading-tight">
        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-terminal-dim/30">
          <Shield size={16} className="text-terminal-text" />
          <p className="font-bold text-terminal-text">Web_of_Trust_Report</p>
        </div>
        
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-terminal-dim">Distance:</span>
            <span className="text-terminal-text font-bold">{distance === 0 ? 'SELF' : `${distance} HOP(S)`}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-terminal-dim">Trust_Score:</span>
            <span className="text-terminal-text font-bold">{(wotInfo!.score * 100).toFixed(0)}%</span>
          </div>
          
          {wotInfo!.followedBy.length > 0 && (
            <div className="mt-2 pt-2 border-t border-terminal-dim/20">
              <p className="text-terminal-dim mb-1 flex items-center gap-1">
                <Users size={10} /> Followed_By:
              </p>
              <p className="text-terminal-text lowercase italic">
                {wotInfo!.followedBy.length} of your follows
              </p>
            </div>
          )}
        </div>

        <div className="mt-2 pt-2 border-t border-terminal-dim/30 text-[8px] text-terminal-dim text-center">
          NOSTR_WOT_CALCULATION_ACTIVE
        </div>
        
        {/* Arrow */}
        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-terminal-text" />
      </div>
    </div>
  );
};
