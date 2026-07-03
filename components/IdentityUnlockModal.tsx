import React from 'react';

export interface IdentityUnlockModalProps {
  isMigration: boolean;
  passphrase: string;
  confirmPassphrase: string;
  error: string | null;
  isSubmitting: boolean;
  rememberSession: boolean;
  onPassphraseChange: (value: string) => void;
  onConfirmPassphraseChange: (value: string) => void;
  onRememberSessionChange: (value: boolean) => void;
  onSubmit: () => void;
  onReset: () => void;
}

/**
 * Modal shown when the local identity is locked or migrating to the new
 * passphrase-encryption scheme. Owns the unlock / migrate form only; the
 * parent owns state and side effects (see App.tsx `handleIdentityUnlock`).
 */
export const IdentityUnlockModal: React.FC<IdentityUnlockModalProps> = (props) => (
  <div className="ui-overlay z-[110] flex items-center justify-center px-4 font-mono text-terminal-text">
    <div className="ui-surface-modal max-w-md p-6">
      <h2 className="font-display text-2xl font-semibold text-terminal-text">
        {props.isMigration ? 'Secure Your Identity' : 'Unlock Identity'}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-terminal-dim">
        {props.isMigration
          ? 'BitBoard no longer stores the unlock key in localStorage. Set a passphrase to re-encrypt your existing identity securely.'
          : 'Enter your identity passphrase to decrypt your stored keypair on this device.'}
      </p>

      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!props.isSubmitting) props.onSubmit();
        }}
      >
        <input
          type="password"
          value={props.passphrase}
          onChange={(e) => props.onPassphraseChange(e.target.value)}
          autoComplete="current-password"
          className="ui-input"
          placeholder={props.isMigration ? 'Create a passphrase' : 'Enter passphrase'}
        />

        {props.isMigration && (
          <input
            type="password"
            value={props.confirmPassphrase}
            onChange={(e) => props.onConfirmPassphraseChange(e.target.value)}
            autoComplete="new-password"
            className="ui-input"
            placeholder="Repeat passphrase"
          />
        )}

        <label className="flex items-start gap-2 cursor-pointer text-xs leading-snug text-terminal-dim">
          <input
            type="checkbox"
            checked={props.rememberSession}
            onChange={(e) => props.onRememberSessionChange(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-sm border border-terminal-dim bg-terminal-bg accent-terminal-text"
          />
          <span>
            Remember for this browser tab — skip unlock after refresh until you close the tab or
            reset identity (passphrase stored in session only, not on disk).
          </span>
        </label>

        <div className="border border-terminal-alert/40 bg-terminal-alert/5 p-3 text-xs leading-relaxed text-terminal-dim font-mono">
          If you forget this passphrase, BitBoard cannot recover your locally stored private key.
        </div>

        {props.error && (
          <div className="border border-terminal-alert/40 bg-terminal-alert/5 p-3 text-sm text-terminal-alert font-mono">
            {props.error}
          </div>
        )}

        <button
          type="submit"
          disabled={props.isSubmitting}
          className="ui-button-primary w-full py-3 disabled:opacity-60"
        >
          {props.isSubmitting
            ? props.isMigration
              ? 'Securing...'
              : 'Unlocking...'
            : props.isMigration
              ? 'Secure Identity'
              : 'Unlock Identity'}
        </button>

        <button
          type="button"
          onClick={props.onReset}
          disabled={props.isSubmitting}
          className="ui-button-secondary w-full py-3 text-xs hover:border-terminal-alert hover:text-terminal-alert disabled:opacity-60"
        >
          Reset Local Identity
        </button>
      </form>
    </div>
  </div>
);
