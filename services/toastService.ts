// ============================================
// TOAST SERVICE
// ============================================
// Minimal global notification bus (no external deps)
import { diagnosticsService } from './diagnosticsService';

export type ToastType = 'info' | 'success' | 'error';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  detail?: string;
  createdAt: number;
  durationMs: number;
  dedupeKey?: string;
}

class ToastService {
  private toasts: Toast[] = [];
  private listeners: Set<() => void> = new Set();
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  // Basic dedupe window (ms)
  private readonly DEDUPE_WINDOW_MS = 1500;

  getToasts(): Toast[] {
    return [...this.toasts];
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }

  private generateId(): string {
    return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  push(partial: Omit<Toast, 'id' | 'createdAt'>): Toast {
    const now = Date.now();

    if (partial.dedupeKey) {
      const recent = this.toasts.find(
        (t) => t.dedupeKey === partial.dedupeKey && now - t.createdAt < this.DEDUPE_WINDOW_MS
      );
      if (recent) {
        return recent;
      }
    }

    const toast: Toast = {
      id: this.generateId(),
      createdAt: now,
      ...partial,
    };

    this.toasts = [...this.toasts, toast];
    this.notify();

    // Local-only diagnostics log for errors (no external telemetry)
    if (toast.type === 'error') {
      diagnosticsService.error('toast', toast.message, toast.detail);
    }

    const timer = setTimeout(() => {
      this.dismiss(toast.id);
    }, toast.durationMs);
    this.timers.set(toast.id, timer);

    return toast;
  }

  dismiss(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }

    const next = this.toasts.filter((t) => t.id !== id);
    if (next.length === this.toasts.length) return;

    this.toasts = next;
    this.notify();
  }

  clearAll(): void {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
    this.toasts = [];
    this.notify();
  }
}

export const toastService = new ToastService();
