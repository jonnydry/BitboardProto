import React, { useState, useEffect } from 'react';
import { Key, Copy, Download, Upload, RefreshCw, CheckCircle, AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { identityService } from '../services/identityService';
import type { NostrIdentity } from '../types';

interface IdentityManagerProps {
  onIdentityChange: (identity: NostrIdentity | null) => void;
  onClose: () => void;
}

export const IdentityManager: React.FC<IdentityManagerProps> = ({ onIdentityChange, onClose }) => {
  const [identity, setIdentity] = useState<NostrIdentity | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [importKey, setImportKey] = useState('');
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasNip07, setHasNip07] = useState(false);

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

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    
    try {
      // Small delay for UX feedback
      await new Promise(resolve => setTimeout(resolve, 300));
      const newIdentity = await identityService.generateIdentity(displayName || undefined);
      setIdentity(newIdentity);
      onIdentityChange(newIdentity);
    } catch (err) {
      setError('Failed to generate identity');
      console.error('[IdentityManager] Generate failed:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImport = async () => {
    setError(null);
    
    if (!importKey.trim()) {
      setError('Please enter your nsec or hex private key');
      return;
    }

    try {
      let newIdentity: NostrIdentity | null = null;

      if (importKey.startsWith('nsec')) {
        newIdentity = await identityService.importFromNsec(importKey.trim(), displayName || undefined);
      } else {
        newIdentity = await identityService.importFromHex(importKey.trim(), displayName || undefined);
      }

      if (newIdentity) {
        setIdentity(newIdentity);
        onIdentityChange(newIdentity);
        setImportKey('');
      } else {
        setError('Invalid key format. Use nsec1... or hex format.');
      }
    } catch (err) {
      setError('Failed to import key');
      console.error('[IdentityManager] Import failed:', err);
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
    onIdentityChange(null);
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
    <div className="border-2 border-terminal-text bg-terminal-bg p-6 max-w-xl mx-auto w-full shadow-hard-lg animate-fade-in">
      <div className="flex items-center justify-between mb-6 border-b border-terminal-dim pb-2">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Key size={20} />
          {identity ? 'IDENTITY_CONFIG' : 'INIT_IDENTITY'}
        </h2>
        <button 
          onClick={onClose}
          className="text-terminal-dim hover:text-terminal-text transition-colors"
        >
          [ ESC ]
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 border border-terminal-alert bg-terminal-alert/10 text-terminal-alert flex items-center gap-2 text-sm">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {identity ? (
        // ========== IDENTITY EXISTS ==========
        <div className="space-y-6">
          {/* Status */}
          <div className="flex items-center gap-2 text-sm">
            <Wifi size={14} className="text-green-500" />
            <span className="text-terminal-dim">CONNECTED_TO_NOSTR</span>
          </div>

          {/* Public Key */}
          <div className="space-y-2">
            <label className="text-xs text-terminal-dim uppercase font-bold">Public Key (npub)</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-terminal-dim/20 p-2 text-xs font-mono break-all">
                {identity.npub}
              </code>
              <button
                onClick={() => handleCopy(identity.npub, 'npub')}
                className="p-2 border border-terminal-dim hover:border-terminal-text transition-colors"
              >
                {copied === 'npub' ? <CheckCircle size={16} className="text-green-500" /> : <Copy size={16} />}
              </button>
            </div>
          </div>

          {/* Private Key (hidden by default) */}
          {identity.kind === 'local' && (
            <div className="space-y-2">
              <label className="text-xs text-terminal-dim uppercase font-bold flex items-center gap-2">
                Private Key (nsec) 
                <span className="text-terminal-alert">⚠ KEEP SECRET</span>
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-terminal-dim/20 p-2 text-xs font-mono break-all">
                  {showPrivateKey ? identityService.exportNsec() : '••••••••••••••••••••••••••••••••'}
                </code>
                <button
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                  className="p-2 border border-terminal-dim hover:border-terminal-text transition-colors text-xs"
                >
                  {showPrivateKey ? 'HIDE' : 'SHOW'}
                </button>
                {showPrivateKey && (
                  <button
                    onClick={() => handleCopy(identityService.exportNsec() || '', 'nsec')}
                    className="p-2 border border-terminal-dim hover:border-terminal-text transition-colors"
                  >
                    {copied === 'nsec' ? <CheckCircle size={16} className="text-green-500" /> : <Copy size={16} />}
                  </button>
                )}
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
                className="flex-1 bg-terminal-bg border border-terminal-dim p-2 text-terminal-text font-mono focus:outline-none focus:border-terminal-text"
                placeholder="Anonymous"
              />
              <button
                onClick={handleUpdateName}
                className="px-4 py-2 border border-terminal-dim hover:border-terminal-text transition-colors text-sm"
              >
                UPDATE
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3 pt-4 border-t border-terminal-dim/30">
            <button
              onClick={handleExportBackup}
              className="flex items-center gap-2 px-4 py-2 border border-terminal-dim hover:border-terminal-text transition-colors text-sm"
            >
              <Download size={14} />
              BACKUP_KEY
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 border border-terminal-alert text-terminal-alert hover:bg-terminal-alert hover:text-black transition-colors text-sm"
            >
              <WifiOff size={14} />
              LOGOUT
            </button>
          </div>
        </div>
      ) : (
        // ========== NO IDENTITY ==========
        <div className="space-y-6">
          {/* Info */}
          <div className="p-4 border border-terminal-dim/50 bg-terminal-dim/5 text-sm">
            <p className="text-terminal-dim leading-relaxed">
              Your identity on BitBoard is a <span className="text-terminal-text">Nostr keypair</span>. 
              No email, no password, no server. Your private key is your password - 
              <span className="text-terminal-alert"> back it up and never share it</span>.
            </p>
          </div>

          {/* Display Name (optional) */}
          <div className="space-y-2">
            <label className="text-xs text-terminal-dim uppercase font-bold">Display Name (optional)</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-terminal-bg border border-terminal-dim p-3 text-terminal-text font-mono focus:outline-none focus:border-terminal-text"
              placeholder="anon_xxxxxx"
            />
          </div>

          {/* Generate New Key */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full bg-terminal-text text-black font-bold px-6 py-4 hover:bg-terminal-dim hover:text-white transition-colors uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                GENERATING_KEYPAIR...
              </>
            ) : (
              <>
                <Key size={18} />
                GENERATE_NEW_IDENTITY
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
              className="w-full bg-terminal-bg border border-terminal-dim p-3 text-terminal-text font-mono focus:outline-none focus:border-terminal-text"
              placeholder="nsec1... or hex private key"
            />
            <button
              onClick={handleImport}
              className="w-full px-4 py-3 border border-terminal-dim hover:border-terminal-text hover:bg-terminal-dim/10 transition-colors text-sm uppercase"
            >
              IMPORT_KEY
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
                className="w-full px-4 py-3 border border-terminal-dim hover:border-terminal-text hover:bg-terminal-dim/10 transition-colors text-sm uppercase flex items-center justify-center gap-2"
              >
                <Wifi size={14} />
                CONNECT_BROWSER_EXTENSION
              </button>
              <p className="text-xs text-terminal-dim text-center">
                Detected: Alby, nos2x, or compatible NIP-07 extension
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

