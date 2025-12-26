import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { UserState, NostrIdentity } from '../../types';
import { MAX_DAILY_BITS } from '../../constants';
import { identityService } from '../../services/identityService';
import { bookmarkService } from '../../services/bookmarkService';
import { reportService } from '../../services/reportService';
import { toastService } from '../../services/toastService';
import { UIConfig } from '../../config';

interface UserContextType {
  // User state
  userState: UserState;
  setUserState: React.Dispatch<React.SetStateAction<UserState>>;
  isNostrConnected: boolean;
  bookmarkedIds: string[];
  reportedPostIds: string[];

  // User actions
  toggleMute: (pubkey: string) => void;
  isMuted: (pubkey: string) => boolean;
  handleIdentityChange: (identity: NostrIdentity | null) => void;
  handleToggleBookmark: (postId: string) => void;
  handleViewProfile: (username: string, pubkey?: string) => void;
  refreshProfileMetadata: (pubkeys: string[]) => Promise<void>;
}

const UserContext = createContext<UserContextType | null>(null);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userState, setUserState] = useState<UserState>(() => {
    const existingIdentity = identityService.getIdentity();
    let mutedPubkeys: string[] = [];
    try {
      if (typeof localStorage !== 'undefined') {
        const rawMuted = localStorage.getItem('bitboard_muted_users');
        if (rawMuted) mutedPubkeys = JSON.parse(rawMuted);
      }
    } catch {
      // Silently ignore localStorage errors
    }

    return {
      username: existingIdentity?.displayName || 'u/guest_' + Math.floor(Math.random() * 10000).toString(16),
      bits: MAX_DAILY_BITS,
      maxBits: MAX_DAILY_BITS,
      votedPosts: {},
      votedComments: {},
      identity: existingIdentity || undefined,
      hasIdentity: !!existingIdentity,
      mutedPubkeys,
    };
  });

  const [isNostrConnected, _setIsNostrConnected] = useState(false);
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>(() => bookmarkService.getBookmarkedIds());
  const [reportedPostIds, setReportedPostIds] = useState<string[]>(() =>
    reportService.getReportsByType('post').map(r => r.targetId)
  );

  // User action handlers
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
        // ignore localStorage errors
      }

      return { ...prev, mutedPubkeys: newMuted };
    });
  }, []);

  const isMuted = useCallback((pubkey: string) => {
    return (userState.mutedPubkeys || []).includes(pubkey);
  }, [userState.mutedPubkeys]);

  const handleIdentityChange = useCallback((identity: NostrIdentity | null) => {
    setUserState((prev) => ({
      ...prev,
      identity,
      hasIdentity: !!identity,
      username: identity?.displayName || prev.username,
    }));
  }, []);

  const handleToggleBookmark = useCallback((postId: string) => {
    bookmarkService.toggleBookmark(postId);
  }, []);

  const handleViewProfile = useCallback((_username: string, _pubkey?: string) => {
    // This will be handled by UIContext - we'll call it from App.tsx
  }, []);

  const refreshProfileMetadata = useCallback(async (pubkeys: string[]) => {
    // TODO: Implement profile metadata refresh
    console.log('refreshProfileMetadata called with:', pubkeys);
  }, []);

  // Subscribe to bookmark changes
  useEffect(() => {
    const unsubscribe = bookmarkService.subscribe(() => {
      setBookmarkedIds(bookmarkService.getBookmarkedIds());
    });
    return unsubscribe;
  }, []);

  // Subscribe to report changes
  useEffect(() => {
    const unsubscribe = reportService.subscribe(() => {
      setReportedPostIds(reportService.getReportsByType('post').map(r => r.targetId));
    });
    return unsubscribe;
  }, []);

  // Load identity on mount
  useEffect(() => {
    let cancelled = false;

    identityService
      .getIdentityAsync()
      .then((identity) => {
        if (cancelled) return;
        if (!identity) return;

        setUserState((prev) => {
          // If user already has an identity in state, don't override it.
          if (prev.hasIdentity || prev.identity) return prev;

          const isGuestHandle = prev.username.startsWith('u/guest_');
          return {
            ...prev,
            identity,
            hasIdentity: true,
            username: identity.displayName && isGuestHandle ? identity.displayName : prev.username,
          };
        });
      })
      .catch((err) => {
        // Non-fatal: app can run in guest mode
        console.warn('[UserContext] Failed to load identity:', err);
        toastService.push({
          type: 'error',
          message: 'Failed to load identity (guest mode)',
          detail: err instanceof Error ? err.message : String(err),
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: 'identity-load-failed',
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const contextValue: UserContextType = {
    userState,
    setUserState,
    isNostrConnected,
    bookmarkedIds,
    reportedPostIds,
    toggleMute,
    isMuted,
    handleIdentityChange,
    handleToggleBookmark,
    handleViewProfile,
    refreshProfileMetadata,
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
