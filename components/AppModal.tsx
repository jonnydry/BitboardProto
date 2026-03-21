import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface AppModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  frameClassName?: string;
  labelledBy?: string;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

export function AppModal({
  isOpen,
  onClose,
  children,
  className = 'items-start justify-center px-4 py-6 sm:py-10',
  contentClassName = 'ui-modal-pop w-full max-h-[calc(100dvh-2rem)] max-w-4xl overflow-auto hide-scrollbar',
  frameClassName = 'ui-modal-frame',
  labelledBy,
  initialFocusRef,
}: AppModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTarget = initialFocusRef?.current;
    if (focusTarget) {
      focusTarget.focus();
    } else {
      containerRef.current?.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !containerRef.current) return;

      const focusable = Array.from(
        containerRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ) as HTMLElement[];

      if (!focusable.length) {
        event.preventDefault();
        containerRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement as HTMLElement | null;

      if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [initialFocusRef, isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`ui-overlay z-[100] flex motion-safe:animate-fade-in ${className}`}
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={frameClassName}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={contentClassName}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
