import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight, ChevronLeft, Check, Key, Upload, Wifi, AlertTriangle, RefreshCw, CheckCircle, Copy } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { identityService } from '../services/identityService';
import { listService, LIST_KINDS } from '../services/listService';
import { nostrService } from '../services/nostr/NostrService';
import { INITIAL_BOARDS } from '../constants';
import { LogoCLI } from './LogoCLI';
import type { NostrIdentity, Board } from '../types';

interface OnboardingFlowProps {
  isOpen: boolean;
  onComplete: () => void;
  onSkip: () => void;
  onIdentityChange?: (identity: NostrIdentity | null) => void;
}

type OnboardingStep = 'boot' | 'welcome' | 'identity' | 'boards' | 'features' | 'complete';
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

export function OnboardingFlow({ isOpen, onComplete, onSkip, onIdentityChange }: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('boot');
  const [bootLog, setBootLog] = useState<string[]>([]);
  const [bootComplete, setBootComplete] = useState(false);
  
  // Generate random hex values for boot sequence
  const randomHex = (len: number) => Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join('').toUpperCase();
  
  const bootLines = useRef<string[]>([
    "BITBOARD DECENTRALIZED SYSTEM v3.0.0",
    "═══════════════════════════════════════════════════════",
    "",
    `[BOOT] Initializing kernel... PID:${Math.floor(Math.random() * 9999)}`,
    `[MEM]  Allocating heap memory... 0x${randomHex(8)} [OK]`,
    `[MEM]  Stack pointer: 0x${randomHex(8)} [OK]`,
    "[CRYPTO] Loading secp256k1 curve parameters...",
    `[CRYPTO] Schnorr signature module: 0x${randomHex(6)} [LOADED]`,
    "[CRYPTO] SHA-256 hash functions... [VERIFIED]",
    "",
    "[NOSTR] Initializing protocol handler...",
    `[RELAY] wss://relay.damus.io [CONNECTED]`,
    `[RELAY] wss://nos.lol [CONNECTED]`,
    `[RELAY] wss://relay.snort.social [CONNECTED]`,
    "[NOSTR] WebSocket pool: 3/3 active connections",
    "",
    `[NET]   Peer discovery... ${Math.floor(Math.random() * 50) + 200} nodes found`,
    "[CACHE] IndexedDB storage initialized... [OK]",
    "[UI]    Loading terminal interface...",
    `[SYS]   Session ID: ${randomHex(16)}`,
    "",
    "═══════════════════════════════════════════════════════",
    "SYSTEM READY. AWAITING USER INPUT...",
  ]);
  const [_showContent, setShowContent] = useState(false);
  
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
  
  // Check for NIP-07 extension on mount
  useEffect(() => {
    setHasNip07(identityService.hasNip07Extension());
  }, []);

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
      }, 150); // Faster at 150ms per line for more lines

      return () => clearInterval(interval);
    }
  }, [isOpen, currentStep]);
  
  // Identity handlers
  const handleGenerateIdentity = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 500)); // UX delay
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
      // Build addresses for selected boards
      // Format: "30001:<creatorPubkey>:<boardId>"
      // For initial boards, we use a placeholder pubkey since they're system boards
      const addresses = Array.from(selectedBoards).map(boardId => 
        `30001:bitboard:${boardId}`
      );
      
      const listEvent = listService.buildListEvent({
        kind: LIST_KINDS.COMMUNITIES,
        addresses,
        pubkey: identity.pubkey,
      });
      
      // Sign and publish
      const signedEvent = await identityService.signEvent(listEvent);
      if (signedEvent) {
        await nostrService.publish(signedEvent);
        console.log('[Onboarding] Published board follows:', selectedBoards.size);
      }
    } catch (err) {
      console.error('[Onboarding] Failed to publish board follows:', err);
      // Don't block onboarding completion for this
    }
  };

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

  const handleNext = async () => {
    const nextIndex = visibleStepIndex + 1;
    if (nextIndex < visibleSteps.length) {
      setCurrentStep(visibleSteps[nextIndex]);
    } else {
      // On final completion, publish board follows if identity exists
      await publishBoardFollows();
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

          <div className="min-h-[400px] flex flex-col justify-center animate-fade-in py-8">
            {currentStep === 'welcome' && (
              <div className="space-y-10 text-center">
                <div className="relative inline-block mb-4">
                  <LogoCLI />
                </div>
                
                <div className="space-y-4">
                  <h1 className="text-3xl md:text-6xl font-terminal font-bold text-terminal-text tracking-[0.25em] uppercase drop-shadow-[0_0_15px_rgba(var(--color-terminal-text),0.4)]">
                    SYSTEM <span className="text-terminal-text drop-shadow-[0_0_10px_rgba(var(--color-terminal-text),1)]">ONLINE</span>
                  </h1>
                  <div className="flex justify-center items-center gap-4 text-terminal-dim">
                    <span className="h-[1px] w-16 bg-terminal-text/30"></span>
                    <p className="text-xs md:text-sm font-mono uppercase tracking-[0.4em] animate-pulse">
                      Awaiting user authorization_
                    </p>
                    <span className="h-[1px] w-16 bg-terminal-text/30"></span>
                  </div>
                </div>
                
                <div className="max-w-3xl mx-auto relative group">
                  <div className="absolute -inset-4 bg-terminal-text/5 rounded-xl blur-xl opacity-20 group-hover:opacity-40 transition duration-1000"></div>
                  <div className="relative p-8 md:p-12">
                    <p className="text-xl md:text-3xl leading-relaxed text-terminal-text font-terminal tracking-wide font-light">
                      "Access the global information commons. <br className="hidden md:block" />
                      <span className="text-terminal-dim">No gatekeepers. No algorithms.</span> <br className="hidden md:block" />
                      Just pure, cryptographically-signed truth."
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 max-w-4xl mx-auto px-4">
                  <div className="relative group">
                    <div className="absolute inset-0 bg-terminal-text/5 translate-x-1 translate-y-1"></div>
                    <div className="relative border border-terminal-text/20 p-4 bg-terminal-bg group-hover:border-terminal-text transition-colors">
                      <div className="font-bold text-terminal-text mb-1 font-terminal tracking-widest">[PROTOCOL]</div>
                      <div className="text-xs font-mono opacity-70">NOSTR_NIP-01</div>
                    </div>
                  </div>
                  <div className="relative group">
                    <div className="absolute inset-0 bg-terminal-text/5 translate-x-1 translate-y-1"></div>
                    <div className="relative border border-terminal-text/20 p-4 bg-terminal-bg group-hover:border-terminal-text transition-colors">
                      <div className="font-bold text-terminal-text mb-1 font-terminal tracking-widest">[NETWORK]</div>
                      <div className="text-xs font-mono opacity-70">290+_GLOBAL_RELAYS</div>
                    </div>
                  </div>
                  <div className="relative group">
                    <div className="absolute inset-0 bg-terminal-text/5 translate-x-1 translate-y-1"></div>
                    <div className="relative border border-terminal-text/20 p-4 bg-terminal-bg group-hover:border-terminal-text transition-colors">
                      <div className="font-bold text-terminal-text mb-1 font-terminal tracking-widest">[SECURITY]</div>
                      <div className="text-xs font-mono opacity-70">SCHNORR_SIGS</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 'identity' && (
              <div className="space-y-6">
                <div className="border-l-4 border-terminal-text pl-4 mb-8">
                  <h2 className="text-3xl font-terminal font-bold mb-2">IDENTITY CONFIGURATION</h2>
                  <p className="text-terminal-text opacity-70">
                    {identityMode === 'select' && 'SELECT AUTHENTICATION METHOD_'}
                    {identityMode === 'generate' && 'GENERATING NEW KEYPAIR_'}
                    {identityMode === 'import' && 'IMPORT EXISTING KEY_'}
                    {identityMode === 'nip07' && 'BROWSER EXTENSION_'}
                    {identityMode === 'success' && 'IDENTITY ESTABLISHED_'}
                  </p>
                </div>

                {error && (
                  <div className="p-4 border border-terminal-alert bg-terminal-alert/10 text-terminal-alert flex items-center gap-2 text-sm">
                    <AlertTriangle size={16} />
                    {error}
                  </div>
                )}

                {/* Mode: Select */}
                {identityMode === 'select' && (
                  <div className="space-y-4">
                    {/* Display name input */}
                    <div className="mb-6">
                      <label className="text-xs text-terminal-dim uppercase font-bold mb-2 block">
                        Display Name (optional)
                      </label>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full bg-terminal-bg border border-terminal-dim p-3 text-terminal-text font-mono focus:outline-none focus:border-terminal-text"
                        placeholder="anon_xxxxxx"
                      />
                    </div>

                    <div className="grid gap-4">
                      <button
                        onClick={() => setIdentityMode('generate')}
                        className="group border-2 border-terminal-dim p-6 hover:border-terminal-text hover:shadow-[4px_4px_0_rgba(var(--color-terminal-text),0.4)] transition-all cursor-pointer relative overflow-hidden text-left"
                      >
                        <div className="absolute top-0 right-0 bg-terminal-dim text-terminal-bg px-2 py-1 text-xs font-bold group-hover:bg-terminal-text">OPTION_A</div>
                        <h3 className="text-xl font-bold text-terminal-text mb-2 group-hover:underline decoration-2 underline-offset-4 flex items-center gap-2">
                          <Key size={20} />
                          {`>>`} GENERATE NEW KEYS
                        </h3>
                        <p className="text-sm opacity-80">
                          Create a fresh identity. We'll generate a cryptographically secure keypair for you.
                        </p>
                      </button>

                      <button
                        onClick={() => setIdentityMode('import')}
                        className="group border-2 border-terminal-dim p-6 hover:border-terminal-text hover:shadow-[4px_4px_0_rgba(var(--color-terminal-text),0.4)] transition-all cursor-pointer relative overflow-hidden text-left"
                      >
                        <div className="absolute top-0 right-0 bg-terminal-dim text-terminal-bg px-2 py-1 text-xs font-bold group-hover:bg-terminal-text">OPTION_B</div>
                        <h3 className="text-xl font-bold text-terminal-text mb-2 group-hover:underline decoration-2 underline-offset-4 flex items-center gap-2">
                          <Upload size={20} />
                          {`>>`} IMPORT EXISTING KEY
                        </h3>
                        <p className="text-sm opacity-80">
                          Already on Nostr? Paste your nsec private key to connect your identity.
                        </p>
                      </button>

                      {hasNip07 && (
                        <button
                          onClick={() => setIdentityMode('nip07')}
                          className="group border-2 border-terminal-dim p-6 hover:border-terminal-text hover:shadow-[4px_4px_0_rgba(var(--color-terminal-text),0.4)] transition-all cursor-pointer relative overflow-hidden text-left"
                        >
                          <div className="absolute top-0 right-0 bg-terminal-dim text-terminal-bg px-2 py-1 text-xs font-bold group-hover:bg-terminal-text">OPTION_C</div>
                          <h3 className="text-xl font-bold text-terminal-text mb-2 group-hover:underline decoration-2 underline-offset-4 flex items-center gap-2">
                            <Wifi size={20} />
                            {`>>`} BROWSER EXTENSION
                          </h3>
                          <p className="text-sm opacity-80">
                            Connect via Alby, nos2x, or compatible NIP-07 extension. Private key stays in extension.
                          </p>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Mode: Generate */}
                {identityMode === 'generate' && (
                  <div className="space-y-6">
                    <div className="p-6 border border-terminal-dim bg-terminal-dim/5">
                      <p className="mb-4 text-sm">
                        A new Nostr identity will be created using the <span className="text-terminal-text font-bold">secp256k1</span> elliptic curve.
                        Your private key will be encrypted and stored locally.
                      </p>
                      <div className="text-xs text-terminal-dim font-mono">
                        {`> Algorithm: Schnorr signatures (BIP-340)`}<br/>
                        {`> Key size: 256 bits`}<br/>
                        {`> Storage: AES-256-GCM encrypted localStorage`}
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <button
                        onClick={() => { setIdentityMode('select'); setError(null); }}
                        className="px-6 py-3 border border-terminal-dim hover:border-terminal-text transition-colors"
                      >
                        BACK
                      </button>
                      <button
                        onClick={handleGenerateIdentity}
                        disabled={isLoading}
                        className="flex-1 bg-terminal-text text-terminal-bg font-bold px-6 py-3 hover:bg-terminal-dim hover:text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isLoading ? (
                          <>
                            <RefreshCw size={18} className="animate-spin" />
                            GENERATING...
                          </>
                        ) : (
                          <>
                            <Key size={18} />
                            GENERATE_KEYPAIR
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Mode: Import */}
                {identityMode === 'import' && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-xs text-terminal-dim uppercase font-bold">
                        Private Key (nsec or hex)
                      </label>
                      <input
                        type="password"
                        value={importKey}
                        onChange={(e) => setImportKey(e.target.value)}
                        className="w-full bg-terminal-bg border border-terminal-dim p-3 text-terminal-text font-mono focus:outline-none focus:border-terminal-text"
                        placeholder="nsec1... or 64-char hex"
                      />
                      <p className="text-xs text-terminal-dim">
                        Your key is encrypted locally and never transmitted.
                      </p>
                    </div>

                    <div className="flex gap-4">
                      <button
                        onClick={() => { setIdentityMode('select'); setError(null); setImportKey(''); }}
                        className="px-6 py-3 border border-terminal-dim hover:border-terminal-text transition-colors"
                      >
                        BACK
                      </button>
                      <button
                        onClick={handleImportIdentity}
                        disabled={isLoading || !importKey.trim()}
                        className="flex-1 bg-terminal-text text-terminal-bg font-bold px-6 py-3 hover:bg-terminal-dim hover:text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isLoading ? (
                          <>
                            <RefreshCw size={18} className="animate-spin" />
                            IMPORTING...
                          </>
                        ) : (
                          <>
                            <Upload size={18} />
                            IMPORT_KEY
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Mode: NIP-07 */}
                {identityMode === 'nip07' && (
                  <div className="space-y-6">
                    <div className="p-6 border border-terminal-dim bg-terminal-dim/5">
                      <p className="mb-4 text-sm">
                        Connect using your browser extension. Your <span className="text-terminal-text font-bold">private key stays in the extension</span> - 
                        BitBoard only receives your public key.
                      </p>
                      <div className="text-xs text-terminal-dim font-mono">
                        {`> Protocol: NIP-07 (window.nostr)`}<br/>
                        {`> Compatible: Alby, nos2x, Flamingo, etc.`}<br/>
                        {`> Security: Private key never exposed to app`}
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <button
                        onClick={() => { setIdentityMode('select'); setError(null); }}
                        className="px-6 py-3 border border-terminal-dim hover:border-terminal-text transition-colors"
                      >
                        BACK
                      </button>
                      <button
                        onClick={handleNip07Connect}
                        disabled={isLoading}
                        className="flex-1 bg-terminal-text text-terminal-bg font-bold px-6 py-3 hover:bg-terminal-dim hover:text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isLoading ? (
                          <>
                            <RefreshCw size={18} className="animate-spin" />
                            CONNECTING...
                          </>
                        ) : (
                          <>
                            <Wifi size={18} />
                            CONNECT_EXTENSION
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Mode: Success */}
                {identityMode === 'success' && identity && (
                  <div className="space-y-6">
                    <div className="p-6 border-2 border-green-500/50 bg-green-500/10">
                      <div className="flex items-center gap-2 text-green-500 mb-4">
                        <CheckCircle size={24} />
                        <span className="font-bold text-lg">IDENTITY ESTABLISHED</span>
                      </div>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="text-xs text-terminal-dim uppercase font-bold mb-1 block">Public Key (npub)</label>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 bg-terminal-bg border border-terminal-dim p-2 text-xs font-mono break-all">
                              {identity.npub}
                            </code>
                            <button
                              onClick={handleCopyNpub}
                              className="p-2 border border-terminal-dim hover:border-terminal-text transition-colors"
                            >
                              {copied ? <CheckCircle size={16} className="text-green-500" /> : <Copy size={16} />}
                            </button>
                          </div>
                        </div>

                        {identity.displayName && (
                          <div>
                            <label className="text-xs text-terminal-dim uppercase font-bold mb-1 block">Display Name</label>
                            <div className="text-terminal-text">{identity.displayName}</div>
                          </div>
                        )}

                        <div className="text-xs text-terminal-dim">
                          Type: {identity.kind === 'nip07' ? 'Browser Extension' : 'Local Key'}
                        </div>
                      </div>
                    </div>

                    {identity.kind === 'local' && (
                      <div className="p-4 bg-terminal-alert/10 border border-terminal-alert text-terminal-alert text-sm">
                        <span className="font-bold">IMPORTANT:</span> Back up your private key! Go to Identity settings after setup to export your nsec. BitBoard cannot recover lost keys.
                      </div>
                    )}
                  </div>
                )}

                {/* Warning for select mode */}
                {identityMode === 'select' && (
                  <div className="mt-6 p-4 bg-terminal-alert/10 border border-terminal-alert text-terminal-alert text-sm">
                    <span className="font-bold">WARNING:</span> Your private key is the only way to access your account. BitBoard cannot recover lost keys.
                  </div>
                )}
              </div>
            )}

            {currentStep === 'boards' && (
              <div className="space-y-6">
                <div className="border-l-4 border-terminal-text pl-4 mb-8">
                  <h2 className="text-3xl font-terminal font-bold mb-2">SELECT BOARDS</h2>
                  <p className="text-terminal-text opacity-70">
                    CHOOSE YOUR INTERESTS_ ({selectedBoards.size} selected)
                  </p>
                </div>

                <p className="text-sm text-terminal-dim mb-4">
                  Select the boards you want to follow. You can always change these later.
                </p>

                <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-track-terminal-dim/20 scrollbar-thumb-terminal-text">
                  {Object.entries(BOARD_CATEGORIES).map(([category, boardIds]) => {
                    const categoryBoards = boardIds
                      .map(id => INITIAL_BOARDS.find(b => b.id === id))
                      .filter((b): b is Board => b !== undefined);
                    
                    if (categoryBoards.length === 0) return null;
                    
                    return (
                      <div key={category}>
                        <div className="text-xs text-terminal-dim font-bold mb-2 uppercase tracking-wider">
                          {category}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {categoryBoards.map(board => {
                            const isSelected = selectedBoards.has(board.id);
                            return (
                              <button
                                key={board.id}
                                onClick={() => toggleBoardSelection(board.id)}
                                className={`
                                  p-3 border text-left transition-all flex items-start gap-2
                                  ${isSelected 
                                    ? 'border-terminal-text bg-terminal-text/10 shadow-[2px_2px_0_rgba(var(--color-terminal-text),0.3)]' 
                                    : 'border-terminal-dim hover:border-terminal-text/50'}
                                `}
                              >
                                <div className={`
                                  w-4 h-4 border flex-shrink-0 mt-0.5 flex items-center justify-center text-xs
                                  ${isSelected ? 'border-terminal-text bg-terminal-text text-terminal-bg' : 'border-terminal-dim'}
                                `}>
                                  {isSelected && '✓'}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-terminal-text text-sm truncate">
                                    /{board.name.toLowerCase()}
                                  </div>
                                  <div className="text-xs text-terminal-dim truncate">
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

                <div className="flex gap-4 pt-4 border-t border-terminal-dim/30">
                  <button
                    onClick={() => setSelectedBoards(new Set())}
                    className="px-4 py-2 text-sm border border-terminal-dim hover:border-terminal-text transition-colors"
                  >
                    CLEAR_ALL
                  </button>
                  <button
                    onClick={() => setSelectedBoards(new Set(INITIAL_BOARDS.map(b => b.id)))}
                    className="px-4 py-2 text-sm border border-terminal-dim hover:border-terminal-text transition-colors"
                  >
                    SELECT_ALL
                  </button>
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

                <div className="max-w-md mx-auto border border-terminal-dim p-4 bg-terminal-dim/10 text-sm font-mono text-left space-y-1">
                  <div>{`> user_status: ${identity ? 'AUTHENTICATED' : 'ANONYMOUS'}`}</div>
                  {identity && (
                    <>
                      <div className="truncate">{`> identity: ${identity.npub.slice(0, 20)}...`}</div>
                      <div>{`> auth_type: ${identity.kind === 'nip07' ? 'EXTENSION' : 'LOCAL_KEY'}`}</div>
                    </>
                  )}
                  <div>{`> boards_followed: ${selectedBoards.size}`}</div>
                  <div>{`> connection: ESTABLISHED`}</div>
                  <div>{`> permissions: ${identity ? 'READ/WRITE' : 'READ_ONLY'}`}</div>
                  <div className="animate-pulse">{`> awaiting_command_`}</div>
                </div>

                {!identity && (
                  <div className="text-sm text-terminal-dim">
                    You can create or import an identity later from the settings menu.
                  </div>
                )}
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
