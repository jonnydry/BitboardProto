/**
 * Onboarding Flow Component
 *
 * Guides new users through BitBoard setup with a multi-step wizard.
 */

import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Check } from 'lucide-react';

interface OnboardingFlowProps {
  isOpen: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

type OnboardingStep = 'welcome' | 'identity' | 'boards' | 'features' | 'complete';

export function OnboardingFlow({ isOpen, onComplete, onSkip }: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome');

  if (!isOpen) return null;

  const steps: OnboardingStep[] = ['welcome', 'identity', 'boards', 'features', 'complete'];
  const currentStepIndex = steps.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  const handleNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex]);
    } else {
      onComplete();
    }
  };

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex]);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="relative w-full max-w-3xl border border-terminal-highlight bg-terminal-bg p-8 shadow-glow">
        {/* Progress bar */}
        <div className="mb-6">
          <div className="h-1 w-full bg-terminal-dim">
            <div
              className="h-full bg-terminal-highlight transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Skip button */}
        <button
          onClick={onSkip}
          className="absolute top-4 right-4 text-terminal-dim hover:text-terminal-text"
          aria-label="Skip onboarding"
        >
          <X size={24} />
        </button>

        {/* Step content */}
        <div className="min-h-[400px]">
          {currentStep === 'welcome' && (
            <div className="text-center space-y-6">
              <h1 id="onboarding-title" className="text-4xl font-mono text-terminal-highlight">
                WELCOME TO BITBOARD
              </h1>
              <p className="text-xl text-terminal-text font-mono">
                A decentralized message board built on Nostr
              </p>
              <div className="space-y-4 text-left max-w-xl mx-auto">
                <div className="border-l-2 border-terminal-highlight pl-4">
                  <p className="text-terminal-text font-mono">
                    <span className="text-terminal-highlight">✓</span> No servers, no censorship
                  </p>
                </div>
                <div className="border-l-2 border-terminal-highlight pl-4">
                  <p className="text-terminal-text font-mono">
                    <span className="text-terminal-highlight">✓</span> Your keys, your identity
                  </p>
                </div>
                <div className="border-l-2 border-terminal-highlight pl-4">
                  <p className="text-terminal-text font-mono">
                    <span className="text-terminal-highlight">✓</span> Encrypted boards for privacy
                  </p>
                </div>
              </div>
            </div>
          )}

          {currentStep === 'identity' && (
            <div className="space-y-6">
              <h2 className="text-3xl font-mono text-terminal-highlight">YOUR IDENTITY</h2>
              <p className="text-terminal-text font-mono">
                BitBoard uses Nostr keys for identity. You can either:
              </p>
              <div className="space-y-4">
                <div className="border border-terminal-dim p-4 hover:border-terminal-highlight">
                  <h3 className="text-xl font-mono text-terminal-highlight mb-2">
                    Generate New Keys
                  </h3>
                  <p className="text-terminal-text font-mono text-sm">
                    Create a new Nostr identity. Keep your private key (nsec) safe!
                  </p>
                </div>
                <div className="border border-terminal-dim p-4 hover:border-terminal-highlight">
                  <h3 className="text-xl font-mono text-terminal-highlight mb-2">
                    Import Existing Keys
                  </h3>
                  <p className="text-terminal-text font-mono text-sm">
                    Use your existing Nostr keys (nsec or browser extension).
                  </p>
                </div>
              </div>
              <div className="bg-terminal-dim/20 border border-terminal-dim p-4">
                <p className="text-terminal-text font-mono text-sm">
                  <span className="text-terminal-alert">⚠ Important:</span> Your private key is stored
                  encrypted in your browser. Never share your nsec with anyone!
                </p>
              </div>
            </div>
          )}

          {currentStep === 'boards' && (
            <div className="space-y-6">
              <h2 className="text-3xl font-mono text-terminal-highlight">BOARDS</h2>
              <p className="text-terminal-text font-mono">
                BitBoard organizes discussions into boards:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-terminal-dim p-4">
                  <h3 className="text-xl font-mono text-terminal-highlight mb-2">Topic Boards</h3>
                  <p className="text-terminal-text font-mono text-sm">
                    Like /tech, /random - organized by subject
                  </p>
                </div>
                <div className="border border-terminal-dim p-4">
                  <h3 className="text-xl font-mono text-terminal-highlight mb-2">Location Boards</h3>
                  <p className="text-terminal-text font-mono text-sm">
                    Based on geohash - find local discussions
                  </p>
                </div>
                <div className="border border-terminal-dim p-4">
                  <h3 className="text-xl font-mono text-terminal-highlight mb-2">Encrypted Boards</h3>
                  <p className="text-terminal-text font-mono text-sm">
                    Password-protected private discussions
                  </p>
                </div>
                <div className="border border-terminal-dim p-4">
                  <h3 className="text-xl font-mono text-terminal-highlight mb-2">Custom Boards</h3>
                  <p className="text-terminal-text font-mono text-sm">
                    Create your own boards on any topic
                  </p>
                </div>
              </div>
            </div>
          )}

          {currentStep === 'features' && (
            <div className="space-y-6">
              <h2 className="text-3xl font-mono text-terminal-highlight">FEATURES</h2>
              <div className="space-y-4">
                <div className="border-l-2 border-terminal-highlight pl-4">
                  <h3 className="text-lg font-mono text-terminal-highlight">Cryptographic Voting</h3>
                  <p className="text-terminal-text font-mono text-sm">
                    One vote per user, verified by Nostr signatures
                  </p>
                </div>
                <div className="border-l-2 border-terminal-highlight pl-4">
                  <h3 className="text-lg font-mono text-terminal-highlight">Offline Mode</h3>
                  <p className="text-terminal-text font-mono text-sm">
                    Posts queue automatically when offline
                  </p>
                </div>
                <div className="border-l-2 border-terminal-highlight pl-4">
                  <h3 className="text-lg font-mono text-terminal-highlight">Keyboard Shortcuts</h3>
                  <p className="text-terminal-text font-mono text-sm">
                    Press <kbd className="bg-terminal-dim px-1">?</kbd> to see all shortcuts
                  </p>
                </div>
                <div className="border-l-2 border-terminal-highlight pl-4">
                  <h3 className="text-lg font-mono text-terminal-highlight">Markdown Support</h3>
                  <p className="text-terminal-text font-mono text-sm">
                    Format your posts with markdown and code blocks
                  </p>
                </div>
              </div>
            </div>
          )}

          {currentStep === 'complete' && (
            <div className="text-center space-y-6">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full border-2 border-terminal-highlight">
                <Check size={48} className="text-terminal-highlight" />
              </div>
              <h2 className="text-3xl font-mono text-terminal-highlight">YOU'RE ALL SET!</h2>
              <p className="text-terminal-text font-mono">
                You're ready to start exploring BitBoard.
              </p>
              <div className="bg-terminal-dim/20 border border-terminal-dim p-4 max-w-xl mx-auto">
                <p className="text-terminal-text font-mono text-sm">
                  Need help? Press <kbd className="bg-terminal-dim px-1">?</kbd> for keyboard shortcuts
                  or visit the settings to configure your relays and preferences.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Navigation buttons */}
        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={handleBack}
            disabled={currentStepIndex === 0}
            className="flex items-center gap-2 border border-terminal-dim px-4 py-2 font-mono text-terminal-text hover:border-terminal-highlight hover:text-terminal-highlight disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={20} />
            Back
          </button>

          <div className="flex gap-2">
            {steps.map((step, index) => (
              <div
                key={step}
                className={`h-2 w-2 rounded-full ${
                  index === currentStepIndex
                    ? 'bg-terminal-highlight'
                    : index < currentStepIndex
                    ? 'bg-terminal-text'
                    : 'bg-terminal-dim'
                }`}
              />
            ))}
          </div>

          <button
            onClick={handleNext}
            className="flex items-center gap-2 border border-terminal-highlight px-4 py-2 font-mono text-terminal-highlight hover:bg-terminal-highlight hover:text-terminal-bg"
          >
            {currentStep === 'complete' ? 'Get Started' : 'Next'}
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
