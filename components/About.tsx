import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useUIStore } from '../stores/uiStore';
import { ViewMode } from '../types';

const FeatureBlock: React.FC<{ label: string; items: string[] }> = ({ label, items }) => (
  <div className="border border-terminal-dim/40 p-4 space-y-2">
    <div className="text-xs tracking-[0.2em] uppercase text-terminal-dim font-bold mb-3">
      ▸ {label}
    </div>
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item} className="text-sm text-terminal-text flex gap-2">
          <span className="text-terminal-dim shrink-0">—</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  </div>
);

const StatPill: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <div className="border border-terminal-dim/40 px-4 py-3 text-center">
    <div className="text-lg font-terminal text-terminal-text">{value}</div>
    <div className="text-[10px] tracking-widest uppercase text-terminal-dim mt-0.5">{label}</div>
  </div>
);

export const About: React.FC = () => {
  const setViewMode = useUIStore((s) => s.setViewMode);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8 animate-fade-in font-mono text-terminal-text">
      {/* Back button */}
      <button
        onClick={() => setViewMode(ViewMode.FEED)}
        className="flex items-center gap-2 text-terminal-dim hover:text-terminal-text uppercase text-xs md:text-sm font-bold group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        BACK TO FEED
      </button>

      {/* Hero */}
      <div className="border-2 border-terminal-text/60 p-6 md:p-8 relative">
        <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-terminal-text" />
        <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-terminal-text" />
        <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-terminal-text" />
        <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-terminal-text" />

        <div className="flex items-center gap-5 mb-5">
          {/* Mini eagle logo */}
          <div className="relative w-14 h-14 shrink-0">
            <div
              className="absolute inset-0"
              style={{
                backgroundColor: 'rgb(var(--color-terminal-text))',
                maskImage: "url('/assets/bitboard-logo.png')",
                WebkitMaskImage: "url('/assets/bitboard-logo.png')",
                maskSize: 'contain',
                WebkitMaskSize: 'contain',
                maskRepeat: 'no-repeat',
                WebkitMaskRepeat: 'no-repeat',
                maskPosition: 'center',
                WebkitMaskPosition: 'center',
                filter: 'drop-shadow(0 0 6px rgba(var(--color-terminal-text), 0.4))',
              }}
            />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-terminal tracking-tight uppercase leading-none text-terminal-text">
              BitBoard
            </h1>
            <p className="text-xs tracking-[0.25em] text-terminal-dim uppercase mt-1">
              Decentralized Message Board · Nostr Protocol
            </p>
          </div>
        </div>

        <p className="text-sm md:text-base leading-relaxed text-terminal-text/90 max-w-2xl">
          BitBoard is a Reddit-style bulletin board built entirely on the{' '}
          <span className="text-terminal-text font-bold">Nostr protocol</span> — an open,
          censorship-resistant network with no central servers. There are no accounts, no
          passwords, and no company holding your data. Your identity is a cryptographic keypair
          that only you control.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatPill value="6" label="Default relays" />
        <StatPill value="NIP-04/17" label="DM encryption" />
        <StatPill value="AES-256" label="Key storage" />
        <StatPill value="0" label="Backend servers" />
      </div>

      {/* How it works */}
      <section className="space-y-3">
        <h2 className="text-sm tracking-[0.3em] uppercase text-terminal-dim border-b border-terminal-dim/30 pb-2">
          // HOW IT WORKS
        </h2>
        <p className="text-sm leading-relaxed">
          When you create an identity, BitBoard generates a secp256k1 keypair in your browser.
          Your private key is encrypted with AES-256-GCM using a passphrase you choose and stored
          only in your local browser storage — it never leaves your device. Every post, vote, and
          comment you make is signed with that key and published to a network of{' '}
          <span className="text-terminal-text font-bold">Nostr relay servers</span> that anyone
          can run. Anyone with your public key can verify your content is authentic. No one can
          forge it.
        </p>
      </section>

      {/* Features grid */}
      <section className="space-y-3">
        <h2 className="text-sm tracking-[0.3em] uppercase text-terminal-dim border-b border-terminal-dim/30 pb-2">
          // FEATURES
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FeatureBlock
            label="Boards"
            items={[
              '//TOPIC boards — like subreddits, created on-chain',
              '#geohash boards — location-based, e.g. #9q8y',
              'Encrypted boards — AES-256 key shared via URL fragment',
              'Board definitions stored as Nostr kind-30001 events',
            ]}
          />
          <FeatureBlock
            label="Posts & Votes"
            items={[
              'Posts are signed Nostr kind-1 events',
              'Votes are kind-7 reactions — one per pubkey, enforced cryptographically',
              'Edits are companion events; originals are immutable',
              'Signature verification runs in a background Web Worker',
            ]}
          />
          <FeatureBlock
            label="Private Messaging"
            items={[
              'NIP-04 legacy DMs for relay compatibility',
              'NIP-17 gift-wrap for maximum privacy (randomized timestamps)',
              'Decrypted content never written to disk',
              'Conversation history synced across relay fetches',
            ]}
          />
          <FeatureBlock
            label="Social Graph"
            items={[
              'Follow/unfollow synced via NIP-02 contact lists',
              'Web of Trust scoring — 3-hop follow graph with trust decay',
              'Mute lists synced via NIP-51',
              'NIP-57 Lightning Zaps — tip posts with real Bitcoin',
            ]}
          />
          <FeatureBlock
            label="Privacy & Identity"
            items={[
              'NIP-07 browser extension support (Alby, nos2x)',
              'PBKDF2 key derivation — 310,000 iterations',
              'PostHog analytics — opt-in only, no PII collected',
              'Error reports anonymized — pubkey is SHA-256 hashed',
            ]}
          />
          <FeatureBlock
            label="Client Features"
            items={[
              'Offline-capable PWA with Workbox service worker',
              'Virtualized feed — handles thousands of posts',
              '8 color themes (Amber, Phosphor, Plasma, and more)',
              'Full-text search powered by a Web Worker',
            ]}
          />
        </div>
      </section>

      {/* Protocol section */}
      <section className="space-y-3">
        <h2 className="text-sm tracking-[0.3em] uppercase text-terminal-dim border-b border-terminal-dim/30 pb-2">
          // NOSTR NIPS IMPLEMENTED
        </h2>
        <div className="flex flex-wrap gap-2">
          {[
            'NIP-01 · Base protocol',
            'NIP-02 · Contact lists',
            'NIP-04 · Encrypted DMs',
            'NIP-17 · Gift wrap DMs',
            'NIP-23 · Long-form articles',
            'NIP-51 · Lists',
            'NIP-56 · Reporting',
            'NIP-57 · Lightning Zaps',
            'NIP-58 · Badges',
            'NIP-65 · Relay lists',
            'NIP-72 · Communities',
            'NIP-53 · Live events',
          ].map((nip) => (
            <span
              key={nip}
              className="text-[10px] tracking-wider border border-terminal-dim/40 px-2 py-1 text-terminal-dim uppercase"
            >
              {nip}
            </span>
          ))}
        </div>
      </section>

      {/* Prototype notice */}
      <div className="border border-terminal-alert/40 bg-terminal-alert/5 p-4 text-sm leading-relaxed">
        <span className="text-terminal-alert font-bold uppercase tracking-wider text-xs">
          ⚠ Prototype
        </span>
        <p className="mt-2 text-terminal-muted">
          BitBoard is experimental software under active development. The Nostr protocol is
          open and permissionless — once you publish content to relays, it may propagate
          indefinitely. Use accordingly. Back up your private key (nsec) and never share it.
        </p>
      </div>

      {/* Footer links */}
      <div className="pt-4 border-t border-terminal-dim/30 flex flex-wrap gap-4 text-xs text-terminal-dim">
        <button
          className="hover:text-terminal-text transition-colors underline"
          onClick={() => setViewMode(ViewMode.PRIVACY_POLICY)}
        >
          Privacy Policy
        </button>
        <span>·</span>
        <button
          className="hover:text-terminal-text transition-colors underline"
          onClick={() => setViewMode(ViewMode.TERMS_OF_SERVICE)}
        >
          Terms of Service
        </button>
        <span>·</span>
        <span className="text-terminal-dim/60">
          Built on Nostr · No servers · Your keys, your content
        </span>
      </div>
    </div>
  );
};
