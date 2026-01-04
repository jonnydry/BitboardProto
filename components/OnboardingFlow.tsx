import React, { useState, useEffect, useRef } from 'react';
import { X as _X, ChevronRight, ChevronLeft, Check } from 'lucide-react';

interface OnboardingFlowProps {
  isOpen: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

type OnboardingStep = 'boot' | 'welcome' | 'identity' | 'boards' | 'features' | 'complete';

export function OnboardingFlow({ isOpen, onComplete, onSkip }: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('boot');
  const [bootLog, setBootLog] = useState<string[]>([]);
  const [bootComplete, setBootComplete] = useState(false);
  const bootLines = useRef<string[]>([
    "INITIALIZING BITBOARD SYSTEM v3.0...",
    "LOADING MEMORY MODULES... [OK]",
    "CONNECTING TO NOSTR PROTOCOL... [OK]",
    "ESTABLISHING RELAY UPLINKS... [OK]",
    "VERIFYING CRYPTOGRAPHIC SIGNATURES... [OK]",
    "LOADING USER INTERFACE... [OK]",
    "SYSTEM READY."
  ]);
  const [_showContent, setShowContent] = useState(false);

  // Boot sequence animation
  useEffect(() => {
    if (isOpen && currentStep === 'boot') {
      let lineIndex = 0;
      const interval = setInterval(() => {
        if (lineIndex < bootLines.current.length) {
          setBootLog(prev => [...prev, bootLines.current[lineIndex]]);
          lineIndex++;
        } else {
          clearInterval(interval);
          setBootComplete(true);
          setTimeout(() => {
            setCurrentStep('welcome');
            setShowContent(true);
          }, 800);
        }
      }, 300); // 300ms per line

      return () => clearInterval(interval);
    }
  }, [isOpen, currentStep]);

  if (!isOpen) return null;

  const steps: OnboardingStep[] = ['boot', 'welcome', 'identity', 'boards', 'features', 'complete'];
  // We only show progress for steps after 'boot'
  const visibleSteps = steps.filter(s => s !== 'boot');
  const visibleStepIndex = visibleSteps.indexOf(currentStep);
  const totalVisibleSteps = visibleSteps.length;
  
  // Calculate progress bar blocks (e.g., 20 blocks total)
  const totalBlocks = 20;
  const filledBlocks = Math.round(((visibleStepIndex + 1) / totalVisibleSteps) * totalBlocks);
  const progressBar = `[${'█'.repeat(filledBlocks)}${'-'.repeat(totalBlocks - filledBlocks)}]`;
  const percentComplete = Math.round(((visibleStepIndex + 1) / totalVisibleSteps) * 100);

  const handleNext = () => {
    const nextIndex = visibleStepIndex + 1;
    if (nextIndex < visibleSteps.length) {
      setCurrentStep(visibleSteps[nextIndex]);
    } else {
      onComplete();
    }
  };

  const handleBack = () => {
    const prevIndex = visibleStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(visibleSteps[prevIndex]);
    }
  };

  // Render boot screen
  if (currentStep === 'boot') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-terminal-bg font-mono text-terminal-text text-sm md:text-base p-4">
        <div className="w-full max-w-2xl">
          <div className="mb-4 text-terminal-text font-bold">
            BITBOARD BOOT SEQUENCE
          </div>
          <div className="space-y-1">
            {bootLog.map((line, i) => (
              <div key={i} className="flex">
                <span className="mr-2 opacity-50">{`>`}</span>
                <span>{line}</span>
              </div>
            ))}
            {!bootComplete && (
              <div className="animate-pulse">_</div>
            )}
          </div>
          
          {/* Scanline overlay */}
          <div className="scanlines fixed inset-0 pointer-events-none z-[60]"></div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      {/* Scanline overlay */}
      <div className="scanlines fixed inset-0 pointer-events-none z-[60]"></div>

      <div className="relative w-full max-w-4xl bg-terminal-bg border-2 border-terminal-text shadow-[0_0_20px_rgba(var(--color-terminal-text),0.3)] flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Terminal Window Header */}
        <div className="bg-terminal-text text-terminal-bg px-4 py-1 font-bold flex justify-between items-center select-none">
          <div className="flex items-center gap-2">
            <span>■</span>
            <span>SETUP_WIZARD.EXE</span>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={onSkip}
              className="hover:bg-terminal-bg hover:text-terminal-text px-2 font-bold transition-colors"
              aria-label="Close"
            >
              [X]
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-4 md:p-8 overflow-y-auto flex-1 font-mono text-terminal-text scrollbar-thin scrollbar-track-terminal-dim/20 scrollbar-thumb-terminal-text">
          
