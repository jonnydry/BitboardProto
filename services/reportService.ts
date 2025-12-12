// ============================================
// REPORT SERVICE
// ============================================
// Handles content reporting (posts and comments)

export enum ReportReason {
  SPAM = 'spam',
  HARASSMENT = 'harassment',
  INAPPROPRIATE = 'inappropriate',
  MISINFORMATION = 'misinformation',
  OTHER = 'other',
}

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  [ReportReason.SPAM]: 'Spam or advertising',
  [ReportReason.HARASSMENT]: 'Harassment or abuse',
  [ReportReason.INAPPROPRIATE]: 'Inappropriate content',
  [ReportReason.MISINFORMATION]: 'Misinformation',
  [ReportReason.OTHER]: 'Other',
};

export interface Report {
  id: string;
  targetType: 'post' | 'comment';
  targetId: string;
  reason: ReportReason;
  details?: string;
  reporterPubkey?: string;
  timestamp: number;
}

const STORAGE_KEY = 'bitboard_reports';

class ReportService {
  private reports: Map<string, Report> = new Map();
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const reports: Report[] = JSON.parse(stored);
        reports.forEach(report => {
          // Use composite key: targetType-targetId
          const key = this.getKey(report.targetType, report.targetId);
          this.reports.set(key, report);
        });
      }
    } catch (error) {
      console.error('[Reports] Failed to load:', error);
    }
  }

  private saveToStorage(): void {
    try {
      const reports = Array.from(this.reports.values());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
    } catch (error) {
      console.error('[Reports] Failed to save:', error);
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }

  private getKey(targetType: 'post' | 'comment', targetId: string): string {
    return `${targetType}-${targetId}`;
  }

  private generateId(): string {
    return `report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if a target has been reported by the current user
   */
  hasReported(targetType: 'post' | 'comment', targetId: string): boolean {
    const key = this.getKey(targetType, targetId);
    return this.reports.has(key);
  }

  /**
   * Get report for a target if it exists
   */
  getReport(targetType: 'post' | 'comment', targetId: string): Report | undefined {
    const key = this.getKey(targetType, targetId);
    return this.reports.get(key);
  }

  /**
   * Submit a report
   */
  submitReport(
    targetType: 'post' | 'comment',
    targetId: string,
    reason: ReportReason,
    details?: string,
    reporterPubkey?: string
  ): Report {
    const key = this.getKey(targetType, targetId);
    
    const report: Report = {
      id: this.generateId(),
      targetType,
      targetId,
      reason,
      details: details?.trim() || undefined,
      reporterPubkey,
      timestamp: Date.now(),
    };

    this.reports.set(key, report);
    this.saveToStorage();
    this.notifyListeners();

    console.log(`[Reports] Submitted report for ${targetType} ${targetId}:`, reason);
    
    return report;
  }

  /**
   * Remove a report (undo)
   */
  removeReport(targetType: 'post' | 'comment', targetId: string): void {
    const key = this.getKey(targetType, targetId);
    if (this.reports.has(key)) {
      this.reports.delete(key);
      this.saveToStorage();
      this.notifyListeners();
    }
  }

  /**
   * Get all reports
   */
  getAllReports(): Report[] {
    return Array.from(this.reports.values());
  }

  /**
   * Get reports by type
   */
  getReportsByType(targetType: 'post' | 'comment'): Report[] {
    return Array.from(this.reports.values()).filter(r => r.targetType === targetType);
  }

  /**
   * Get report count
   */
  getCount(): number {
    return this.reports.size;
  }

  /**
   * Subscribe to report changes
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Clear all reports
   */
  clearAll(): void {
    this.reports.clear();
    this.saveToStorage();
    this.notifyListeners();
  }
}

export const reportService = new ReportService();
