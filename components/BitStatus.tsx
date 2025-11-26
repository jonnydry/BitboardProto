import React from 'react';
import { UserState } from '../types';
import { Zap } from 'lucide-react';

interface BitStatusProps {
  userState: UserState;
}

export const BitStatus: React.FC<BitStatusProps> = ({ userState }) => {
  // Use a fixed number of blocks (e.g., 20) to represent the bit level.
  // This prevents layout overflow when maxBits is high (e.g., 100).
  const VISUAL_BLOCK_COUNT = 20;
  
  // Calculate filled blocks based on the ratio
  const ratio = userState.maxBits > 0 ? userState.bits / userState.maxBits : 0;
  const filledCount = Math.ceil(ratio * VISUAL_BLOCK_COUNT);

  // Generate visual blocks: [■■■■■□□□□□]
  const renderBlocks = () => {
    const blocks = [];
    for (let i = 0; i < VISUAL_BLOCK_COUNT; i++) {
      if (i < filledCount) {
        blocks.push(<span key={i} className="text-terminal-text">■</span>);
      } else {
        blocks.push(<span key={i} className="text-terminal-dim opacity-30">□</span>);
      }
    }
    return blocks;
  };

  return (
    <div className="border-2 border-terminal-text bg-terminal-bg p-4 sticky top-4 w-full mb-6 shadow-hard">
      <div className="flex justify-center items-center mb-4 gap-3">
        <Zap size={24} className={userState.bits === 0 ? "text-terminal-alert" : "text-terminal-text"} />
        <h2 className="text-xl font-bold tracking-wide">USER_BITS</h2>
        <span className="text-xl font-terminal">{String(userState.bits).padStart(3, '0')}/{userState.maxBits}</span>
      </div>
      
      {/* Centered progress bar with fixed visual width */}
      <div className="font-mono tracking-widest text-lg text-center whitespace-nowrap overflow-hidden">
        [{renderBlocks()}]
      </div>

      <p className="text-xs text-terminal-dim mt-2 uppercase leading-relaxed text-center">
        {userState.bits === 0 
          ? "CRITICAL: INFLUENCE DEPLETED. RECHARGE PENDING..." 
          : "BITS GATE LOCAL VOTES. EACH NOSTR ID = 1 VOTE PER POST."}
      </p>
    </div>
  );
};