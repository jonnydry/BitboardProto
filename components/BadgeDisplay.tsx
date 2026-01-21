import React, { useState, useEffect } from 'react';
import { Award, Star, Zap, Shield, CheckCircle, Info } from 'lucide-react';
import { badgeService } from '../services/badgeService';
import { FeatureFlags } from '../config';

interface BadgeDisplayProps {
  pubkey: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export const BadgeDisplay: React.FC<BadgeDisplayProps> = ({
  pubkey,
  size = 'md',
  showLabel = false,
}) => {
  const [badges, setBadges] = useState<Array<{ definition: any; award: any }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!FeatureFlags.ENABLE_BADGES || !pubkey) {
      setBadges([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    badgeService.getDisplayedBadges(pubkey)
      .then(results => {
        if (!cancelled) {
          // Map back to the expected format if needed, but getDisplayedBadges 
          // returns Array<{ profileBadge: ProfileBadge; definition: BadgeDefinition | null }>
          const validBadges = results
            .filter(r => r.definition !== null)
            .map(r => ({ definition: r.definition, award: r.profileBadge }));
          
          setBadges(validBadges as any);
          setIsLoading(false);
        }
      })
      .catch(error => {
        if (!cancelled) {
          console.error('[BadgeDisplay] Failed to fetch badges:', error);
          setBadges([]);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pubkey]);

  if (!FeatureFlags.ENABLE_BADGES || (!isLoading && badges.length === 0)) {
    return null;
  }

  const iconSize = size === 'sm' ? 12 : size === 'md' ? 16 : 24;

  const getBadgeIcon = (badgeId: string) => {
    // Try to match based on ID or name
    const id = badgeId.toLowerCase();
    if (id.includes('founding')) return <Shield size={iconSize} />;
    if (id.includes('contributor')) return <Star size={iconSize} />;
    if (id.includes('creator')) return <Award size={iconSize} />;
    if (id.includes('early')) return <Zap size={iconSize} />;
    if (id.includes('helper')) return <CheckCircle size={iconSize} />;
    return <Award size={iconSize} />;
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {isLoading ? (
        <div className="flex gap-1 animate-pulse">
          <div className={`rounded-full bg-terminal-dim/20`} style={{ width: iconSize, height: iconSize }} />
          <div className={`rounded-full bg-terminal-dim/20`} style={{ width: iconSize, height: iconSize }} />
        </div>
      ) : (
        badges.map((badge, idx) => (
          <div 
            key={`${badge.definition.id}-${idx}`}
            className={`group relative flex items-center gap-1 px-1.5 py-0.5 rounded border border-terminal-dim/30 bg-terminal-dim/5 text-terminal-text transition-all hover:border-terminal-text hover:bg-terminal-dim/10 cursor-help`}
            title={`${badge.definition.name}${badge.definition.description ? ': ' + badge.definition.description : ''}`}
          >
            {badge.definition.image ? (
              <img 
                src={badge.definition.image} 
                alt={badge.definition.name}
                className="object-contain"
                style={{ width: iconSize, height: iconSize }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <div className={badge.definition.image ? 'hidden' : ''}>
              {getBadgeIcon(badge.definition.id)}
            </div>
            
            {showLabel && (
              <span className={`uppercase font-bold tracking-tighter ${size === 'sm' ? 'text-[8px]' : 'text-[10px]'}`}>
                {badge.definition.name}
              </span>
            )}

            {/* Tooltip (CSS only for terminal feel) */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-terminal-bg border-2 border-terminal-text shadow-glow opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 text-[10px] uppercase leading-tight">
              <p className="font-bold text-terminal-text mb-1">{badge.definition.name}</p>
              {badge.definition.description && (
                <p className="text-terminal-dim">{badge.definition.description}</p>
              )}
              <div className="mt-1 pt-1 border-t border-terminal-dim/30 text-[8px] flex items-center gap-1">
                <Info size={8} /> NOSTR_NIP_58_VERIFIED
              </div>
              {/* Arrow */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-terminal-text" />
            </div>
          </div>
        ))
      )}
    </div>
  );
};
