/**
 * Keyboard Shortcuts Help Modal
 *
 * Displays all available keyboard shortcuts in a modal dialog.
 */

import { X } from 'lucide-react';
import {
  keyboardShortcutsService,
  type KeyboardShortcut,
} from '../services/keyboardShortcutsService';

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsHelp({ isOpen, onClose }: KeyboardShortcutsHelpProps) {
  if (!isOpen) return null;

  const shortcuts = keyboardShortcutsService.getAllShortcuts();

  const categories = [
    { key: 'navigation', label: 'Navigation' },
    { key: 'actions', label: 'Actions' },
    { key: 'editing', label: 'Editing' },
    { key: 'general', label: 'General' },
  ] as const;

  return (
    <div
      className="ui-overlay flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
    >
      <div
        className="ui-surface-modal relative max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6 shadow-glow"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-6 flex items-center justify-between border-b border-terminal-dim pb-4">
          <h2
            id="shortcuts-title"
            className="font-display text-3xl font-semibold text-terminal-text"
          >
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="text-terminal-dim hover:text-terminal-text"
            aria-label="Close keyboard shortcuts help"
          >
            <X size={24} />
          </button>
        </div>

        {/* Shortcuts by category */}
        <div className="space-y-6">
          {categories.map((category) => {
            const categoryShortcuts = shortcuts[category.key] || [];

            if (categoryShortcuts.length === 0) return null;

            return (
              <div key={category.key}>
                <h3 className="mb-3 font-mono text-lg uppercase tracking-[0.12em] text-terminal-dim">
                  {category.label}
                </h3>
                <div className="space-y-2">
                  {categoryShortcuts.map((shortcut: KeyboardShortcut, index: number) => (
                    <div
                      key={index}
                      className="flex items-center justify-between border-l-2 border-terminal-dim pl-4 py-2 hover:border-terminal-highlight hover:bg-terminal-dim/20"
                    >
                      <span className="font-mono text-terminal-text">{shortcut.description}</span>
                      <kbd className="rounded-sm border border-terminal-dim/30 bg-terminal-bg/70 px-2 py-1 font-mono text-sm text-terminal-text">
                        {keyboardShortcutsService.getShortcutDisplay(shortcut)}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-6 border-t border-terminal-dim pt-4 text-center">
          <p className="text-sm text-terminal-dim font-mono">
            Press{' '}
            <kbd className="rounded-sm border border-terminal-dim/30 bg-terminal-bg/70 px-2 py-1">
              ?
            </kbd>{' '}
            to toggle this help
          </p>
        </div>
      </div>
    </div>
  );
}
