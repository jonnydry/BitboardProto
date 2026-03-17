import React from 'react';
import { Zap, Target, Undo2, Users } from 'lucide-react';

interface BitsExplanationProps {
  size?: 'desktop' | 'mobile';
}

export const BitsExplanation = React.memo(function BitsExplanation({
  size = 'desktop',
}: BitsExplanationProps) {
  const isMobile = size === 'mobile';
  const iconSize = isMobile ? 13 : 14;
  const textSize = isMobile ? 'text-[11px]' : 'text-xs';
  const spacing = isMobile ? 'space-y-2' : 'space-y-2.5';

  return (
    <>
      <div className={`flex gap-2.5`}>
        <Zap size={iconSize} className="text-terminal-dim shrink-0 mt-0.5" />
        <p className={`${textSize} text-terminal-muted leading-relaxed`}>
          <span className="text-terminal-text font-bold">Bit-weighted global feed:</span> verified
          identities spend limited bits to push the best posts upward.
        </p>
      </div>
      <div className={spacing}>
        <div className="flex gap-2.5">
          <Target size={iconSize} className="text-terminal-dim shrink-0 mt-0.5" />
          <div>
            <div
              className={`${textSize} text-terminal-text font-bold uppercase tracking-wide mb-0.5`}
            >
              Spend deliberately
            </div>
            <div className={`${textSize} text-terminal-muted leading-relaxed`}>
              Each new vote locks 1 bit, so influence goes where you think it matters most.
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
            <div className={`${textSize} text-terminal-muted leading-relaxed`}>
              Remove your vote to refund the bit. Switching directions keeps the same bit locked in
              place.
            </div>
          </div>
        </div>
        <div className="flex gap-2.5">
          <Users size={iconSize} className="text-terminal-dim shrink-0 mt-0.5" />
          <div>
            <div
              className={`${textSize} text-terminal-text font-bold uppercase tracking-wide mb-0.5`}
            >
              Verified consensus
            </div>
            <div className={`${textSize} text-terminal-muted leading-relaxed`}>
              The global feed improves when many verified identities choose the same high-signal
              posts.
            </div>
          </div>
        </div>
      </div>
    </>
  );
});
