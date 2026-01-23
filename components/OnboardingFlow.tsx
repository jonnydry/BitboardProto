import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronRight, ChevronLeft, Key, Upload, Wifi, AlertTriangle, RefreshCw, CheckCircle, Copy, Zap, Shield, Globe, Radio } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { identityService } from '../services/identityService';
import { listService, LIST_KINDS } from '../services/listService';
import { nostrService } from '../services/nostr/NostrService';
import { INITIAL_BOARDS } from '../constants';
import type { NostrIdentity, Board } from '../types';

interface OnboardingFlowProps {
  isOpen: boolean;
  onComplete: () => void;
  onSkip: () => void;
  onIdentityChange?: (identity: NostrIdentity | null) => void;
}

type OnboardingStep = 'signal' | 'welcome' | 'identity' | 'boards' | 'complete';
type IdentityMode = 'select' | 'generate' | 'import' | 'nip07' | 'success';

// Board categories for organization
const BOARD_CATEGORIES = {
  'TECH / DECENTRALIZATION': ['b-tech', 'b-dev', 'b-nostr', 'b-crypto', 'b-security', 'b-opensource', 'b-ai', 'b-selfhost'],
  'ENTERTAINMENT / MEDIA': ['b-gaming', 'b-music', 'b-movies', 'b-books', 'b-anime'],
  'CREATIVE / LEARNING': ['b-art', 'b-science', 'b-diy', 'b-learn'],
  'LIFESTYLE / GENERAL': ['b-news', 'b-finance', 'b-health', 'b-food'],
  'CORE / META': ['b-system', 'b-meta', 'b-random'],
};

// Default boards to pre-select
const DEFAULT_SELECTED_BOARDS = new Set(['b-tech', 'b-random', 'b-news', 'b-nostr']);

// Signal strength animation component
function SignalBars({ strength, className = '' }: { strength: number; className?: string }) {
  return (
    <div className={`flex items-end gap-[2px] h-4 ${className}`}>
      {[1, 2, 3, 4, 5].map((bar) => (
        <div
          key={bar}
          className={`w-[3px] transition-all duration-300 ${
            bar <= strength
              ? 'bg-terminal-text shadow-[0_0_6px_rgba(var(--color-terminal-text),0.8)]'
              : 'bg-terminal-dim/30'
          }`}
          style={{ height: `${bar * 3 + 2}px` }}
        />
      ))}
    </div>
  );
}

