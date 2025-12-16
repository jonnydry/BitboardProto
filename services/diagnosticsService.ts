// ============================================
// DIAGNOSTICS SERVICE (Local-only monitoring)
// ============================================
// Stores recent errors/warnings/info for debugging.
// No external telemetry is sent.

export type DiagnosticLevel = 'info' | 'warn' | 'error';

export type DiagnosticEvent = {
  id: string;
  at: number; // ms
  level: DiagnosticLevel;
  source: string;
  message: string;
  detail?: string;
};

const STORAGE_KEY = 'bitboard_diagnostics_v1';
const MAX_EVENTS = 250;

class DiagnosticsService {
  private events: DiagnosticEvent[] = [];
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.events = this.loadFromStorage();
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getEvents(): DiagnosticEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
    this.saveToStorage();
    this.notify();
  }

  log(level: DiagnosticLevel, source: string, message: string, detail?: string): DiagnosticEvent {
    const ev: DiagnosticEvent = {
      id: `diag-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      at: Date.now(),
      level,
      source,
      message,
      detail,
    };

    this.events = [...this.events, ev].slice(-MAX_EVENTS);
    this.saveToStorage();
    this.notify();
    return ev;
  }

  info(source: string, message: string, detail?: string) {
    return this.log('info', source, message, detail);
  }

  warn(source: string, message: string, detail?: string) {
    return this.log('warn', source, message, detail);
  }

  error(source: string, message: string, detail?: string) {
    return this.log('error', source, message, detail);
  }

  private loadFromStorage(): DiagnosticEvent[] {
    try {
      if (typeof localStorage === 'undefined') return [];
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((e: any) => e && typeof e.id === 'string' && typeof e.at === 'number');
    } catch {
      return [];
    }
  }

  private saveToStorage(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.events));
    } catch {
      // ignore quota / serialization errors
    }
  }
}

export const diagnosticsService = new DiagnosticsService();




