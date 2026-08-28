import React from 'react';
import {
  ArrowLeft,
  Radio,
  Coins,
  Lock,
  ShieldCheck,
  KeyRound,
  LayoutGrid,
  Globe,
  Users,
  Zap,
  Smartphone,
} from 'lucide-react';
import { useUIStore } from '../stores/uiStore';
import { ViewMode } from '../types';

const iconClass = 'text-terminal-dim group-hover:text-terminal-text/80 transition-colors';

const StatPill: React.FC<{
  value: string;
  label: string;
  icon: React.ReactNode;
}> = ({ value, label, icon }) => (
  <div className="group border border-terminal-dim/40 bg-terminal-highlight/30 px-4 py-3.5 text-center hover:border-terminal-dim/60 transition-colors">
    <div className="flex justify-center mb-1.5">{icon}</div>
    <div className="text-lg font-terminal text-terminal-text">{value}</div>
    <div className="text-2xs tracking-widest uppercase text-terminal-dim mt-0.5">{label}</div>
  </div>
);

export const About: React.FC = () => {
  const setViewMode = useUIStore((s) => s.setViewMode);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6 animate-fade-in font-mono text-terminal-text">
      {/* Back button */}
      <button
        onClick={() => setViewMode(ViewMode.FEED)}
        className="flex items-center gap-2 text-terminal-dim hover:text-terminal-text uppercase text-xs md:text-sm font-bold group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        BACK TO FEED
      </button>

      {/* Hero */}
      <div className="ui-page-hero shadow-[0_0_30px_rgba(var(--color-terminal-text),0.04)] md:p-8">
        <div className="flex items-center gap-5 mb-4">
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
            <h1 className="font-display text-4xl font-semibold leading-none text-terminal-text md:text-5xl">
              BitBoard
            </h1>
            <p className="text-xs tracking-[0.25em] text-terminal-dim uppercase mt-1">
              Nostr boards · BitChat places
            </p>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-terminal-text/90 max-w-xl">
          Named topic boards on Nostr. Nearby rooms tagged with a geohash — the same kind-1
          location notes BitChat publishes on the internet. Empty boards stay empty. Bluetooth mesh
          lives in the BitChat app, not here.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatPill
          value="10"
          label="Default relays"
          icon={<Radio size={18} className={iconClass} />}
        />
        <StatPill
          value="100"
          label="Local bits / day"
          icon={<Coins size={18} className={iconClass} />}
        />
        <StatPill
          value="AES"
          label="Encrypted boards"
          icon={<Lock size={18} className={iconClass} />}
        />
        <StatPill
          value="0"
          label="App servers"
          icon={<ShieldCheck size={18} className={iconClass} />}
        />
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 py-1">
        <div className="flex-1 h-px bg-terminal-dim/20" />
        <span className="text-terminal-dim/30 text-2xs">◆</span>
        <div className="flex-1 h-px bg-terminal-dim/20" />
      </div>

      {/* Core concepts */}
      <section className="space-y-3">
        <h2 className="ui-section-title flex items-center gap-2">
          <KeyRound size={14} className="text-terminal-text/60 shrink-0" />
          HOW IT WORKS
        </h2>
        <div className="flex gap-3">
          <KeyRound size={16} className="text-terminal-dim/70 shrink-0 mt-0.5 hidden sm:block" />
          <p className="text-sm text-terminal-dim leading-relaxed">
              When you join, BitBoard can create a Nostr keypair in your browser. Your private key
              stays on this device — encrypted with a passphrase, never uploaded to a BitBoard
              server (there isn&apos;t one). Posts and votes are signed events on relays anyone can
              run.
            </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="ui-section-title flex items-center gap-2">
          <Coins size={14} className="text-terminal-text/60 shrink-0" />
          BITS
        </h2>
        <div className="border border-terminal-text/20 bg-terminal-text/[0.02] p-4 pl-5">
          <div className="flex gap-3">
            <Coins size={18} className="text-terminal-dim/40 shrink-0 mt-0.5 hidden sm:block" />
            <p className="text-sm text-terminal-dim leading-relaxed">
              You get <span className="text-terminal-text font-medium">100 bits</span> each day in
              this browser. Each vote here costs{' '}
              <span className="text-terminal-text font-medium">1 bit</span> (refunded if you
              retract). Bits only gate kind-7 reactions in BitBoard — other clients can react
              without them. Not a uniqueness token. Not sybil-proof.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="ui-section-title flex items-center gap-2">
          <LayoutGrid size={14} className="text-terminal-text/60 shrink-0" />
          FEATURES
        </h2>
        <div className="border border-terminal-dim/25 bg-terminal-dim/[0.03] p-4 md:p-5">
          <ul className="text-sm text-terminal-dim space-y-2.5 columns-1 md:columns-2 gap-x-8">
            <li className="flex gap-2 break-inside-avoid">
              <Globe size={14} className="text-terminal-dim shrink-0 mt-0.5" />
              <span>
                LOCAL: geohash channels. Kind-1 notes with a g tag, including BitChat location notes
              </span>
            </li>
            <li className="flex gap-2 break-inside-avoid">
              <LayoutGrid size={14} className="text-terminal-dim shrink-0 mt-0.5" />
              <span>BOARDS: named Nostr topics, scoped with a client=bitboard tag</span>
            </li>
            <li className="flex gap-2 break-inside-avoid">
              <Lock size={14} className="text-terminal-dim shrink-0 mt-0.5" />
              <span>Encrypted boards (AES-256-GCM, key in the share URL fragment)</span>
            </li>
            <li className="flex gap-2 break-inside-avoid">
              <Users size={14} className="text-terminal-dim shrink-0 mt-0.5" />
              <span>Follow, mute, and optional Web of Trust ranking</span>
            </li>
            <li className="flex gap-2 break-inside-avoid">
              <Zap size={14} className="text-terminal-dim shrink-0 mt-0.5" />
              <span>Lightning Zaps (NIP-57) when you set a lightning address</span>
            </li>
            <li className="flex gap-2 break-inside-avoid">
              <Smartphone size={14} className="text-terminal-dim shrink-0 mt-0.5" />
              <span>PWA + offline cache. Bluetooth mesh is BitChat-native, not this web client</span>
            </li>
          </ul>
        </div>
      </section>

      {/* Prototype notice */}
      <div className="border border-terminal-alert/40 bg-terminal-alert/5 p-4 rounded-sm">
        <span className="text-terminal-alert font-bold uppercase tracking-wider text-xs">
          ⚠ Prototype
        </span>
        <p className="mt-1.5 text-terminal-dim text-xs leading-relaxed">
          We're still building. Once you publish, content can spread across relays — so back up your
          key and keep it safe.
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
