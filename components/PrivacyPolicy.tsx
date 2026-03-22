import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useUIStore } from '../stores/uiStore';
import { ViewMode } from '../types';

export const PrivacyPolicy: React.FC = () => {
  const setViewMode = useUIStore((s) => s.setViewMode);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6 animate-fade-in font-mono text-terminal-text">
      <button
        onClick={() => setViewMode(ViewMode.FEED)}
        className="flex items-center gap-2 text-terminal-dim hover:text-terminal-text mb-4 uppercase text-xs md:text-sm font-bold group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        BACK TO FEED
      </button>

      <h1 className="text-3xl font-bold mb-6 font-terminal tracking-wide">Privacy Policy</h1>

      <p className="text-sm text-terminal-dim">Last Updated: 2026-03-17</p>

      <div className="border border-terminal-alert/40 bg-terminal-alert/5 p-4 text-sm leading-relaxed">
        <span className="text-terminal-alert font-bold uppercase tracking-wider text-xs">
          ⚠ Prototype Software
        </span>
        <p className="mt-2 text-terminal-dim">
          BitBoard is experimental software under active development. This privacy policy reflects
          the current state of the application as accurately as possible.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Overview</h2>
        <p>
          BitBoard is a decentralized message board built on the Nostr protocol. It runs entirely in
          your browser — there are no BitBoard backend servers that collect or store your data. Your
          identity is a cryptographic keypair that only you control.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">What Is Stored Locally</h2>
        <p>
          The following data is stored only in your browser's <code>localStorage</code>. It never
          leaves your device except as described under "Nostr Network" below.
        </p>

        <h3 className="text-xl font-semibold mt-4">Identity &amp; Keys</h3>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>
            <strong>Encrypted private key:</strong> Your secp256k1 Nostr private key is encrypted
            with AES-256-GCM before being written to localStorage. The encryption key is derived
            from a passphrase you choose using PBKDF2 with 310,000 iterations and a random 32-byte
            salt. The plaintext private key is never written to disk.
          </li>
          <li>
            <strong>Public key &amp; display name:</strong> Stored in plaintext (these are public by
            design).
          </li>
          <li>
            <strong>PBKDF2 salt:</strong> Stored alongside the encrypted key so the same passphrase
            can re-derive the decryption key on future sessions.
          </li>
        </ul>

        <h3 className="text-xl font-semibold mt-4">Preferences &amp; Cache</h3>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Theme selection, relay list, and UI preferences</li>
          <li>Bookmarks (stored as a list of Nostr event IDs)</li>
          <li>Mute list (validated as 64-character hex pubkeys on load)</li>
          <li>Guest username (persisted for stability across reloads)</li>
          <li>Onboarding completion flag</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">How Data Is Shared</h2>

        <h3 className="text-xl font-semibold mt-4">Nostr Network</h3>
        <p>
          When you create posts, comments, votes, or follow lists, this content is signed with your
          private key and published to the Nostr relay servers you have configured. This is inherent
          to how the Nostr protocol works:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Public posts are visible to anyone on the Nostr network</li>
          <li>Your public key is permanently associated with your content</li>
          <li>Relay servers may store and re-broadcast your published events indefinitely</li>
          <li>
            <strong>
              Content published to Nostr cannot be reliably deleted from relay servers
            </strong>{' '}
            — this is a fundamental property of the decentralized protocol
          </li>
        </ul>

        <h3 className="text-xl font-semibold mt-4">Encrypted Boards</h3>
        <p>
          Encrypted board content is AES-256 encrypted client-side. The encryption key is shared via
          URL fragment (never sent to servers). Relay operators cannot read the content.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Third-Party Services</h2>

        <h3 className="text-xl font-semibold mt-4">Sentry (Error Monitoring)</h3>
        <p>
          BitBoard uses Sentry for crash and error reporting. Before any identity data is sent to
          Sentry, your Nostr public key is <strong>SHA-256 hashed</strong> — the raw pubkey is never
          transmitted. This prevents Sentry from linking error reports to your pseudonymous Nostr
          identity. No private key material is ever sent.
        </p>

        <h3 className="text-xl font-semibold mt-4">PostHog (Analytics)</h3>
        <p>
          Analytics are <strong>opt-in only</strong>. You must explicitly consent before any usage
          data is collected. If you opt in:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>
            Anonymous feature usage, interaction patterns, and performance metrics are tracked
          </li>
          <li>No personally identifiable information (PII) is collected</li>
          <li>Your Nostr pubkey is pseudonymized before being passed to PostHog</li>
          <li>You can opt out at any time in app settings</li>
        </ul>
        <p className="text-sm text-terminal-dim mt-2">
          If you have not explicitly opted in, PostHog is not initialized and no data is sent.
        </p>

        <h3 className="text-xl font-semibold mt-4">Nostr Relay Servers</h3>
        <p>
          You connect to relay servers of your own choice. BitBoard ships with a default list of six
          public relays. Relay operators can see your IP address and all events you publish or
          subscribe to. Review each relay's own privacy policy for their data handling practices.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Data Security</h2>
        <p>
          BitBoard is designed to minimize trust requirements. Key security properties of the
          current implementation:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Private key encrypted at rest with AES-256-GCM (never stored as plaintext)</li>
          <li>PBKDF2 key derivation with 310,000 iterations and a 32-byte random salt</li>
          <li>Sentry receives only a SHA-256 hash of your pubkey</li>
          <li>Vote signatures verified in a background Web Worker using the Nostr protocol</li>
          <li>
            NIP-07 browser extension support (Alby, nos2x) — private key never touches the app
          </li>
        </ul>
        <p className="text-sm text-terminal-dim mt-2">
          You are responsible for keeping your passphrase and device secure. BitBoard cannot recover
          a lost or forgotten passphrase.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Your Rights</h2>
        <p>Since BitBoard has no backend, all locally stored data is under your direct control:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>
            <strong>Access:</strong> Your data lives in your browser's localStorage — inspect it
            directly via browser developer tools
          </li>
          <li>
            <strong>Deletion:</strong> Clearing localStorage removes all locally stored data
            including your encrypted key
          </li>
          <li>
            <strong>Portability:</strong> Export your Nostr keypair (nsec) and import it into any
            other Nostr client
          </li>
        </ul>
        <p className="text-sm text-terminal-dim mt-2">
          Content already published to Nostr relays cannot be deleted by BitBoard, as the app has no
          authority over relay operators.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Children's Privacy</h2>
        <p>
          BitBoard is not intended for users under the age of 13. We do not knowingly collect
          information from children.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Changes to This Policy</h2>
        <p>
          We may update this privacy policy as the application evolves. The "Last Updated" date at
          the top reflects when changes were last made.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Contact</h2>
        <p>
          For questions about this privacy policy, reach out through the Nostr network or open an
          issue on our GitHub repository.
        </p>
      </section>

      <div className="mt-8 pt-6 border-t border-terminal-dim/30">
        <p className="text-sm text-terminal-dim">
          BitBoard is open-source software. You can review the full source code to independently
          verify how your data is handled.
        </p>
      </div>
    </div>
  );
};
