import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { UserState, NostrIdentity } from '../../../types';
import { MAX_DAILY_BITS } from '../../../constants';
import { listService } from '../../../services/listService';
import { identityService } from '../../../services/identityService';
import { wotService } from '../../../services/wotService';
import { logger } from '../../../services/loggingService';
import { FeatureFlags } from '../../../config';

interface UserContextType {
  // State
  userState: UserState;

  // Computed values
  isMuted: (pubkey: string) => boolean;

  // Actions
  setUserState: React.Dispatch<React.SetStateAction<UserState>>;
  toggleMute: (pubkey: string) => void;
  handleIdentityChange: (identity: NostrIdentity | null) => void;
}

const UserContext = createContext<UserContextType | null>(null);

// Load initial user state from localStorage
function loadInitialUserState(): UserState {
  let mutedPubkeys: string[] = [];
  try {
    if (typeof localStorage !== 'undefined') {
      const rawMuted = localStorage.getItem('bitboard_muted_users');
      if (rawMuted) mutedPubkeys = JSON.parse(rawMuted);
    }
  } catch {
    // Silently ignore localStorage errors
  }

  const existingIdentity = null; // Will be loaded asynchronously

  return {
    username: 'u/guest_' + Math.floor(Math.random() * 10000).toString(16),
    bits: MAX_DAILY_BITS,
    maxBits: MAX_DAILY_BITS,
    votedPosts: {},
    votedComments: {},
    identity: existingIdentity || undefined,
    hasIdentity: !!existingIdentity,
    mutedPubkeys,
  };
}

export const UserProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [userState, setUserState] = useState<UserState>(() => loadInitialUserState());

  // Initialize services with user pubkey
  useEffect(() => {
    const pubkey = userState.identity?.pubkey || null;
    listService.setUserPubkey(pubkey);
    wotService.setUserPubkey(pubkey);
    
    if (pubkey && FeatureFlags.ENABLE_LISTS) {
      // Sync mute list from Nostr
      listService.getMutedPubkeys().then(muted => {
        if (muted.length > 0) {
          setUserState(prev => ({ ...prev, mutedPubkeys: muted }));
        }
      });
    }
  }, [userState.identity?.pubkey]);

  const toggleMute = useCallback(async (pubkey: string) => {
    const currentMuted = userState.mutedPubkeys || [];
    const isCurrentlyMuted = currentMuted.includes(pubkey);
    const newMuted = isCurrentlyMuted
      ? currentMuted.filter((p) => p !== pubkey)
      : [...currentMuted, pubkey];

    // 1. Update local state immediately
    setUserState((prev) => ({ ...prev, mutedPubkeys: newMuted }));

    // 2. Persist to localStorage
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('bitboard_muted_users', JSON.stringify(newMuted));
      }
    } catch (e) {
      logger.warn('UserContext', 'Failed to save mute list to localStorage', e);
    }

    // 3. Persist to Nostr (NIP-51) if identity is available
    if (userState.identity && FeatureFlags.ENABLE_LISTS) {
      try {
        const unsigned = listService.buildMuteList({
          pubkeys: newMuted,
          pubkey: userState.identity.pubkey,
        });
        const signed = await identityService.signEvent(unsigned);
        // We don't need to wait for this to finish for the UI to be responsive
        import('../../../services/nostr/NostrService').then(({ nostrService }) => {
          nostrService.publishSignedEvent(signed).catch(err => {
            logger.warn('UserContext', 'Failed to publish mute list to Nostr', err);
          });
        });
      } catch (err) {
        logger.warn('UserContext', 'Failed to sign mute list event', err);
      }
    }
  }, [userState.identity, userState.mutedPubkeys]);

  const isMuted = useCallback((pubkey: string) => {
    return (userState.mutedPubkeys || []).includes(pubkey);
  }, [userState.mutedPubkeys]);

  const handleIdentityChange = useCallback((identity: NostrIdentity | null) => {
    setUserState(prev => ({
      ...prev,
      identity: identity || undefined,
      username: identity?.displayName || prev.username,
      hasIdentity: !!identity,
    }));
  }, []);

  const contextValue: UserContextType = {
    userState,
    isMuted,
    setUserState,
    toggleMute,
    handleIdentityChange,
  };

  return (
    <UserContext.Provider value={contextValue}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};