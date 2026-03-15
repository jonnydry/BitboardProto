import { useEffect } from 'react';
import { ViewMode } from '../types';

export function useUrlPostRouting(args: {
  viewMode: ViewMode;
  selectedBitId: string | null;
  setViewMode: (mode: ViewMode) => void;
  setSelectedBitId: (id: string | null) => void;
}) {
  const { viewMode, selectedBitId, setViewMode, setSelectedBitId } = args;

  // Handle URL routing for direct post links
  useEffect(() => {
    const handleUrlNavigation = () => {
      const params = new URLSearchParams(window.location.search);
      const postId = params.get('post');

      if (postId) {
        setSelectedBitId(postId);
        setViewMode(ViewMode.SINGLE_BIT);
      }
    };

    // Check on initial load
    handleUrlNavigation();

    // Listen for popstate (back/forward navigation)
    window.addEventListener('popstate', handleUrlNavigation);
    return () => window.removeEventListener('popstate', handleUrlNavigation);
  }, [setSelectedBitId, setViewMode]);

  // Update URL when viewing a single post
  // Use replaceState to avoid polluting the back-button history on every post change.
  // Only pushState on initial navigation into SINGLE_BIT view.
  useEffect(() => {
    if (viewMode === ViewMode.SINGLE_BIT && selectedBitId) {
      const url = new URL(window.location.href);
      const currentPostInUrl = url.searchParams.get('post');
      url.searchParams.set('post', selectedBitId);

      if (!currentPostInUrl) {
        // First time navigating into a post — push so back button returns to feed
        window.history.pushState({ postId: selectedBitId }, '', url.toString());
      } else {
        // Subsequent post changes — replace to avoid long back-button chains
        window.history.replaceState({ postId: selectedBitId }, '', url.toString());
      }
    } else if (viewMode === ViewMode.FEED) {
      const url = new URL(window.location.href);
      if (url.searchParams.has('post')) {
        url.searchParams.delete('post');
        window.history.pushState({}, '', url.toString());
      }
    }
  }, [viewMode, selectedBitId]);
}