// Glitchy text reveal component
function GlitchReveal({ text, delay = 0, className = '' }: { text: string; delay?: number; className?: string }) {
  const [revealed, setRevealed] = useState(false);
  const [displayText, setDisplayText] = useState('');
  const chars = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`0123456789ABCDEF';
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      let iterations = 0;
      const maxIterations = text.length * 3;

      intervalRef.current = setInterval(() => {
        setDisplayText(
          text
            .split('')
            .map((char, i) => {
              if (i < iterations / 3) return char;
              return chars[Math.floor(Math.random() * chars.length)];
            })
            .join('')
        );

        iterations++;
        if (iterations > maxIterations) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setDisplayText(text);
          setRevealed(true);
        }
      }, 30);
    }, delay);

    return () => {
      clearTimeout(timer);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [text, delay]);

  return (
    <span className={`${className} ${revealed ? '' : 'text-terminal-dim'}`}>
      {displayText || text.replace(/./g, '░')}
    </span>
  );
}

// Animated border component
function PulsingBorder({ children, active = true }: { children: React.ReactNode; active?: boolean }) {
  return (
    <div className="relative">
      {active && (
        <>
          <div className="absolute -inset-[1px] bg-gradient-to-r from-transparent via-terminal-text to-transparent opacity-50 animate-border-flow" />
          <div className="absolute -inset-[1px] bg-gradient-to-b from-transparent via-terminal-text to-transparent opacity-30 animate-border-flow-v" />
        </>
      )}
      <div className="relative bg-terminal-bg">
        {children}
      </div>
    </div>
  );
}

export function OnboardingFlow({ isOpen, onComplete, onSkip, onIdentityChange }: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('signal');
  const [signalPhase, setSignalPhase] = useState(0);
  const [signalStrength, setSignalStrength] = useState(0);
  const [noiseLevel, setNoiseLevel] = useState(100);

  // Identity management state
  const [identity, setIdentity] = useState<NostrIdentity | null>(null);
  const [identityMode, setIdentityMode] = useState<IdentityMode>('select');
  const [displayName, setDisplayName] = useState('');
  const [importKey, setImportKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasNip07, setHasNip07] = useState(false);
  const [copied, setCopied] = useState(false);

  // Board selection state
  const [selectedBoards, setSelectedBoards] = useState<Set<string>>(new Set(DEFAULT_SELECTED_BOARDS));
  const [hoveredBoard, setHoveredBoard] = useState<string | null>(null);

  // Audio context for optional sound effects
  const audioContextRef = useRef<AudioContext | null>(null);

  // Check for NIP-07 extension on mount
  useEffect(() => {
    setHasNip07(identityService.hasNip07Extension());
  }, []);

  // Signal acquisition animation
  const strengthIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOpen && currentStep === 'signal') {
      // Phase 1: Static noise
      const phase1 = setTimeout(() => setSignalPhase(1), 300);

      // Phase 2: Signal detection
      const phase2 = setTimeout(() => {
        setSignalPhase(2);
        // Animate signal strength
        let strength = 0;
        strengthIntervalRef.current = setInterval(() => {
          strength += 1;
          setSignalStrength(strength);
          setNoiseLevel(Math.max(0, 100 - strength * 20));
          if (strength >= 5) {
            if (strengthIntervalRef.current) {
              clearInterval(strengthIntervalRef.current);
              strengthIntervalRef.current = null;
            }
          }
        }, 200);
      }, 1200);

      // Phase 3: Lock achieved
      const phase3 = setTimeout(() => setSignalPhase(3), 2400);

      // Phase 4: Transition to welcome
      const phase4 = setTimeout(() => {
        setCurrentStep('welcome');
      }, 3200);

      return () => {
        clearTimeout(phase1);
        clearTimeout(phase2);
        clearTimeout(phase3);
        clearTimeout(phase4);
        if (strengthIntervalRef.current) {
          clearInterval(strengthIntervalRef.current);
          strengthIntervalRef.current = null;
        }
      };
    }
  }, [isOpen, currentStep]);

  // Identity handlers
  const handleGenerateIdentity = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      const newIdentity = await identityService.generateIdentity(displayName || undefined);
      setIdentity(newIdentity);
      setIdentityMode('success');
      onIdentityChange?.(newIdentity);
    } catch (err) {
      setError('Failed to generate identity. Please try again.');
      console.error('[Onboarding] Generate failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportIdentity = async () => {
    setIsLoading(true);
    setError(null);

    if (!importKey.trim()) {
      setError('Please enter your nsec or hex private key');
      setIsLoading(false);
      return;
    }

    try {
      let newIdentity: NostrIdentity | null = null;

      if (importKey.trim().startsWith('nsec')) {
        newIdentity = await identityService.importFromNsec(importKey.trim(), displayName || undefined);
      } else {
        newIdentity = await identityService.importFromHex(importKey.trim(), displayName || undefined);
      }

      if (newIdentity) {
        setIdentity(newIdentity);
        setIdentityMode('success');
        setImportKey('');
        onIdentityChange?.(newIdentity);
      } else {
        setError('Invalid key format. Use nsec1... or hex format.');
      }
    } catch (err) {
      setError('Failed to import key. Check format and try again.');
      console.error('[Onboarding] Import failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNip07Connect = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const pubkey = await identityService.getPublicKeyFromExtension();
      if (pubkey) {
        const extensionIdentity: NostrIdentity = {
          kind: 'nip07',
          pubkey,
          npub: nip19.npubEncode(pubkey),
          displayName: displayName || `ext_${pubkey.slice(0, 6)}`,
        };
        setIdentity(extensionIdentity);
        identityService.setSessionIdentity(extensionIdentity);
        setIdentityMode('success');
        onIdentityChange?.(extensionIdentity);
      } else {
        setError('Extension did not return a public key');
      }
    } catch (err) {
      setError('Failed to connect to browser extension');
      console.error('[Onboarding] NIP-07 failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyNpub = async () => {
    if (identity?.npub) {
      try {
        await navigator.clipboard.writeText(identity.npub);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('[Onboarding] Copy failed:', err);
      }
    }
  };

  const toggleBoardSelection = (boardId: string) => {
    setSelectedBoards(prev => {
      const next = new Set(prev);
      if (next.has(boardId)) {
        next.delete(boardId);
      } else {
        next.add(boardId);
      }
      return next;
    });
  };

  const publishBoardFollows = async () => {
    if (!identity || selectedBoards.size === 0) return;

    try {
      const addresses = Array.from(selectedBoards).map(boardId =>
        `30001:bitboard:${boardId}`
      );

      const listEvent = listService.buildListEvent({
        kind: LIST_KINDS.COMMUNITIES,
        addresses,
        pubkey: identity.pubkey,
      });

      const signedEvent = await identityService.signEvent(listEvent);
      if (signedEvent) {
        await nostrService.publish(signedEvent);
        console.log('[Onboarding] Published board follows:', selectedBoards.size);
      }
    } catch (err) {
      console.error('[Onboarding] Failed to publish board follows:', err);
    }
  };

  if (!isOpen) return null;

  const steps: OnboardingStep[] = ['signal', 'welcome', 'identity', 'boards', 'complete'];
  const visibleSteps = steps.filter(s => s !== 'signal');
  const visibleStepIndex = visibleSteps.indexOf(currentStep);
  const totalVisibleSteps = visibleSteps.length;

  const handleNext = async () => {
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    } else {
      await publishBoardFollows();
      onComplete();
    }
  };

  const handleBack = () => {
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 1) { // Don't go back to signal
      setCurrentStep(steps[currentIndex - 1]);
    }
  };

  // Signal acquisition screen
  if (currentStep === 'signal') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black font-mono overflow-hidden">
        {/* Dynamic noise background */}
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-500"
          style={{
            opacity: noiseLevel / 100,
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            mixBlendMode: 'overlay'
          }}
        />

        {/* Scan lines */}
        <div className="absolute inset-0 pointer-events-none opacity-30">
          <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.3)_2px,rgba(0,0,0,0.3)_4px)]" />
        </div>

        {/* Main content */}
        <div className="relative z-10 text-center px-4">
          {/* Signal indicator */}
          <div className="mb-8">
            <div className="inline-flex items-center gap-4 px-6 py-3 border border-terminal-dim/50 bg-black/50">
              <Radio
                size={24}
                className={`text-terminal-text ${signalPhase >= 2 ? 'animate-pulse' : 'opacity-30'}`}
              />
              <div className="text-left">
                <div className="text-xs text-terminal-dim uppercase tracking-widest">
                  {signalPhase === 0 && 'INITIALIZING...'}
                  {signalPhase === 1 && 'SCANNING FREQUENCIES...'}
                  {signalPhase === 2 && 'SIGNAL DETECTED'}
                  {signalPhase === 3 && 'LOCK ACHIEVED'}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <SignalBars strength={signalStrength} />
                  <span className="text-terminal-text font-bold text-sm">
                    {signalPhase >= 2 ? `${signalStrength * 20}%` : '---'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Central logo area */}
          <div className="relative mb-8">
            {/* Rotating outer ring */}
            <div
              className={`absolute inset-0 m-auto w-48 h-48 md:w-64 md:h-64 rounded-full border-2 border-dashed transition-all duration-1000 ${
                signalPhase >= 2 ? 'border-terminal-text/50 animate-spin-slow' : 'border-terminal-dim/20'
              }`}
              style={{ animationDuration: '20s' }}
            />

            {/* Inner ring */}
            <div
              className={`absolute inset-0 m-auto w-36 h-36 md:w-48 md:h-48 rounded-full border transition-all duration-700 ${
                signalPhase >= 3 ? 'border-terminal-text shadow-[0_0_30px_rgba(var(--color-terminal-text),0.5)]' : 'border-terminal-dim/30'
              }`}
            />

            {/* Central element */}
            <div className="relative w-48 h-48 md:w-64 md:h-64 mx-auto flex items-center justify-center">
              <div
                className={`text-6xl md:text-8xl font-terminal font-bold transition-all duration-500 ${
                  signalPhase >= 3
                    ? 'text-terminal-text scale-100 opacity-100'
                    : 'text-terminal-dim/50 scale-90 opacity-50'
                }`}
                style={{
                  textShadow: signalPhase >= 3
                    ? '0 0 20px rgba(var(--color-terminal-text), 0.8), 0 0 40px rgba(var(--color-terminal-text), 0.4)'
                    : 'none'
                }}
              >
                B
              </div>
            </div>
          </div>

          {/* Status text */}
          <div className="space-y-2">
            <div
              className={`text-2xl md:text-3xl font-terminal uppercase tracking-[0.3em] transition-all duration-500 ${
                signalPhase >= 3 ? 'text-terminal-text' : 'text-terminal-dim/50'
              }`}
            >
              {signalPhase >= 3 ? (
                <GlitchReveal text="BITBOARD" delay={0} />
              ) : (
                <span className="animate-pulse">ACQUIRING SIGNAL</span>
              )}
            </div>
            <div className="text-xs text-terminal-dim uppercase tracking-[0.4em]">
              {signalPhase >= 3 ? 'DECENTRALIZED TRUTH NETWORK' : 'NOSTR PROTOCOL HANDSHAKE'}
            </div>
          </div>

          {/* Relay connection indicators */}
          {signalPhase >= 2 && (
            <div className="mt-8 flex justify-center gap-6 text-xs font-mono">
              {['DAMUS', 'NOS.LOL', 'SNORT'].map((relay, i) => (
                <div
                  key={relay}
                  className="flex items-center gap-2 animate-fade-in"
                  style={{ animationDelay: `${i * 200}ms` }}
                >
                  <div
                    className={`w-2 h-2 rounded-full transition-all duration-300 ${
                      signalStrength > i + 2
                        ? 'bg-terminal-text shadow-[0_0_6px_rgba(var(--color-terminal-text),0.8)]'
                        : 'bg-terminal-dim/30'
                    }`}
                  />
                  <span className={signalStrength > i + 2 ? 'text-terminal-text' : 'text-terminal-dim/50'}>
                    {relay}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Skip button */}
        <button
          onClick={() => setCurrentStep('welcome')}
          className="absolute bottom-8 right-8 text-terminal-dim/50 hover:text-terminal-text text-xs uppercase tracking-wider transition-colors"
        >
          Skip Intro
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/98 p-4 animate-fade-in overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      {/* Ambient background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Gradient orbs */}
        <div className="absolute top-1/4 -left-32 w-64 h-64 bg-terminal-text/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-terminal-text/3 rounded-full blur-[120px]" />

        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(var(--color-terminal-text), 0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(var(--color-terminal-text), 0.1) 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px'
          }}
        />
      </div>

      {/* Scanline overlay */}
      <div className="scanlines fixed inset-0 pointer-events-none z-[60]" />

      <div className="relative w-full max-w-4xl flex flex-col max-h-[90vh]">

        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-terminal-dim/30 bg-terminal-bg/80 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            {/* Logo mark */}
            <div className="w-8 h-8 border border-terminal-text flex items-center justify-center">
              <span className="font-terminal text-lg font-bold text-terminal-text">B</span>
            </div>

            {/* Step indicator */}
            <div className="hidden sm:flex items-center gap-2">
              {visibleSteps.map((step, i) => (
                <React.Fragment key={step}>
                  <div
                    className={`w-2 h-2 transition-all duration-300 ${
                      i <= visibleStepIndex
                        ? 'bg-terminal-text shadow-[0_0_8px_rgba(var(--color-terminal-text),0.6)]'
                        : 'bg-terminal-dim/30'
                    }`}
                  />
                  {i < visibleSteps.length - 1 && (
                    <div className={`w-8 h-[1px] transition-all duration-300 ${
                      i < visibleStepIndex ? 'bg-terminal-text' : 'bg-terminal-dim/30'
                    }`} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs text-terminal-dim uppercase tracking-wider hidden sm:block">
              {currentStep.toUpperCase()}
            </span>
            <button
              onClick={onSkip}
              className="text-terminal-dim hover:text-terminal-text transition-colors text-xs uppercase tracking-wider"
            >
              Skip Setup
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto bg-terminal-bg/60 backdrop-blur-sm border-x border-terminal-dim/30">
          <div className="p-6 md:p-10 min-h-[500px] flex flex-col justify-center">

            {/* Welcome Screen */}
            {currentStep === 'welcome' && (
              <div className="animate-fade-in text-center space-y-10">
                {/* Hero section */}
                <div className="space-y-6">
                  <div className="inline-block relative">
                    {/* Decorative elements */}
                    <div className="absolute -top-4 -left-4 w-8 h-8 border-t-2 border-l-2 border-terminal-text/50" />
                    <div className="absolute -top-4 -right-4 w-8 h-8 border-t-2 border-r-2 border-terminal-text/50" />
                    <div className="absolute -bottom-4 -left-4 w-8 h-8 border-b-2 border-l-2 border-terminal-text/50" />
                    <div className="absolute -bottom-4 -right-4 w-8 h-8 border-b-2 border-r-2 border-terminal-text/50" />

                    <h1 className="text-5xl md:text-7xl font-terminal font-bold text-terminal-text tracking-tight px-8 py-4">
                      <span className="relative">
                        BITBOARD
                        <span className="absolute -top-1 -left-1 text-[#00f0ff]/30 blur-[1px]">BITBOARD</span>
                        <span className="absolute top-1 left-1 text-[#ff4646]/30 blur-[1px]">BITBOARD</span>
                      </span>
                    </h1>
                  </div>

                  <p className="text-terminal-dim text-sm md:text-base uppercase tracking-[0.3em]">
                    The Uncensorable Forum
                  </p>
                </div>

                {/* Value proposition */}
                <div className="max-w-2xl mx-auto">
                  <p className="text-xl md:text-2xl leading-relaxed text-terminal-text/90 font-light">
                    Access the global information commons.
                    <br />
                    <span className="text-terminal-dim">No gatekeepers. No algorithms. No surveillance.</span>
                  </p>
                </div>

                {/* Feature cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
                  {[
                    { icon: Shield, label: 'CRYPTOGRAPHIC', desc: 'Every post signed with your keys' },
                    { icon: Globe, label: 'DECENTRALIZED', desc: 'No single point of failure' },
                    { icon: Zap, label: 'INSTANT', desc: 'Real-time global propagation' },
                  ].map(({ icon: Icon, label, desc }, i) => (
                    <div
                      key={label}
                      className="group relative p-5 border border-terminal-dim/30 hover:border-terminal-text/50 transition-all duration-300 animate-fade-in"
                      style={{ animationDelay: `${i * 100 + 200}ms` }}
                    >
                      {/* Hover glow */}
                      <div className="absolute inset-0 bg-terminal-text/0 group-hover:bg-terminal-text/5 transition-colors" />

                      <Icon size={24} className="text-terminal-text mb-3 group-hover:scale-110 transition-transform" />
                      <div className="text-terminal-text font-bold text-sm tracking-wider mb-1">{label}</div>
                      <div className="text-terminal-dim text-xs">{desc}</div>
                    </div>
                  ))}
                </div>

                {/* Protocol badge */}
                <div className="flex justify-center">
                  <div className="inline-flex items-center gap-3 px-4 py-2 border border-terminal-dim/30 text-xs text-terminal-dim">
                    <span className="w-2 h-2 bg-terminal-text rounded-full animate-pulse" />
                    <span className="uppercase tracking-wider">Powered by NOSTR Protocol</span>
                  </div>
                </div>
              </div>
            )}

            {/* Identity Configuration */}
            {currentStep === 'identity' && (
              <div className="animate-fade-in max-w-2xl mx-auto w-full">
                <div className="text-center mb-10">
                  <h2 className="text-3xl md:text-4xl font-terminal font-bold text-terminal-text mb-3">
                    Your Identity
                  </h2>
                  <p className="text-terminal-dim text-sm">
                    {identityMode === 'select' && 'Choose how to establish your cryptographic identity'}
                    {identityMode === 'generate' && 'Generate a fresh keypair'}
                    {identityMode === 'import' && 'Import your existing Nostr key'}
                    {identityMode === 'nip07' && 'Connect your browser extension'}
                    {identityMode === 'success' && 'Identity established successfully'}
                  </p>
                </div>

                {error && (
                  <div className="mb-6 p-4 border border-terminal-alert/50 bg-terminal-alert/10 text-terminal-alert flex items-center gap-3 text-sm animate-fade-in">
                    <AlertTriangle size={18} />
                    {error}
                  </div>
                )}

                {/* Mode: Select */}
                {identityMode === 'select' && (
                  <div className="space-y-4">
                    {/* Display name input */}
                    <div className="mb-8">
                      <label className="block text-xs text-terminal-dim uppercase tracking-wider mb-2">
                        Display Name <span className="text-terminal-dim/50">(optional)</span>
                      </label>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full bg-transparent border border-terminal-dim/50 focus:border-terminal-text p-4 text-terminal-text font-mono focus:outline-none transition-colors"
                        placeholder="anon"
                      />
                    </div>

                    <div className="space-y-3">
                      {/* Generate option */}
                      <button
                        onClick={() => setIdentityMode('generate')}
                        className="group w-full text-left p-5 border border-terminal-dim/30 hover:border-terminal-text transition-all duration-300 relative overflow-hidden"
                      >
                        <div className="absolute inset-0 bg-terminal-text/0 group-hover:bg-terminal-text/5 transition-colors" />
                        <div className="relative flex items-start gap-4">
                          <div className="w-12 h-12 border border-terminal-dim group-hover:border-terminal-text flex items-center justify-center transition-colors">
                            <Key size={20} className="text-terminal-text" />
                          </div>
                          <div className="flex-1">
                            <div className="text-terminal-text font-bold mb-1 group-hover:underline underline-offset-4">
                              Generate New Keys
                            </div>
                            <div className="text-terminal-dim text-sm">
                              Create a fresh cryptographic identity. We'll generate secure keys for you.
                            </div>
                          </div>
                          <ChevronRight size={20} className="text-terminal-dim group-hover:text-terminal-text group-hover:translate-x-1 transition-all" />
                        </div>
                      </button>

                      {/* Import option */}
                      <button
                        onClick={() => setIdentityMode('import')}
                        className="group w-full text-left p-5 border border-terminal-dim/30 hover:border-terminal-text transition-all duration-300 relative overflow-hidden"
                      >
                        <div className="absolute inset-0 bg-terminal-text/0 group-hover:bg-terminal-text/5 transition-colors" />
                        <div className="relative flex items-start gap-4">
                          <div className="w-12 h-12 border border-terminal-dim group-hover:border-terminal-text flex items-center justify-center transition-colors">
                            <Upload size={20} className="text-terminal-text" />
                          </div>
                          <div className="flex-1">
                            <div className="text-terminal-text font-bold mb-1 group-hover:underline underline-offset-4">
                              Import Existing Key
                            </div>
                            <div className="text-terminal-dim text-sm">
                              Already on Nostr? Paste your nsec private key to use your existing identity.
                            </div>
                          </div>
                          <ChevronRight size={20} className="text-terminal-dim group-hover:text-terminal-text group-hover:translate-x-1 transition-all" />
                        </div>
                      </button>

                      {/* NIP-07 option */}
                      {hasNip07 && (
                        <button
                          onClick={() => setIdentityMode('nip07')}
                          className="group w-full text-left p-5 border border-terminal-dim/30 hover:border-terminal-text transition-all duration-300 relative overflow-hidden"
                        >
                          <div className="absolute inset-0 bg-terminal-text/0 group-hover:bg-terminal-text/5 transition-colors" />
                          <div className="relative flex items-start gap-4">
                            <div className="w-12 h-12 border border-terminal-dim group-hover:border-terminal-text flex items-center justify-center transition-colors">
                              <Wifi size={20} className="text-terminal-text" />
                            </div>
                            <div className="flex-1">
                              <div className="text-terminal-text font-bold mb-1 group-hover:underline underline-offset-4">
                                Browser Extension
                              </div>
                              <div className="text-terminal-dim text-sm">
                                Connect via Alby, nos2x, or other NIP-07 extension. Your key stays secure.
                              </div>
                            </div>
                            <ChevronRight size={20} className="text-terminal-dim group-hover:text-terminal-text group-hover:translate-x-1 transition-all" />
                          </div>
                        </button>
                      )}
                    </div>

                    <div className="mt-8 p-4 border border-terminal-alert/30 bg-terminal-alert/5 text-sm">
                      <div className="flex items-start gap-3">
                        <AlertTriangle size={18} className="text-terminal-alert flex-shrink-0 mt-0.5" />
                        <div className="text-terminal-dim">
                          <span className="text-terminal-alert font-bold">Important:</span> Your private key is the only way to access your account. BitBoard cannot recover lost keys.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Mode: Generate */}
                {identityMode === 'generate' && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="p-6 border border-terminal-dim/30 bg-terminal-dim/5">
                      <div className="font-mono text-sm space-y-2 text-terminal-dim">
                        <div><span className="text-terminal-text">&gt;</span> Algorithm: Schnorr signatures (BIP-340)</div>
                        <div><span className="text-terminal-text">&gt;</span> Curve: secp256k1</div>
                        <div><span className="text-terminal-text">&gt;</span> Key size: 256 bits</div>
                        <div><span className="text-terminal-text">&gt;</span> Storage: AES-256-GCM encrypted</div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => { setIdentityMode('select'); setError(null); }}
                        className="px-6 py-3 border border-terminal-dim hover:border-terminal-text transition-colors text-sm"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleGenerateIdentity}
                        disabled={isLoading}
                        className="flex-1 bg-terminal-text text-terminal-bg font-bold px-6 py-3 hover:bg-terminal-text/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isLoading ? (
                          <>
                            <RefreshCw size={18} className="animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Key size={18} />
                            Generate Keypair
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Mode: Import */}
                {identityMode === 'import' && (
                  <div className="space-y-6 animate-fade-in">
                    <div>
                      <label className="block text-xs text-terminal-dim uppercase tracking-wider mb-2">
                        Private Key
                      </label>
                      <input
                        type="password"
                        value={importKey}
                        onChange={(e) => setImportKey(e.target.value)}
                        className="w-full bg-transparent border border-terminal-dim/50 focus:border-terminal-text p-4 text-terminal-text font-mono focus:outline-none transition-colors"
                        placeholder="nsec1... or 64-char hex"
                      />
                      <p className="text-xs text-terminal-dim mt-2">
                        Your key is encrypted locally and never transmitted.
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => { setIdentityMode('select'); setError(null); setImportKey(''); }}
                        className="px-6 py-3 border border-terminal-dim hover:border-terminal-text transition-colors text-sm"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleImportIdentity}
                        disabled={isLoading || !importKey.trim()}
                        className="flex-1 bg-terminal-text text-terminal-bg font-bold px-6 py-3 hover:bg-terminal-text/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isLoading ? (
                          <>
                            <RefreshCw size={18} className="animate-spin" />
                            Importing...
                          </>
                        ) : (
                          <>
                            <Upload size={18} />
                            Import Key
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Mode: NIP-07 */}
                {identityMode === 'nip07' && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="p-6 border border-terminal-dim/30 bg-terminal-dim/5">
                      <div className="font-mono text-sm space-y-2 text-terminal-dim">
                        <div><span className="text-terminal-text">&gt;</span> Protocol: NIP-07 (window.nostr)</div>
                        <div><span className="text-terminal-text">&gt;</span> Compatible: Alby, nos2x, Flamingo</div>
                        <div><span className="text-terminal-text">&gt;</span> Security: Private key never exposed</div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => { setIdentityMode('select'); setError(null); }}
                        className="px-6 py-3 border border-terminal-dim hover:border-terminal-text transition-colors text-sm"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleNip07Connect}
                        disabled={isLoading}
                        className="flex-1 bg-terminal-text text-terminal-bg font-bold px-6 py-3 hover:bg-terminal-text/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isLoading ? (
                          <>
                            <RefreshCw size={18} className="animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <Wifi size={18} />
                            Connect Extension
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Mode: Success */}
                {identityMode === 'success' && identity && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="p-6 border-2 border-terminal-text/50 bg-terminal-text/5">
                      <div className="flex items-center gap-3 text-terminal-text mb-6">
                        <CheckCircle size={24} />
                        <span className="font-bold text-lg">Identity Established</span>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="text-xs text-terminal-dim uppercase tracking-wider mb-2 block">Public Key</label>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 bg-terminal-bg border border-terminal-dim p-3 text-xs font-mono break-all text-terminal-text/80">
                              {identity.npub}
                            </code>
                            <button
                              onClick={handleCopyNpub}
                              className="p-3 border border-terminal-dim hover:border-terminal-text transition-colors"
                            >
                              {copied ? <CheckCircle size={16} className="text-terminal-text" /> : <Copy size={16} />}
                            </button>
                          </div>
                        </div>

                        {identity.displayName && (
                          <div>
                            <label className="text-xs text-terminal-dim uppercase tracking-wider mb-1 block">Display Name</label>
                            <div className="text-terminal-text">{identity.displayName}</div>
                          </div>
                        )}

                        <div className="text-xs text-terminal-dim">
                          Type: {identity.kind === 'nip07' ? 'Browser Extension' : 'Local Key'}
                        </div>
                      </div>
                    </div>

                    {identity.kind === 'local' && (
                      <div className="p-4 border border-terminal-alert/30 bg-terminal-alert/5 text-sm">
                        <div className="flex items-start gap-3">
                          <AlertTriangle size={18} className="text-terminal-alert flex-shrink-0 mt-0.5" />
                          <div className="text-terminal-dim">
                            <span className="text-terminal-alert font-bold">Back up your key!</span> Go to Identity settings after setup to export your nsec.
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Board Selection */}
            {currentStep === 'boards' && (
              <div className="animate-fade-in">
                <div className="text-center mb-8">
                  <h2 className="text-3xl md:text-4xl font-terminal font-bold text-terminal-text mb-3">
                    Choose Your Boards
                  </h2>
                  <p className="text-terminal-dim text-sm">
                    Select the communities you want to follow ({selectedBoards.size} selected)
                  </p>
                </div>

                <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-track-terminal-dim/10 scrollbar-thumb-terminal-text/30">
                  {Object.entries(BOARD_CATEGORIES).map(([category, boardIds]) => {
                    const categoryBoards = boardIds
                      .map(id => INITIAL_BOARDS.find(b => b.id === id))
                      .filter((b): b is Board => b !== undefined);

                    if (categoryBoards.length === 0) return null;

                    return (
                      <div key={category}>
                        <div className="text-xs text-terminal-dim font-bold mb-3 uppercase tracking-wider flex items-center gap-2">
                          <span className="w-4 h-[1px] bg-terminal-dim/30" />
                          {category}
                          <span className="flex-1 h-[1px] bg-terminal-dim/30" />
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                          {categoryBoards.map(board => {
                            const isSelected = selectedBoards.has(board.id);
                            const isHovered = hoveredBoard === board.id;
                            return (
                              <button
                                key={board.id}
                                onClick={() => toggleBoardSelection(board.id)}
                                onMouseEnter={() => setHoveredBoard(board.id)}
                                onMouseLeave={() => setHoveredBoard(null)}
                                className={`
                                  relative p-3 border text-left transition-all duration-200
                                  ${isSelected
                                    ? 'border-terminal-text bg-terminal-text/10'
                                    : 'border-terminal-dim/30 hover:border-terminal-dim'}
                                `}
                              >
                                {/* Selection indicator */}
                                <div className={`
                                  absolute top-2 right-2 w-4 h-4 border flex items-center justify-center text-[10px] font-bold transition-all
                                  ${isSelected
                                    ? 'border-terminal-text bg-terminal-text text-terminal-bg'
                                    : 'border-terminal-dim/50'}
                                `}>
                                  {isSelected && '✓'}
                                </div>

                                <div className="pr-6">
                                  <div className={`font-bold text-sm mb-1 transition-colors ${isSelected ? 'text-terminal-text' : 'text-terminal-dim'}`}>
                                    /{board.name.toLowerCase()}
                                  </div>
                                  <div className="text-xs text-terminal-dim/70 line-clamp-2">
                                    {board.description}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-3 mt-6 pt-4 border-t border-terminal-dim/20">
                  <button
                    onClick={() => setSelectedBoards(new Set())}
                    className="px-4 py-2 text-xs border border-terminal-dim/50 hover:border-terminal-text transition-colors uppercase tracking-wider"
                  >
                    Clear All
                  </button>
                  <button
                    onClick={() => setSelectedBoards(new Set(INITIAL_BOARDS.map(b => b.id)))}
                    className="px-4 py-2 text-xs border border-terminal-dim/50 hover:border-terminal-text transition-colors uppercase tracking-wider"
                  >
                    Select All
                  </button>
                </div>
              </div>
            )}

            {/* Complete Screen */}
            {currentStep === 'complete' && (
              <div className="animate-fade-in text-center">
                {/* Success animation */}
                <div className="relative w-32 h-32 mx-auto mb-8">
                  {/* Rings */}
                  <div className="absolute inset-0 border-2 border-terminal-text/20 rounded-full animate-ping" style={{ animationDuration: '2s' }} />
                  <div className="absolute inset-4 border border-terminal-text/40 rounded-full animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />

                  {/* Center circle */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-20 h-20 border-2 border-terminal-text bg-terminal-text/10 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(var(--color-terminal-text),0.3)]">
                      <CheckCircle size={40} className="text-terminal-text" />
                    </div>
                  </div>
                </div>

                <h2 className="text-3xl md:text-4xl font-terminal font-bold text-terminal-text mb-4">
                  You're In
                </h2>
                <p className="text-terminal-dim mb-8 max-w-md mx-auto">
                  Welcome to Bitboard. Powered by Nostr. Decentralized, encrypted, uncensorable. Discuss anything. Vote with your bits to get the best content on the board.
                </p>

                {/* Status summary */}
                <div className="inline-block text-left border border-terminal-dim/30 p-6 bg-terminal-dim/5 font-mono text-sm">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="w-2 h-2 bg-terminal-text rounded-full" />
                      <span className="text-terminal-dim">Identity:</span>
                      <span className="text-terminal-text">{identity ? 'AUTHENTICATED' : 'ANONYMOUS'}</span>
                    </div>
                    {identity && (
                      <div className="flex items-center gap-3">
                        <span className="w-2 h-2 bg-terminal-text rounded-full" />
                        <span className="text-terminal-dim">Type:</span>
                        <span className="text-terminal-text">{identity.kind === 'nip07' ? 'EXTENSION' : 'LOCAL'}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <span className="w-2 h-2 bg-terminal-text rounded-full" />
                      <span className="text-terminal-dim">Boards:</span>
                      <span className="text-terminal-text">{selectedBoards.size} FOLLOWED</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="w-2 h-2 bg-terminal-text rounded-full animate-pulse" />
                      <span className="text-terminal-dim">Network:</span>
                      <span className="text-terminal-text">CONNECTED</span>
                    </div>
                  </div>
                </div>

                {!identity && (
                  <p className="text-xs text-terminal-dim mt-6">
                    You can create an identity later from the settings menu.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between px-4 py-4 border-t border-terminal-dim/30 bg-terminal-bg/80 backdrop-blur-sm">
          <button
            onClick={handleBack}
            disabled={currentStep === 'welcome'}
            className={`
              flex items-center gap-2 px-4 py-2 text-sm transition-all
              ${currentStep === 'welcome'
                ? 'opacity-0 pointer-events-none'
                : 'text-terminal-dim hover:text-terminal-text'}
            `}
          >
            <ChevronLeft size={18} />
            Back
          </button>

          {/* Center progress indicator (mobile) */}
          <div className="flex sm:hidden items-center gap-1">
            {visibleSteps.map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-all ${
                  i <= visibleStepIndex ? 'bg-terminal-text' : 'bg-terminal-dim/30'
                }`}
              />
            ))}
          </div>

          <button
            onClick={handleNext}
            className="
              flex items-center gap-2 px-6 py-2.5
              bg-terminal-text text-terminal-bg
              font-bold text-sm
              hover:shadow-[0_0_20px_rgba(var(--color-terminal-text),0.3)]
              transition-all
            "
          >
            {currentStep === 'complete' ? 'Enter BitBoard' : 'Continue'}
            {currentStep !== 'complete' && <ChevronRight size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}
