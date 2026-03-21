import React, { useCallback } from 'react';
import { Share2, Link } from 'lucide-react';
import { pushToast } from './ToastHost';

interface ShareButtonProps {
  postId: string;
  postTitle: string;
}

export const ShareButton: React.FC<ShareButtonProps> = ({ postId, postTitle }) => {
  // Generate shareable URL
  const getShareUrl = useCallback(() => {
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}?post=${postId}`;
  }, [postId]);

  // Copy link to clipboard
  const handleCopyLink = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();

      const shareUrl = getShareUrl();

      try {
        await navigator.clipboard.writeText(shareUrl);
        pushToast({ type: 'success', message: 'Link copied to clipboard' });
      } catch (_error) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();

        try {
          document.execCommand('copy');
          pushToast({ type: 'success', message: 'Link copied to clipboard' });
        } catch (_err) {
          pushToast({ type: 'error', message: 'Failed to copy link' });
        }

        document.body.removeChild(textArea);
      }
    },
    [getShareUrl],
  );

  // Use native share API if available
  const handleNativeShare = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();

      const shareUrl = getShareUrl();
      const shareData = {
        title: postTitle,
        text: `Check out this post on BitBoard: ${postTitle}`,
        url: shareUrl,
      };

      // Check if native share is available
      if (navigator.share && navigator.canShare?.(shareData)) {
        try {
          await navigator.share(shareData);
        } catch (error: unknown) {
          // User cancelled or error
          const e2 = error as { name?: string };
          if (e2.name !== 'AbortError') {
            console.error('[Share] Native share failed:', error);
            // Fall back to copy
            handleCopyLink(e);
          }
        }
      } else {
        // Fall back to copy link
        handleCopyLink(e);
      }
    },
    [getShareUrl, postTitle, handleCopyLink],
  );

  // Check if native share is supported
  const hasNativeShare =
    typeof navigator !== 'undefined' &&
    'share' in navigator &&
    typeof navigator.share === 'function';

  return (
    <div className="relative">
      {/* Share button */}
      <button
        onClick={hasNativeShare ? handleNativeShare : handleCopyLink}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-terminal-dim transition-colors hover:text-terminal-text md:h-9 md:w-9"
        title={hasNativeShare ? 'Share post' : 'Copy link'}
        aria-label={hasNativeShare ? 'Share post' : 'Copy link to post'}
      >
        {hasNativeShare ? (
          <Share2 size={18} className="md:w-4 md:h-4" />
        ) : (
          <Link size={18} className="md:w-4 md:h-4" />
        )}
      </button>
    </div>
  );
};
