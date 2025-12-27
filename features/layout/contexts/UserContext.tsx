import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import type { UserState, NostrIdentity } from '../../../types';
import { MAX_DAILY_BITS } from '../../../constants';

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

  const toggleMute = useCallback((pubkey: string) => {
    setUserState((prev) => {
      const currentMuted = prev.mutedPubkeys || [];
      const isMuted = currentMuted.includes(pubkey);
      const newMuted = isMuted
        ? currentMuted.filter((p) => p !== pubkey)
        : [...currentMuted, pubkey];

      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('bitboard_muted_users', JSON.stringify(newMuted));
        }
      } catch {
        // ignore
      }

      return { ...prev, mutedPubkeys: newMuted };
    });
  }, []);

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