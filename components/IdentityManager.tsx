import React, { useState, useEffect } from 'react';
import {
  Key,
  Copy,
  Download,
  Upload,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Wifi,
  WifiOff,
  User,
} from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { identityService } from '../services/identityService';
import { toastService } from '../services/toastService';
import { UIConfig } from '../config';
import type { NostrIdentity } from '../types';

interface IdentityManagerProps {
  onIdentityChange: (identity: NostrIdentity | null) => void;
  onClose: () => void;
  onViewProfile?: (username: string, pubkey?: string) => void;
  initialIntent?: 'generate' | 'import';
}

export const IdentityManager: React.FC<IdentityManagerProps> = ({
  onIdentityChange,
  onClose,
  onViewProfile,
  initialIntent,
}) => {
  const [identity, setIdentity] = useState<NostrIdentity | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [importKey, setImportKey] = useState('');
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [hasNip07, setHasNip07] = useState(false);
  const [isConfirmingLogout, setIsConfirmingLogout] = useState(false);
  const generatePassphraseRef = React.useRef<HTMLInputElement | null>(null);
  const importKeyRef = React.useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const loadIdentity = async () => {
      const existingIdentity = await identityService.getIdentityAsync();
      if (existingIdentity) {
        setIdentity(existingIdentity);
        setDisplayName(existingIdentity.displayName || '');
      }
      setHasNip07(identityService.hasNip07Extension());
    };
    loadIdentity();
  }, []);

  useEffect(() => {
    if (identity) return;

    const timer = window.setTimeout(() => {
      if (initialIntent === 'import') {
        importKeyRef.current?.focus();
      } else if (initialIntent === 'generate') {
        generatePassphraseRef.current?.focus();
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [identity, initialIntent]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      if (!passphrase.trim()) {
        setError(
          'Choose a passphrase (12+ characters) to encrypt your new key on this device. It is not your nsec.',
        );
        return;
      }
      if (passphrase !== confirmPassphrase) {
        setError('Passphrases do not match.');
        return;
      }
      // Small delay for UX feedback
      await new Promise((resolve) => setTimeout(resolve, 300));
      const newIdentity = await identityService.generateIdentity(
        displayName || undefined,
        passphrase,
      );
      setIdentity(newIdentity);
      onIdentityChange(newIdentity);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate identity');
      console.error('[IdentityManager] Generate failed:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImport = async () => {
    setIsImporting(true);
    setError(null);

    if (!importKey.trim()) {
      setError('Please enter your nsec or hex private key');
      setIsImporting(false);
      return;
    }

    if (!passphrase.trim()) {
      setError(
        'Choose a new passphrase (12+ characters) for BitBoard. Your nsec has no password — this phrase only encrypts it on this device.',
      );
      setIsImporting(false);
      return;
    }

    if (passphrase !== confirmPassphrase) {
      setError('Passphrases do not match.');
      setIsImporting(false);
      return;
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      let newIdentity: NostrIdentity | null = null;

      if (importKey.startsWith('nsec')) {
        newIdentity = await identityService.importFromNsec(
          importKey.trim(),
          displayName || undefined,
          passphrase,
        );
      } else {
        newIdentity = await identityService.importFromHex(
          importKey.trim(),
          displayName || undefined,
          passphrase,
        );
      }

      if (newIdentity) {
        setIdentity(newIdentity);
        onIdentityChange(newIdentity);
        setImportKey('');
        toastService.push({
          type: 'success',
          message: 'Identity imported',
          detail: 'Your key is now encrypted locally with your passphrase.',
          durationMs: UIConfig.TOAST_DURATION_MS,
        });
      } else {
        setError('Invalid key format. Use nsec1... or hex format.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import key');
      console.error('[IdentityManager] Import failed:', err);
    } finally {
      setIsImporting(false);
    }
  };

  const handleNip07Connect = async () => {
    setError(null);

    try {
      const pubkey = await identityService.getPublicKeyFromExtension();
      if (pubkey) {
        // Create a partial identity for extension users (no private key stored)
        const extensionIdentity: NostrIdentity = {
          kind: 'nip07',
          pubkey,
          npub: nip19.npubEncode(pubkey), // Properly bech32 encoded
          displayName: displayName || `ext_${pubkey.slice(0, 6)}`,
        };
        setIdentity(extensionIdentity);
        identityService.setSessionIdentity(extensionIdentity);
        onIdentityChange(extensionIdentity);
      }
    } catch (_err) {
      setError('Failed to connect to browser extension');
    }
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch (_err) {
      setError('Failed to copy to clipboard');
    }
  };

  const handleExportBackup = () => {
    const nsec = identityService.exportNsec();
    if (nsec && identity) {
      const backup = {
        nsec,
        npub: identity.npub,
        displayName: identity.displayName,
        exportedAt: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bitboard-identity-${identity.pubkey.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleLogout = () => {
    identityService.clearIdentity();
    identityService.setSessionIdentity(null);
    setIdentity(null);
    setIsConfirmingLogout(false);
    onIdentityChange(null);
  };

  const handleViewProfile = () => {
    if (!identity || !onViewProfile) return;

    const profileName = displayName.trim() || identity.displayName || identity.npub.slice(0, 12);
    onViewProfile(profileName, identity.pubkey);
  };

  const handleUpdateName = async () => {
    if (identity && displayName.trim()) {
      await identityService.setDisplayName(displayName.trim());
      const updated = { ...identity, displayName: displayName.trim() };
      setIdentity(updated);
      onIdentityChange(updated);
    }
  };

  return (
    <div className="ui-surface-editor max-w-xl overflow-hidden">
      <div className="flex items-center justify-between border-b border-terminal-dim/15 px-5 py-3">
        <h2 className="flex items-center gap-2 font-display text-2xl font-semibold text-terminal-text">
          <Key size={20} />
          {identity ? 'Identity Config' : 'Init Identity'}
        </h2>
        <button
          onClick={onClose}
          className="text-terminal-dim hover:text-terminal-text transition-colors"
        >
          ESC
        </button>
      </div>

      <div className="px-5 py-5">
        {error && (
          <div className="mb-4 flex items-center gap-2 border border-terminal-alert/40 bg-terminal-alert/10 p-3 text-sm text-terminal-alert">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {identity ? (
          // ========== IDENTITY EXISTS ==========
          <div className="space-y-6">
            {/* Status */}
            <div className="flex items-center justify-between gap-3 border border-terminal-dim/30 bg-terminal-dim/10 p-3 text-sm">
              <div className="flex items-center gap-2">
                <Wifi size={14} className="text-terminal-text" />
                <span className="text-terminal-dim">IDENTITY CONNECTED</span>
              </div>
              {onViewProfile && (
                <button
                  onClick={handleViewProfile}
                  className="ui-button-secondary flex items-center gap-2 px-3 py-1.5 text-xs text-terminal-text"
                >
                  <User size={12} />
                  VIEW PROFILE
                </button>
              )}
            </div>

            {/* Public Key */}
            <div className="space-y-2">
              <label className="text-xs text-terminal-dim uppercase font-bold">
                Public Key (npub)
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 border border-terminal-dim/20 bg-terminal-dim/10 p-2 text-xs font-mono break-all">
                  {identity.npub}
                </code>
                <button
                  onClick={() => handleCopy(identity.npub, 'npub')}
                  className="border border-terminal-dim/30 p-2 transition-colors hover:border-terminal-dim/60"
                >
                  {copied === 'npub' ? (
                    <CheckCircle size={16} className="text-terminal-text" />
                  ) : (
                    <Copy size={16} />
                  )}
                </button>
              </div>
            </div>

            {/* Private Key (hidden by default) */}
            {identity.kind === 'local' && (
              <div className="space-y-2">
                <label className="text-xs text-terminal-dim uppercase font-bold flex items-center gap-2">
                  Private Key (nsec)
                  <span className="inline-flex items-center gap-1 text-terminal-alert">
                    <AlertTriangle size={12} />
                    KEEP SECRET
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 border border-terminal-dim/20 bg-terminal-dim/10 p-2 text-xs font-mono break-all">
                    {showPrivateKey
                      ? identityService.exportNsec()
                      : '••••••••••••••••••••••••••••••••'}
                  </code>
                  <button
                    onClick={() => setShowPrivateKey(!showPrivateKey)}
                    className="border border-terminal-dim/30 p-2 text-xs transition-colors hover:border-terminal-dim/60"
                  >
                    {showPrivateKey ? 'HIDE' : 'SHOW'}
                  </button>
                  {showPrivateKey && (
                    <button
                      onClick={() => handleCopy(identityService.exportNsec() || '', 'nsec')}
                      className="border border-terminal-dim/30 p-2 transition-colors hover:border-terminal-dim/60"
                    >
                      {copied === 'nsec' ? (
                        <CheckCircle size={16} className="text-terminal-text" />
                      ) : (
                        <Copy size={16} />
                      )}
                    </button>
                  )}
                </div>
                {/* Storage security notice */}
                <div className="flex gap-2 p-2 border border-terminal-alert/40 bg-terminal-alert/5 text-2xs text-terminal-dim leading-relaxed">
                  <AlertTriangle size={12} className="text-terminal-alert shrink-0 mt-0.5" />
                  <span>
                    Your key is stored in browser localStorage — it is protected by the browser's
                    origin isolation but is accessible to any script running on this page. For
                    maximum security, use a{' '}
                    <span className="text-terminal-text">browser extension</span> (e.g. Alby or
                    nos2x) that keeps your key outside the page entirely.
                  </span>
                </div>
              </div>
            )}

            {/* Display Name */}
            <div className="space-y-2">
              <label className="text-xs text-terminal-dim uppercase font-bold">Display Name</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="ui-input flex-1 py-2"
                  placeholder="Anonymous"
                />
                <button
                  onClick={handleUpdateName}
                  className="ui-button-secondary px-4 py-2 text-sm"
                >
                  Update
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3 border-t border-terminal-dim/20 pt-4">
              <button
                onClick={handleExportBackup}
                className="ui-button-secondary flex items-center gap-2 px-4 py-2 text-sm"
              >
                <Download size={14} />
                Backup Key
              </button>
              <button
                onClick={() => setIsConfirmingLogout(true)}
                className="flex items-center gap-2 border border-terminal-alert/40 px-4 py-2 text-sm text-terminal-alert transition-colors hover:bg-terminal-alert hover:text-black"
              >
                <WifiOff size={14} />
                Logout
              </button>
            </div>

            {isConfirmingLogout && (
              <div className="space-y-3 border border-terminal-alert/40 bg-terminal-alert/10 p-4">
                <div className="flex items-start gap-2 text-terminal-alert">
                  <AlertTriangle size={16} className="mt-0.5" />
                  <div>
                    <p className="text-sm font-bold uppercase tracking-wide">
                      Disconnect identity?
                    </p>
                    <p className="mt-1 text-sm text-terminal-dim">
                      Your key will be removed from this browser session. Make sure you have a
                      backup before continuing.
                    </p>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setIsConfirmingLogout(false)}
                    className="ui-button-secondary px-3 py-2 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleLogout}
                    className="border border-terminal-alert/40 bg-terminal-alert px-3 py-2 text-xs uppercase tracking-[0.12em] text-black transition-colors hover:opacity-90"
                  >
                    Confirm Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          // ========== NO IDENTITY ==========
          <div className="space-y-6">
            {/* Info */}
            <div className="space-y-3 border border-terminal-dim/30 bg-terminal-dim/5 p-4 text-sm">
              <p className="text-terminal-dim leading-relaxed">
                Your identity on BitBoard is a{' '}
                <span className="text-terminal-text">Nostr keypair</span>. No email, no password, no
                server. Your private key is your password —{' '}
                <span className="text-terminal-alert">back it up and never share it</span>.
              </p>
              <div className="flex gap-2 pt-1 border-t border-terminal-dim/30 text-2xs text-terminal-dim leading-relaxed">
                <AlertTriangle size={12} className="text-terminal-alert shrink-0 mt-0.5" />
                <span>
                  Keys generated here are stored in browser localStorage. This is convenient but
                  means your key is accessible to scripts on this page. For stronger security, use a{' '}
                  <span className="text-terminal-text">Nostr browser extension</span> such as Alby
                  or nos2x — your key never leaves the extension.
                </span>
              </div>
            </div>

            {/* Display Name (optional) */}
            <div className="space-y-2">
              <label className="text-xs text-terminal-dim uppercase font-bold">
                Display Name (optional)
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="ui-input"
                placeholder="anon_xxxxxx"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-terminal-dim uppercase font-bold">
                Local passphrase (generate new identity)
              </label>
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                ref={generatePassphraseRef}
                className="ui-input"
                placeholder="Choose 12+ characters — not your nsec"
              />
              <input
                type="password"
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                className="ui-input"
                placeholder="Confirm passphrase"
              />
              <p className="text-2xs leading-relaxed text-terminal-dim">
                This is a password{' '}
                <span className="text-terminal-text">you invent for BitBoard</span> to encrypt your
                key in this browser. It is not sent anywhere and is not tied to other Nostr apps.
              </p>
            </div>

            {/* Generate New Key */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="ui-button-primary flex w-full items-center justify-center gap-2 px-6 py-4"
            >
              {isGenerating ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  Generating keypair...
                </>
              ) : (
                <>
                  <Key size={18} />
                  Generate New Identity
                </>
              )}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-4 text-terminal-dim text-xs">
              <div className="flex-1 border-t border-terminal-dim/30" />
              OR
              <div className="flex-1 border-t border-terminal-dim/30" />
            </div>

            {/* Import Key */}
            <div className="space-y-2">
              <label className="text-xs text-terminal-dim uppercase font-bold flex items-center gap-2">
                <Upload size={12} />
                Import Existing Key
              </label>
              <input
                type="password"
                value={importKey}
                onChange={(e) => setImportKey(e.target.value)}
                ref={importKeyRef}
                className="ui-input"
                placeholder="nsec1... or hex private key"
              />
              <div className="rounded border border-terminal-dim/40 bg-terminal-dim/5 p-3 text-2xs text-terminal-dim leading-relaxed">
                <p>
                  <span className="text-terminal-text font-semibold">
                    You are not missing a passphrase from another app.
                  </span>{' '}
                  Nostr keys are just nsec/hex. BitBoard needs a{' '}
                  <span className="text-terminal-text">new phrase you choose here</span> (12+
                  characters) to lock that key in this browser — same idea as a phone PIN for an
                  imported wallet.
                </p>
              </div>
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className="ui-input"
                placeholder="Create device passphrase (12+ characters)"
              />
              <input
                type="password"
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                className="ui-input"
                placeholder="Confirm device passphrase"
              />
              <p className="text-2xs leading-relaxed text-terminal-dim">
                Required after reload. Use a password manager if you like — BitBoard cannot reset
                it.
              </p>
              <button
                onClick={handleImport}
                disabled={isImporting || !importKey.trim()}
                className="ui-button-secondary flex w-full items-center justify-center gap-2 px-4 py-3 text-sm"
              >
                {isImporting ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Importing key...
                  </>
                ) : (
                  'Import Key'
                )}
              </button>
            </div>

            {/* NIP-07 Extension */}
            {hasNip07 && (
              <>
                <div className="flex items-center gap-4 text-terminal-dim text-xs">
                  <div className="flex-1 border-t border-terminal-dim/30" />
                  OR
                  <div className="flex-1 border-t border-terminal-dim/30" />
                </div>

                <button
                  onClick={handleNip07Connect}
                  className="ui-button-secondary flex w-full items-center justify-center gap-2 px-4 py-3 text-sm"
                >
                  <Wifi size={14} />
                  Connect Browser Extension
                </button>
                <p className="text-xs text-terminal-dim text-center">
                  Detected: Alby, nos2x, or compatible NIP-07 extension
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
