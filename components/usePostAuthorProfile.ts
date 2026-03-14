import { useEffect, useRef, useState } from 'react';
import { profileService } from '../services/profileService';

type ProfileLoadState = 'idle' | 'loading' | 'loaded' | 'failed';

export function usePostAuthorProfile(authorPubkey?: string) {
  const postRef = useRef<HTMLDivElement>(null);
  const [authorProfile, setAuthorProfile] = useState<any>(null);
  const [profileLoadState, setProfileLoadState] = useState<ProfileLoadState>('idle');
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!postRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isVisible) {
            setIsVisible(true);
          }
        });
      },
      {
        rootMargin: '200px',
        threshold: 0.01,
      },
    );

    observer.observe(postRef.current);

    return () => {
      observer.disconnect();
    };
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible || !authorPubkey || authorProfile) {
      return;
    }

    let cancelled = false;
    let isLoading = true;

    setProfileLoadState('loading');

    const timeoutId = setTimeout(() => {
      if (!cancelled && isLoading) {
        setProfileLoadState('failed');
      }
    }, 5000);

    profileService
      .getProfileMetadata(authorPubkey)
      .then((profile) => {
        isLoading = false;
        if (!cancelled) {
          if (profile) {
            setAuthorProfile(profile);
            setProfileLoadState('loaded');
          } else {
            setProfileLoadState('failed');
          }
        }
      })
      .catch((error) => {
        isLoading = false;
        if (!cancelled) {
          console.error('[PostItem] Failed to load author profile:', error);
          setProfileLoadState('failed');
        }
      });

    return () => {
      cancelled = true;
      isLoading = false;
      clearTimeout(timeoutId);
    };
  }, [authorProfile, authorPubkey, isVisible]);

  return {
    postRef,
    authorProfile,
    profileLoadState,
  };
}
