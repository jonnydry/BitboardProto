import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { useEffect } from 'react';
import type { UserState, NostrIdentity } from '../types';
import { MAX_DAILY_BITS } from '../constants';
import { listService } from '../services/listService';
import { identityService } from '../services/identityService';
import { wotService } from '../services/wotService';
import { logger } from '../services/loggingService';
import { FeatureFlags } from '../config';

interface UserStoreState {
  // State
  userState: UserState;

  // Actions
  setUserState: (state: UserState | ((prev: UserState) => UserState)) => void;
  toggleMute: (pubkey: string) => Promise<void>;
  handleIdentityChange: (identity: NostrIdentity | null) => void;
  isMuted: (pubkey: string) => boolean;
}

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

export const useUserStore = create<UserStoreState>()(
  subscribeWithSelector((set, get) => ({
    userState: loadInitialUserState(),

    setUserState: (updater) => {
      const currentState = get().userState;
      const newState = typeof updater === 'function' ? updater(currentState) : updater;
      set({ userState: newState });
    },

    toggleMute: async (pubkey: string) => {
      const currentState = get().userState;
      const currentMuted = currentState.mutedPubkeys || [];
      const isCurrentlyMuted = currentMuted.includes(pubkey);
      const newMuted = isCurrentlyMuted
        ? currentMuted.filter((p) => p !== pubkey)
        : [...currentMuted, pubkey];

      // 1. Update local state immediately
      set((state) => ({
        userState: { ...state.userState, mutedPubkeys: newMuted },
      }));

      // 2. Persist to localStorage
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('bitboard_muted_users', JSON.stringify(newMuted));
        }
      } catch (e) {
        logger.warn('userStore', 'Failed to save mute list to localStorage', e);
      }

      // 3. Persist to Nostr (NIP-51) if identity is available
      const updatedState = get().userState;
      if (updatedState.identity && FeatureFlags.ENABLE_LISTS) {
        try {
          const unsigned = listService.buildMuteList({
            pubkeys: newMuted,
            pubkey: updatedState.identity.pubkey,
          });
          const signed = await identityService.signEvent(unsigned);
          // We don't need to wait for this to finish for the UI to be responsive
          import('../services/nostr/NostrService').then(({ nostrService }) => {
            nostrService.publishSignedEvent(signed).catch((err) => {
              logger.warn('userStore', 'Failed to publish mute list to Nostr', err);
            });
          });
        } catch (err) {
          logger.warn('userStore', 'Failed to sign mute list event', err);
        }
      }
    },

    handleIdentityChange: (identity: NostrIdentity | null) => {
      set((state) => ({
        userState: {
          ...state.userState,
          identity: identity || undefined,
          username: identity?.displayName || state.userState.username,
          hasIdentity: !!identity,
        },
      }));
    },

    isMuted: (pubkey: string) => {
      const state = get().userState;
      return (state.mutedPubkeys || []).includes(pubkey);
    },
  }))
);

// Hook to initialize services when identity changes
export function useUserStoreEffects() {
  const identity = useUserStore((state) => state.userState.identity);
  const setUserState = useUserStore((state) => state.setUserState);

  useEffect(() => {
    const pubkey = identity?.pubkey || null;
    listService.setUserPubkey(pubkey);
    wotService.setUserPubkey(pubkey);

    if (pubkey && FeatureFlags.ENABLE_LISTS) {
      // Sync mute list from Nostr
      listService.getMutedPubkeys().then((muted) => {
        if (muted.length > 0) {
          setUserState((prev) => ({ ...prev, mutedPubkeys: muted }));
        }
      });
    }
  }, [identity?.pubkey, setUserState]);
}

// Selective selectors prevent unnecessary re-renders
export const useUserState = () => useUserStore((state) => state.userState);
export const useIdentity = () => useUserStore((state) => state.userState.identity);
export const useIsMuted = (pubkey: string) =>
  useUserStore((state) => state.isMuted(pubkey));
