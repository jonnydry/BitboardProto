/**
 * Keyboard Shortcuts Service for BitBoard
 *
 * Provides keyboard navigation and shortcuts for power users.
 */

import { logger } from './loggingService';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  description: string;
  action: () => void;
  category: 'navigation' | 'actions' | 'editing' | 'general';
}

class KeyboardShortcutsService {
  private shortcuts: Map<string, KeyboardShortcut> = new Map();
  private enabled = true;
  private helpModalOpen = false;

  /**
   * Initialize keyboard shortcuts
   */
  initialize(): void {
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    logger.info('KeyboardShortcuts', 'Keyboard shortcuts initialized');
  }

  /**
   * Register a keyboard shortcut
   */
  register(shortcut: KeyboardShortcut): void {
    const key = this.getShortcutKey(shortcut);
    this.shortcuts.set(key, shortcut);
    logger.debug('KeyboardShortcuts', `Registered shortcut: ${key}`);
  }

  /**
   * Unregister a keyboard shortcut
   */
  unregister(shortcut: Partial<KeyboardShortcut>): void {
    const key = this.getShortcutKey(shortcut as KeyboardShortcut);
    this.shortcuts.delete(key);
  }

  /**
   * Get shortcut key string
   */
  private getShortcutKey(shortcut: KeyboardShortcut): string {
    const parts: string[] = [];
    if (shortcut.ctrl) parts.push('ctrl');
    if (shortcut.shift) parts.push('shift');
    if (shortcut.alt) parts.push('alt');
    if (shortcut.meta) parts.push('meta');
    parts.push(shortcut.key.toLowerCase());
    return parts.join('+');
  }

  /**
   * Handle keyboard events
   */
  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.enabled) return;

    // Ignore if user is typing in an input field
    const target = event.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      // Exception: allow Escape to work in input fields
      if (event.key !== 'Escape') {
        return;
      }
    }

    const key = this.getShortcutKey({
      key: event.key,
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      alt: event.altKey,
      meta: event.metaKey,
    } as KeyboardShortcut);

    const shortcut = this.shortcuts.get(key);

    if (shortcut) {
      event.preventDefault();
      event.stopPropagation();

      logger.debug('KeyboardShortcuts', `Executing shortcut: ${key}`);
      shortcut.action();
    }
  }

  /**
   * Enable keyboard shortcuts
   */
  enable(): void {
    this.enabled = true;
    logger.info('KeyboardShortcuts', 'Keyboard shortcuts enabled');
  }

  /**
   * Disable keyboard shortcuts
   */
  disable(): void {
    this.enabled = false;
    logger.info('KeyboardShortcuts', 'Keyboard shortcuts disabled');
  }

  /**
   * Toggle keyboard shortcuts
   */
  toggle(): void {
    this.enabled = !this.enabled;
    logger.info('KeyboardShortcuts', `Keyboard shortcuts ${this.enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get all shortcuts grouped by category
   */
  getAllShortcuts(): Record<string, KeyboardShortcut[]> {
    const grouped: Record<string, KeyboardShortcut[]> = {
      navigation: [],
      actions: [],
      editing: [],
      general: [],
    };

    this.shortcuts.forEach((shortcut) => {
      grouped[shortcut.category].push(shortcut);
    });

    return grouped;
  }

  /**
   * Get shortcut display string (e.g., "Ctrl+K")
   */
  getShortcutDisplay(shortcut: KeyboardShortcut): string {
    const parts: string[] = [];

    // Use appropriate modifier key names for the platform
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

    if (shortcut.ctrl) parts.push(isMac ? '⌃' : 'Ctrl');
    if (shortcut.shift) parts.push(isMac ? '⇧' : 'Shift');
    if (shortcut.alt) parts.push(isMac ? '⌥' : 'Alt');
    if (shortcut.meta) parts.push(isMac ? '⌘' : 'Win');

    // Format key name
    const keyName = shortcut.key.length === 1
      ? shortcut.key.toUpperCase()
      : shortcut.key.charAt(0).toUpperCase() + shortcut.key.slice(1);

    parts.push(keyName);

    return parts.join(isMac ? '' : '+');
  }

  /**
   * Set help modal state
   */
  setHelpModalOpen(open: boolean): void {
    this.helpModalOpen = open;
  }

  /**
   * Check if help modal is open
   */
  isHelpModalOpen(): boolean {
    return this.helpModalOpen;
  }

  /**
   * Clean up event listeners
   */
  destroy(): void {
    document.removeEventListener('keydown', this.handleKeyDown.bind(this));
    this.shortcuts.clear();
    logger.info('KeyboardShortcuts', 'Keyboard shortcuts destroyed');
  }
}

// Export singleton instance
export const keyboardShortcutsService = new KeyboardShortcutsService();

// Default shortcuts configuration
export const defaultShortcuts: Omit<KeyboardShortcut, 'action'>[] = [
  // Navigation
  { key: 'g', description: 'Go to feed', category: 'navigation' },
  { key: 'c', description: 'Create new post', category: 'navigation' },
  { key: 'b', description: 'Browse boards', category: 'navigation' },
  { key: 's', description: 'Search', category: 'navigation' },
  { key: 'p', description: 'Go to profile', category: 'navigation' },
  { key: '/', description: 'Focus search', category: 'navigation' },
  { key: 'Escape', description: 'Close modal/dialog', category: 'navigation' },

  // Actions
  { key: 'r', description: 'Refresh feed', category: 'actions' },
  { key: 'n', description: 'Toggle notifications', category: 'actions' },
  { key: 'k', ctrl: true, description: 'Toggle command palette', category: 'actions' },

  // General
  { key: '?', shift: true, description: 'Show keyboard shortcuts', category: 'general' },
  { key: ',', description: 'Open settings', category: 'general' },
];
