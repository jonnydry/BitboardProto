import React from 'react';
import { Zap, Target, Undo2, AlertTriangle } from 'lucide-react';

interface BitsExplanationProps {
  size?: 'desktop' | 'mobile';
}

export const BitsExplanation = React.memo(function BitsExplanation({
  size = 'desktop',
}: BitsExplanationProps) {
  const isMobile = size === 'mobile';
  const iconSize = isMobile ? 13 : 14;
  const textSize = isMobile ? 'text-2xs' : 'text-xs';
  const spacing = isMobile ? 'space-y-2' : 'space-y-2.5';

  return (
    <>
      <div className={`flex gap-2.5`}>
        <Zap size={iconSize} className="text-terminal-dim shrink-0 mt-0.5" />
        <p className={`${textSize} text-terminal-dim leading-relaxed`}>
          <span className="text-terminal-text font-bold">Local daily quota:</span> this client
          spends 1 bit before publishing a Nostr kind-7 reaction. Other clients can still react
          without bits. This is not a uniqueness proof and not sybil-resistant.
        </p>
      </div>
      <div className={spacing}>
        <div className="flex gap-2.5">
          <Target size={iconSize} className="text-terminal-dim shrink-0 mt-0.5" />
          <div>
            <div
              className={`${textSize} text-terminal-text font-bold uppercase tracking-wide mb-0.5`}
            >
              Spend to vote here
            </div>
            <div className={`${textSize} text-terminal-dim leading-relaxed`}>
              Each new vote in BitBoard locks 1 bit from today&apos;s quota on this device.
            </div>
          </div>
        </div>
        <div className="flex gap-2.5">
          <Undo2 size={iconSize} className="text-terminal-dim shrink-0 mt-0.5" />
          <div>
            <div
              className={`${textSize} text-terminal-text font-bold uppercase tracking-wide mb-0.5`}
            >
              Refund by retracting
            </div>
            <div className={`${textSize} text-terminal-dim leading-relaxed`}>
              Remove your vote to refund the bit. Switching directions keeps the same bit locked.
            </div>
          </div>
        </div>
        <div className="flex gap-2.5">
          <AlertTriangle size={iconSize} className="text-terminal-dim shrink-0 mt-0.5" />
          <div>
            <div
              className={`${textSize} text-terminal-text font-bold uppercase tracking-wide mb-0.5`}
            >
              Client-side only
            </div>
            <div className={`${textSize} text-terminal-dim leading-relaxed`}>
              Votes you cast here are remembered on this device so you don&apos;t double-spend bits.
              Relays still accept reactions from anywhere.
            </div>
          </div>
        </div>
      </div>
    </>
  );
});
