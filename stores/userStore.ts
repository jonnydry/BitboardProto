import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { useEffect, useRef } from 'react';
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

const BITS_KEY = 'bitboard_bits';
const BITS_REFRESH_KEY = 'bitboard_bits_last_refresh';

function todayString(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD" in UTC
}

/** Read persisted bits, resetting to MAX_DAILY_BITS if it's a new day. */
function loadPersistedBits(): number {
  try {
    const lastRefresh = localStorage.getItem(BITS_REFRESH_KEY);
    const stored = localStorage.getItem(BITS_KEY);
    const today = todayString();
    if (lastRefresh === today && stored !== null) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= MAX_DAILY_BITS) {
        return parsed;
      }
    }
    // New day or missing/corrupt data — reset
    localStorage.setItem(BITS_KEY, String(MAX_DAILY_BITS));
    localStorage.setItem(BITS_REFRESH_KEY, today);
    return MAX_DAILY_BITS;
  } catch {
    return MAX_DAILY_BITS;
  }
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

  const bits =
    typeof localStorage !== 'undefined' ? loadPersistedBits() : MAX_DAILY_BITS;

  return {
    username: guestUsername,
    bits,
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

// Persist bits to localStorage whenever they change.
useUserStore.subscribe(
  (state) => state.userState.bits,
  (bits) => {
    try {
      localStorage.setItem(BITS_KEY, String(bits));
    } catch {
      // Silently ignore storage errors
    }
  },
);

// Hook to initialize services when identity changes and schedule daily bit refresh.
export function useUserStoreEffects() {
  const identity = useUserStore((state) => state.userState.identity);
  const setUserState = useUserStore((state) => state.setUserState);
  // Ref to hold the scheduled timer so cleanup can cancel it.
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Schedule a bit refresh at midnight each day.
  useEffect(() => {
    function scheduleNextRefresh() {
      const now = new Date();
      // Next midnight in local time + 1 s buffer to avoid landing exactly on the boundary.
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      const delay = midnight.getTime() - now.getTime();

      refreshTimerRef.current = setTimeout(() => {
        const today = todayString();
        try {
          localStorage.setItem(BITS_KEY, String(MAX_DAILY_BITS));
          localStorage.setItem(BITS_REFRESH_KEY, today);
        } catch {
          // Ignore storage errors
        }
        useUserStore.getState().setUserState((prev) => ({ ...prev, bits: MAX_DAILY_BITS }));
        scheduleNextRefresh();
      }, delay);
    }

    scheduleNextRefresh();
    return () => {
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);
}

// Selective selectors prevent unnecessary re-renders
export const useUserState = () => useUserStore((state) => state.userState);
export const useIdentity = () => useUserStore((state) => state.userState.identity);
export const useIsMuted = (pubkey: string) => useUserStore((state) => state.isMuted(pubkey));
export const useFollowingPubkeys = () => useUserStore((state) => state.followingPubkeys);
