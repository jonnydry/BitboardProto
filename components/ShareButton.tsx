import React, { useState, useCallback } from 'react';
import { Share2, Link, Check, X } from 'lucide-react';

interface ShareButtonProps {
  postId: string;
  postTitle: string;
}

export const ShareButton: React.FC<ShareButtonProps> = ({ postId, postTitle }) => {
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  // Generate shareable URL
  const getShareUrl = useCallback(() => {
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}?post=${postId}`;
  }, [postId]);

  // Show toast notification
  const showNotification = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  }, []);

  // Copy link to clipboard
  const handleCopyLink = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    const shareUrl = getShareUrl();
    
    try {
      await navigator.clipboard.writeText(shareUrl);
      showNotification('Link copied to clipboard');
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
        showNotification('Link copied to clipboard');
      } catch (_err) {
        showNotification('Failed to copy link', 'error');
      }
      
      document.body.removeChild(textArea);
    }
  }, [getShareUrl, showNotification]);

  // Use native share API if available
  const handleNativeShare = useCallback(async (e: React.MouseEvent) => {
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
  }, [getShareUrl, postTitle, handleCopyLink]);

  // Check if native share is supported
  const hasNativeShare = typeof navigator !== 'undefined' && 
    'share' in navigator && 
    typeof navigator.share === 'function';

  return (
    <div className="relative">
      {/* Share button */}
      <button
        onClick={hasNativeShare ? handleNativeShare : handleCopyLink}
        className="p-1 text-terminal-dim hover:text-terminal-text transition-colors"
        title={hasNativeShare ? 'Share post' : 'Copy link'}
        aria-label={hasNativeShare ? 'Share post' : 'Copy link to post'}
      >
        {hasNativeShare ? (
          <Share2 size={16} />
        ) : (
          <Link size={16} />
        )}
      </button>

      {/* Toast notification */}
      {showToast && (
        <div 
          className={`absolute bottom-full right-0 mb-2 px-3 py-2 text-xs font-mono 
            border shadow-hard animate-fade-in whitespace-nowrap z-50
            ${toastType === 'success' 
              ? 'bg-terminal-bg border-terminal-text text-terminal-text' 
              : 'bg-terminal-bg border-terminal-alert text-terminal-alert'
            }`}
        >
          <div className="flex items-center gap-2">
            {toastType === 'success' ? (
              <Check size={12} />
            ) : (
              <X size={12} />
            )}
            {toastMessage}
          </div>
        </div>
      )}
    </div>
  );
};