          {/* Progress Header */}
          <div className="mb-8 border-b-2 border-terminal-dim/30 pb-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
              <div className="text-xl font-bold font-terminal text-terminal-text tracking-widest uppercase">
                STEP {visibleStepIndex + 1}/{totalVisibleSteps}: {currentStep}
              </div>
              <div className="font-mono text-xs md:text-sm text-terminal-dim">
                SYSTEM_ID: {Math.random().toString(36).substring(7).toUpperCase()}
              </div>
            </div>
            <div className="font-mono text-xs md:text-sm tracking-widest opacity-80 whitespace-pre">
              {progressBar} {percentComplete}%
            </div>
          </div>

          <div className="min-h-[300px] flex flex-col justify-center animate-fade-in">
            {currentStep === 'welcome' && (
              <div className="space-y-8 text-center">
                <div className="inline-block border-2 border-terminal-text p-4 mb-4 shadow-[4px_4px_0_rgba(var(--color-terminal-text),0.4)]">
                  <pre className="text-[0.5rem] md:text-xs leading-[0.5rem] md:leading-3 font-bold select-none text-left overflow-hidden">
{`
  ██████╗ ██╗████████╗██████╗  ██████╗  █████╗ ██████╗ ██████╗ 
  ██╔══██╗██║╚══██╔══╝██╔══██╗██╔═══██╗██╔══██╗██╔══██╗██╔══██╗
  ██████╔╝██║   ██║   ██████╔╝██║   ██║███████║██████╔╝██║  ██║
  ██╔══██╗██║   ██║   ██╔══██╗██║   ██║██╔══██║██╔══██╗██║  ██║
  ██████╔╝██║   ██║   ██████╔╝╚██████╔╝██║  ██║██║  ██║██████╔╝
  ╚═════╝ ╚═╝   ╚═╝   ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ 
`}
                  </pre>
                </div>
                
                <h1 className="text-2xl md:text-4xl font-terminal font-bold text-terminal-text tracking-wider animate-pulse">
                  SYSTEM INITIALIZED
                </h1>
                
                <p className="text-lg md:text-xl max-w-2xl mx-auto leading-relaxed border-l-4 border-terminal-dim pl-4 text-left">
                  Welcome to the decentralized web. No servers. No masters. Just pure data.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left mt-8">
                  <div className="border border-terminal-dim p-3 hover:bg-terminal-dim/10 transition-colors">
                    <div className="font-bold text-terminal-text mb-1">[PROTOCOL]</div>
                    <div className="text-sm">NOSTR</div>
                  </div>
                  <div className="border border-terminal-dim p-3 hover:bg-terminal-dim/10 transition-colors">
                    <div className="font-bold text-terminal-text mb-1">[NETWORK]</div>
                    <div className="text-sm">DECENTRALIZED</div>
                  </div>
                  <div className="border border-terminal-dim p-3 hover:bg-terminal-dim/10 transition-colors">
                    <div className="font-bold text-terminal-text mb-1">[SECURITY]</div>
                    <div className="text-sm">CRYPTOGRAPHIC</div>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 'identity' && (
              <div className="space-y-6">
                <div className="border-l-4 border-terminal-text pl-4 mb-8">
                  <h2 className="text-3xl font-terminal font-bold mb-2">IDENTITY CONFIGURATION</h2>
                  <p className="text-terminal-text opacity-70">SELECT AUTHENTICATION METHOD_</p>
                </div>

                <div className="grid gap-6">
                  <div className="group border-2 border-terminal-dim p-6 hover:border-terminal-text hover:shadow-[4px_4px_0_rgba(var(--color-terminal-text),0.4)] transition-all cursor-pointer relative overflow-hidden">
                    <div className="absolute top-0 right-0 bg-terminal-dim text-terminal-bg px-2 py-1 text-xs font-bold group-hover:bg-terminal-text">OPTION_A</div>
                    <h3 className="text-xl font-bold text-terminal-text mb-2 group-hover:underline decoration-2 underline-offset-4">
                      {`>>`} GENERATE NEW KEYS
                    </h3>
                    <p className="text-sm opacity-80">
                      Create a fresh identity. We'll generate a cryptographically secure keypair for you.
                    </p>
                  </div>

                  <div className="group border-2 border-terminal-dim p-6 hover:border-terminal-text hover:shadow-[4px_4px_0_rgba(var(--color-terminal-text),0.4)] transition-all cursor-pointer relative overflow-hidden">
                    <div className="absolute top-0 right-0 bg-terminal-dim text-terminal-bg px-2 py-1 text-xs font-bold group-hover:bg-terminal-text">OPTION_B</div>
                    <h3 className="text-xl font-bold text-terminal-text mb-2 group-hover:underline decoration-2 underline-offset-4">
                      {`>>`} IMPORT EXISTING KEYS
                    </h3>
                    <p className="text-sm opacity-80">
                      Already on Nostr? Connect using your extension (Alby, nos2x) or paste your nsec.
                    </p>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-terminal-alert/10 border border-terminal-alert text-terminal-alert text-sm">
                  <span className="font-bold">WARNING:</span> Your private key is the only way to access your account. BitBoard cannot recover lost keys.
                </div>
              </div>
            )}

            {currentStep === 'boards' && (
              <div className="space-y-6">
                <div className="border-l-4 border-terminal-text pl-4 mb-8">
                  <h2 className="text-3xl font-terminal font-bold mb-2">BOARD DIRECTORY</h2>
                  <p className="text-terminal-text opacity-70">AVAILABLE CHANNELS_</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { title: "TOPIC BOARDS", desc: "Subject-based discussions like /tech, /random" },
                    { title: "LOCATION BOARDS", desc: "Geohash-based local community feeds" },
                    { title: "ENCRYPTED BOARDS", desc: "Private, key-gated secure channels" },
                    { title: "CUSTOM BOARDS", desc: "User-created boards on any topic" }
                  ].map((item, i) => (
                    <div key={i} className="border border-terminal-dim p-4 hover:bg-terminal-dim/10 transition-colors">
                      <div className="text-terminal-text font-bold mb-1">{`[0${i+1}]`} {item.title}</div>
                      <div className="text-sm opacity-80">{item.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 'features' && (
              <div className="space-y-6">
                <div className="border-l-4 border-terminal-text pl-4 mb-8">
                  <h2 className="text-3xl font-terminal font-bold mb-2">SYSTEM CAPABILITIES</h2>
                  <p className="text-terminal-text opacity-70">FEATURE OVERVIEW_</p>
                </div>

                <ul className="space-y-4 font-mono">
                  <li className="flex items-start gap-3">
                    <span className="text-terminal-text mt-1">NOSTR_SIG:</span>
                    <div>
                      <div className="font-bold">Cryptographic Voting</div>
                      <div className="text-sm opacity-70">One person, one vote. Mathematically verified.</div>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-terminal-text mt-1">OFFLINE_DB:</span>
                    <div>
                      <div className="font-bold">Offline Resilience</div>
                      <div className="text-sm opacity-70">Read and queue posts without connection. Auto-sync on reconnect.</div>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-terminal-text mt-1">INPUT_MOD:</span>
                    <div>
                      <div className="font-bold">Power User Controls</div>
                      <div className="text-sm opacity-70">Press <span className="bg-terminal-text text-terminal-bg px-1 font-bold">?</span> for keyboard shortcuts. Markdown supported.</div>
                    </div>
                  </li>
                </ul>
              </div>
            )}

            {currentStep === 'complete' && (
              <div className="text-center space-y-8 py-8">
                <div className="inline-flex items-center justify-center w-24 h-24 border-4 border-terminal-text animate-pulse">
                  <Check size={64} className="text-terminal-text" />
                </div>
                
                <div>
                  <h2 className="text-3xl font-terminal font-bold text-terminal-text mb-2">CONFIGURATION COMPLETE</h2>
                  <p className="text-xl font-mono">SYSTEM READY FOR INPUT</p>
                </div>

                <div className="max-w-md mx-auto border border-terminal-dim p-4 bg-terminal-dim/10 text-sm font-mono text-left">
                  <div>{`> user_status: ACTIVE`}</div>
                  <div>{`> connection: ESTABLISHED`}</div>
                  <div>{`> permissions: READ/WRITE`}</div>
                  <div className="animate-pulse">{`> awaiting_command_`}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="border-t-2 border-terminal-text p-4 md:p-6 bg-terminal-bg flex justify-between items-center gap-4">
          <button
            onClick={handleBack}
            disabled={visibleStepIndex === 0}
            className={`
              flex items-center gap-2 px-4 md:px-6 py-2 md:py-3 font-mono font-bold text-sm md:text-base border-2 border-transparent transition-all
              ${visibleStepIndex === 0 
                ? 'opacity-0 pointer-events-none' 
                : 'hover:border-terminal-dim text-terminal-dim hover:text-terminal-text'}
            `}
          >
            <ChevronLeft size={20} />
            BACK
          </button>

          <button
            onClick={handleNext}
            className="
              flex items-center gap-2 px-6 md:px-8 py-2 md:py-3 
              bg-terminal-text text-terminal-bg 
              font-bold font-mono text-sm md:text-base tracking-wider
              border-2 border-terminal-text
              hover:bg-terminal-bg hover:text-terminal-text
              shadow-[4px_4px_0_rgba(var(--color-terminal-text),0.5)]
              hover:shadow-[2px_2px_0_rgba(var(--color-terminal-text),0.5)]
              hover:translate-x-[2px] hover:translate-y-[2px]
              transition-all
            "
          >
            {currentStep === 'complete' ? 'LAUNCH_SYSTEM' : 'NEXT_STEP'}
            {currentStep !== 'complete' && <ChevronRight size={20} />}
          </button>
        </div>

      </div>
    </div>
  );
}
