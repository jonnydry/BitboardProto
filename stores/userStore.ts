import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { useEffect } from 'react';
import type { UserState, NostrIdentity, PublicNostrIdentity } from '../types';
import { MAX_DAILY_BITS } from '../constants';
import { listService } from '../services/listService';
import { identityService } from '../services/identityService';
import { nostrService } from '../services/nostr/NostrService';
import { wotService } from '../services/wotService';
import { logger } from '../services/loggingService';
import { followServiceV2 } from '../services/followServiceV2';
import { FeatureFlags } from '../config';

interface UserStoreState {
  // State
  userState: UserState;
  followingPubkeys: string[];

  // Actions
  setUserState: (state: UserState | ((prev: UserState) => UserState)) => void;
  setFollowingPubkeys: (pubkeys: string[] | ((prev: string[]) => string[])) => void;
  toggleMute: (pubkey: string) => Promise<void>;
  handleIdentityChange: (identity: NostrIdentity | PublicNostrIdentity | null) => void;
  isMuted: (pubkey: string) => boolean;
}

// Load initial user state from localStorage
function loadInitialUserState(): UserState {
  let mutedPubkeys: string[] = [];
  try {
    if (typeof localStorage !== 'undefined') {
      const rawMuted = localStorage.getItem('bitboard_muted_users');
      if (rawMuted) {
        const parsed = JSON.parse(rawMuted);
        // Validate each entry is a 64-char hex pubkey to prevent tampered storage from
        // injecting invalid values into the mute list.
        if (Array.isArray(parsed)) {
          mutedPubkeys = parsed.filter(
            (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v),
          );
        }
      }
    }
  } catch {
    // Silently ignore localStorage errors
  }

  // Persist the guest username so it remains stable across reloads.
  let guestUsername: string;
  try {
    guestUsername = localStorage.getItem('bitboard_guest_username') || '';
    if (!guestUsername) {
      guestUsername = 'u/guest_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('bitboard_guest_username', guestUsername);
    }
  } catch {
    guestUsername = 'u/guest_' + Math.random().toString(36).slice(2, 10);
  }

  return {
    username: guestUsername,
    bits: MAX_DAILY_BITS,
    maxBits: MAX_DAILY_BITS,
    votedPosts: {},
    votedComments: {},
    identity: undefined,
    hasIdentity: false,
    mutedPubkeys,
  };
}

export const useUserStore = create<UserStoreState>()(
  subscribeWithSelector((set, get) => ({
    userState: loadInitialUserState(),
    followingPubkeys: followServiceV2.getFollowingPubkeys(),

    setFollowingPubkeys: (updater) => {
      const current = get().followingPubkeys;
      const next = typeof updater === 'function' ? updater(current) : updater;
      set({ followingPubkeys: next });
    },

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

      // 3. Persist to Nostr (NIP-51) if identity is available.
      // Use the locally-computed nextState rather than get() to avoid reading
      // a potentially stale snapshot written by a concurrent update.
      const nextUserState = { ...currentState, mutedPubkeys: newMuted };
      if (nextUserState.identity && FeatureFlags.ENABLE_LISTS) {
        try {
          const unsigned = listService.buildMuteList({
            pubkeys: newMuted,
            pubkey: nextUserState.identity.pubkey,
          });
          const signed = await identityService.signEvent(unsigned);
          nostrService.publishSignedEvent(signed).catch((err) => {
            logger.warn('userStore', 'Failed to publish mute list to Nostr', err);
          });
        } catch (err) {
          logger.warn('userStore', 'Failed to sign mute list event', err);
        }
      }
    },

    handleIdentityChange: (identity: NostrIdentity | PublicNostrIdentity | null) => {
      // Always strip privkey before storing in shared state — key ops go through identityService
      const publicIdentity: PublicNostrIdentity | undefined = identity
        ? (identityService.getPublicIdentity() ?? undefined)
        : undefined;
      set((state) => ({
        userState: {
          ...state.userState,
          identity: publicIdentity,
          username: identity?.displayName || state.userState.username,
          hasIdentity: !!identity,
        },
      }));
    },

    isMuted: (pubkey: string) => {
      const state = get().userState;
      return (state.mutedPubkeys || []).includes(pubkey);
    },
  })),
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
export const useIsMuted = (pubkey: string) => useUserStore((state) => state.isMuted(pubkey));
export const useFollowingPubkeys = () => useUserStore((state) => state.followingPubkeys);
