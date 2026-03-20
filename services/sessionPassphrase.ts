/**
 * Optional passphrase cache for the current browser tab only (sessionStorage).
 * Survives refresh in this tab; cleared when the tab closes or on logout.
 * XSS on the origin could read this — only used when the user opts in.
 */
const SESSION_PASSPHRASE_KEY = 'bitboard_session_passphrase_v1';

export function readSessionPassphrase(): string | null {
  try {
    return sessionStorage.getItem(SESSION_PASSPHRASE_KEY);
  } catch {
    return null;
  }
}

export function writeSessionPassphrase(passphrase: string): void {
  try {
    sessionStorage.setItem(SESSION_PASSPHRASE_KEY, passphrase);
  } catch {
    // Private mode / quota
  }
}

export function clearSessionPassphrase(): void {
  try {
    sessionStorage.removeItem(SESSION_PASSPHRASE_KEY);
  } catch {
    // ignore
  }
}
