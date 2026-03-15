import { useState, useEffect, useCallback } from 'react';
import { followServiceV2 } from '../services/followServiceV2';

/**
 * Hook for follow/unfollow functionality.
 * Uses followServiceV2 (NIP-02 based) as the single source of truth.
 */
export function useFollows() {
  const [follows, setFollows] = useState<string[]>(() => followServiceV2.getFollowingPubkeys());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Subscribe to follow changes — V2 notifies listeners on any change
    const unsubscribe = followServiceV2.subscribe(() => {
      setFollows(followServiceV2.getFollowingPubkeys());
    });

    return unsubscribe;
  }, []);

  const follow = useCallback(async (pubkey: string) => {
    setIsLoading(true);
    try {
      await followServiceV2.follow(pubkey);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const unfollow = useCallback(async (pubkey: string) => {
    setIsLoading(true);
    try {
      await followServiceV2.unfollow(pubkey);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const isFollowing = useCallback((pubkey: string) => {
    return followServiceV2.isFollowing(pubkey);
  }, []);

  return {
    follows,
    follow,
    unfollow,
    isFollowing,
    isLoading,
  };
}
