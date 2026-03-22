import React from 'react';
import { Plus } from 'lucide-react';

/**
 * Fixed compose control — lives outside the feed scroll subtree so layout/spacing of
 * end-of-feed + site footer can be tuned independently.
 */
export function FeedNewBitFab({
  visible,
  onNewBit,
}: {
  visible: boolean;
  onNewBit: () => void;
}) {
  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={onNewBit}
      className="pointer-events-auto fixed z-[45] h-12 w-12 rounded-sm bg-terminal-text text-black shadow-hard flex items-center justify-center transition-all hover:scale-110 hover:brightness-110
        bottom-[calc(9.5rem+env(safe-area-inset-bottom,0px))] md:bottom-8"
      style={{ left: 'max(0px, calc((100vw - 1174px) / 2 - 3rem))' }}
      aria-label="New bit"
      title="New bit"
    >
      <Plus size={24} strokeWidth={2.5} />
    </button>
  );
}
