import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useUIStore } from '../stores/uiStore';
import { ViewMode } from '../types';

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
          BitBoard is a Reddit-style bulletin board with no company behind it. No accounts, no
          passwords, no servers storing your data. Your identity is a key that lives only on your
          device — you own it completely.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatPill value="6" label="Default relays" />
        <StatPill value="100" label="Bits per identity" />
        <StatPill value="E2E" label="Encrypted DMs" />
        <StatPill value="0" label="Backend servers" />
      </div>

      {/* How it works */}
      <section className="space-y-3">
        <h2 className="text-sm tracking-[0.3em] uppercase text-terminal-dim border-b border-terminal-dim/30 pb-2">
          // HOW IT WORKS
        </h2>
        <p className="text-sm leading-relaxed">
          When you create an identity, BitBoard generates a keypair in your browser. Your private
          key is encrypted with a passphrase you choose and stored only in your browser — it never
          leaves your device. Every post, vote, and comment is signed with your key and broadcast
          to a network of{' '}
          <span className="text-terminal-text font-bold">relay servers</span> that anyone can run.
          Anyone can verify your content is authentic. No one can forge it.
        </p>
      </section>

      {/* Bits */}
      <section className="space-y-3">
        <h2 className="text-sm tracking-[0.3em] uppercase text-terminal-dim border-b border-terminal-dim/30 pb-2">
          // BITS — LIMITED VOTING CURRENCY
        </h2>
        <div className="border border-terminal-text/40 p-5 space-y-4">
          <p className="text-sm leading-relaxed text-terminal-text/90">
            Every identity starts with{' '}
            <span className="text-terminal-text font-bold">100 bits</span>, refreshed every day.
            Each upvote or downvote costs 1 bit. Retracting a vote refunds it. Switching direction
            is free — the bit stays locked on that post.
          </p>
          <p className="text-sm leading-relaxed text-terminal-text/90">
            This is what makes BitBoard different. On most platforms, votes are free and
            unlimited — bots and coordinated brigades can flood any post with fake signal. On
            BitBoard, every vote has a cost. You can influence at most 100 posts before you run
            out. That scarcity forces you to spend where you actually think it matters.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            <div className="border border-terminal-dim/40 p-3 space-y-1">
              <div className="text-xs tracking-[0.2em] uppercase text-terminal-dim font-bold">
                ▸ Spend deliberately
              </div>
              <p className="text-xs text-terminal-muted leading-relaxed">
                1 bit per vote. You have 100 a day — put them where they count.
              </p>
            </div>
            <div className="border border-terminal-dim/40 p-3 space-y-1">
              <div className="text-xs tracking-[0.2em] uppercase text-terminal-dim font-bold">
                ▸ Retract to refund
              </div>
              <p className="text-xs text-terminal-muted leading-relaxed">
                Changed your mind? Remove the vote and the bit comes back.
              </p>
            </div>
            <div className="border border-terminal-dim/40 p-3 space-y-1">
              <div className="text-xs tracking-[0.2em] uppercase text-terminal-dim font-bold">
                ▸ One vote per post
              </div>
              <p className="text-xs text-terminal-muted leading-relaxed">
                Each identity can only vote once per post — enforced by cryptographic signatures,
                not a database rule.
              </p>
            </div>
          </div>
          <p className="text-xs text-terminal-dim leading-relaxed border-t border-terminal-dim/20 pt-3">
            The feed you see is shaped by people who chose to spend their limited budget on
            specific posts. That signal is harder to fake than a free click.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="space-y-3">
        <h2 className="text-sm tracking-[0.3em] uppercase text-terminal-dim border-b border-terminal-dim/30 pb-2">
          // WHAT YOU CAN DO
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            {
              label: 'Boards',
              items: [
                'Topic boards — like subreddits, open to anyone',
                'Location boards — tied to a geographic area',
                'Encrypted boards — only people with the key can read them',
              ],
            },
            {
              label: 'Posts & Votes',
              items: [
                'Posts are permanent and signed by your identity',
                'Each vote costs 1 bit; retracting it refunds the bit',
                'You can edit posts — the original is always preserved',
              ],
            },
            {
              label: 'Private Messaging',
              items: [
                'End-to-end encrypted direct messages',
                'Decrypted content is never saved to your device',
                'Works across any relay',
              ],
            },
            {
              label: 'Social & Discovery',
              items: [
                'Follow people and see their posts in your feed',
                'Mute users you don\'t want to see',
                'Web of Trust — posts from people your contacts trust rank higher',
                'Tip posts with Bitcoin via Lightning Zaps',
              ],
            },
            {
              label: 'Privacy',
              items: [
                'Your private key never leaves your device',
                'Use a hardware wallet or browser extension — the app never sees your key',
                'Analytics are opt-in only and collect no personal data',
                'Error reports never include your identity',
              ],
            },
            {
              label: 'App',
              items: [
                'Works offline — installs as a PWA',
                '8 color themes',
                'Full-text search',
                'Keyboard shortcuts',
              ],
            },
          ].map(({ label, items }) => (
            <div key={label} className="border border-terminal-dim/40 p-4 space-y-2">
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
          ))}
        </div>
      </section>

      {/* Prototype notice */}
      <div className="border border-terminal-alert/40 bg-terminal-alert/5 p-4 text-sm leading-relaxed">
        <span className="text-terminal-alert font-bold uppercase tracking-wider text-xs">
          ⚠ Prototype
        </span>
        <p className="mt-2 text-terminal-muted">
          BitBoard is experimental software under active development. Once you publish content,
          it may spread across relay servers and can't be reliably deleted. Back up your private
          key and never share it.
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
