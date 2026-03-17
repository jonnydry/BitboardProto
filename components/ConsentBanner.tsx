import { useState, useEffect } from 'react';
import { X, Cookie } from 'lucide-react';
import { analyticsService } from '../services/analyticsService';

interface ConsentBannerProps {
  onDismiss?: () => void;
}

export function ConsentBanner({ onDismiss }: ConsentBannerProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Only show if analytics is configured and user hasn't made a choice
    if (analyticsService.needsConsent()) {
      setIsVisible(true);
    }
  }, []);

  const handleAccept = () => {
    analyticsService.optIn();
    setIsVisible(false);
    onDismiss?.();
  };

  const handleDecline = () => {
    analyticsService.optOut();
    setIsVisible(false);
    onDismiss?.();
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-terminal-bg border-t border-terminal-green/30">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Cookie className="w-5 h-5 text-terminal-green shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-terminal-text">Privacy Preference</h3>
            <p className="text-xs text-terminal-muted mt-1">
              We use anonymous analytics to improve BitBoard. Your data stays private — we don't
              collect personal information. You can opt out at any time.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          <button
            onClick={handleDecline}
            className="px-3 py-1.5 text-xs text-terminal-muted hover:text-terminal-text transition-colors"
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            className="px-3 py-1.5 text-xs bg-terminal-green/20 text-terminal-green hover:bg-terminal-green/30 border border-terminal-green/40 rounded transition-colors"
          >
            Accept
          </button>
          <button
            onClick={() => setIsVisible(false)}
            className="sm:hidden p-1 text-terminal-muted hover:text-terminal-text"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
