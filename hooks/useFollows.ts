import { useState, useEffect, useCallback } from 'react';
import { followService } from '../services/followService';

export function useFollows() {
  const [follows, setFollows] = useState<string[]>(() => followService.getFollows());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Subscribe to follow changes
    const unsubscribe = followService.subscribe((newFollows) => {
      setFollows(newFollows);
    });

    return unsubscribe;
  }, []);

  const follow = useCallback(async (pubkey: string) => {
    setIsLoading(true);
    try {
      await followService.follow(pubkey);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const unfollow = useCallback(async (pubkey: string) => {
    setIsLoading(true);
    try {
      await followService.unfollow(pubkey);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const isFollowing = useCallback((pubkey: string) => {
    return followService.isFollowing(pubkey);
  }, []);

  return {
    follows,
    follow,
    unfollow,
    isFollowing,
    isLoading,
  };
}

