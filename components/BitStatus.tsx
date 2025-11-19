import React from 'react';
import { UserState } from '../types';
import { Battery, BatteryWarning, Zap } from 'lucide-react';

interface BitStatusProps {
  userState: UserState;
}

export const BitStatus: React.FC<BitStatusProps> = ({ userState }) => {
  const percentage = (userState.bits / userState.maxBits) * 100;
  
  // Generate visual blocks for bits: [■■■■■□□□□□]
  const renderBlocks = () => {
    const blocks = [];
    for (let i = 0; i < userState.maxBits; i++) {
      if (i < userState.bits) {
        blocks.push(<span key={i} className="text-terminal-text">■</span>);
      } else {
        blocks.push(<span key={i} className="text-terminal-dim opacity-30">□</span>);
      }
    }
    return blocks;
  };

  return (
    <div className="border-2 border-terminal-text bg-black p-4 sticky top-4 w-full mb-6 shadow-[4px_4px_0px_0px_rgba(255,176,0,0.2)]">
      <div className="flex justify-between items-end mb-2">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Zap className={userState.bits === 0 ? "text-terminal-alert" : "text-terminal-text"} />
          USER_BITS
        </h2>
        <span className="text-2xl font-terminal">{String(userState.bits).padStart(2, '0')}/{userState.maxBits}</span>
      </div>
      
      <div className="flex justify-between items-center font-mono tracking-widest text-lg break-all">
        <div>[{renderBlocks()}]</div>
      </div>

      <p className="text-xs text-terminal-dim mt-2 uppercase leading-relaxed">
        {userState.bits === 0 
          ? "CRITICAL: INFLUENCE DEPLETED. RECHARGE PENDING..." 
          : "Influence available. MAX 1 BIT PER DATA PACKET."}
      </p>
    </div>
  );
};