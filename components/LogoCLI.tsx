import React from 'react';

export function LogoCLI() {
  return (
    <div className="relative inline-block py-6 px-10 group text-center">
      {/* Background glitch layers */}
      <div className="absolute inset-0 bg-terminal-text opacity-5 group-hover:opacity-10 transition-opacity"></div>
      
      {/* Decorative corners */}
      <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-terminal-text"></div>
      <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-terminal-text"></div>
      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-terminal-text"></div>
      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-terminal-text"></div>

      {/* Eagle Logo Integration */}
      <div className="relative mb-6 mx-auto w-24 h-24 md:w-32 md:h-32">
        {/* Main Eagle Layer */}
        <div 
          className="absolute inset-0 z-10"
          style={{
            backgroundColor: "rgb(var(--color-terminal-text))",
            maskImage: "url('/assets/bitboard-logo.png')",
            WebkitMaskImage: "url('/assets/bitboard-logo.png')",
            maskSize: "contain",
            WebkitMaskSize: "contain",
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
            maskPosition: "center",
            WebkitMaskPosition: "center",
            filter: "drop-shadow(0 0 8px rgba(var(--color-terminal-text), 0.5))"
          }}
        />

        {/* Eagle Glitch Layer 1 */}
        <div 
          className="absolute inset-0 opacity-40 animate-glitch-1 translate-x-[2px]"
          style={{
            backgroundColor: "#00f0ff",
            maskImage: "url('/assets/bitboard-logo.png')",
            WebkitMaskImage: "url('/assets/bitboard-logo.png')",
            maskSize: "contain",
            WebkitMaskSize: "contain",
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
            maskPosition: "center",
            WebkitMaskPosition: "center"
          }}
        />

        {/* Eagle Glitch Layer 2 */}
        <div 
          className="absolute inset-0 opacity-40 animate-glitch-2 -translate-x-[2px]"
          style={{
            backgroundColor: "#ff4646",
            maskImage: "url('/assets/bitboard-logo.png')",
            WebkitMaskImage: "url('/assets/bitboard-logo.png')",
            maskSize: "contain",
            WebkitMaskSize: "contain",
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
            maskPosition: "center",
            WebkitMaskPosition: "center"
          }}
        />
      </div>

      <div className="relative font-terminal text-6xl md:text-8xl tracking-tighter uppercase select-none leading-none">
        {/* Main Text Layer */}
        <span className="relative z-10 text-terminal-text drop-shadow-[0_0_8px_rgba(var(--color-terminal-text),0.5)]">
          BitBoard
        </span>

        {/* Glitch Layer 1 - Cyan-ish */}
        <span className="absolute top-0 left-0 -z-10 text-[#00f0ff] opacity-70 animate-glitch-1 translate-x-[2px] translate-y-[1px]">
          BitBoard
        </span>

        {/* Glitch Layer 2 - Red-ish */}
        <span className="absolute top-0 left-0 -z-20 text-[#ff4646] opacity-70 animate-glitch-2 -translate-x-[2px] -translate-y-[1px]">
          BitBoard
        </span>

        {/* Scanning line effect inside the logo */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="w-full h-[2px] bg-terminal-text/30 animate-scanline"></div>
        </div>
      </div>

      {/* Subtitle with decorative elements */}
      <div className="mt-4 flex items-center justify-center gap-4 text-xs md:text-sm font-mono tracking-[0.3em] text-terminal-dim uppercase">
        <span className="h-[1px] w-8 bg-terminal-dim/30"></span>
        <span className="flex items-center gap-2">
          <span className="w-1 h-1 bg-terminal-text animate-pulse"></span>
          DECENTRALIZED SYSTEM
          <span className="w-1 h-1 bg-terminal-text animate-pulse"></span>
        </span>
        <span className="h-[1px] w-8 bg-terminal-dim/30"></span>
      </div>
    </div>
  );
}
