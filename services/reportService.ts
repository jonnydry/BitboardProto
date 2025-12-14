// ============================================
// REPORT SERVICE
// ============================================
// Handles content reporting (posts and comments)
// Supports both local storage and NIP-56 Nostr reports

import { nostrService } from './nostrService';
import { identityService } from './identityService';
import { ReportType, type NostrIdentity, type NostrEvent } from '../types';

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

// Map local ReportReason to NIP-56 ReportType
const REASON_TO_NIP56_TYPE: Record<ReportReason, ReportType> = {
  [ReportReason.SPAM]: ReportType.SPAM,
  [ReportReason.HARASSMENT]: ReportType.PROFANITY,  // Closest match
  [ReportReason.INAPPROPRIATE]: ReportType.NUDITY,  // Could be various things
  [ReportReason.MISINFORMATION]: ReportType.OTHER,  // No direct NIP-56 type
  [ReportReason.OTHER]: ReportType.OTHER,
};

export interface Report {
  id: string;
  targetType: 'post' | 'comment';
  targetId: string;
  reason: ReportReason;
  details?: string;
  reporterPubkey?: string;
  timestamp: number;
  nostrEventId?: string;  // If published to Nostr
}

export interface NostrReportInfo {
  eventId: string;
  reporterPubkey: string;
  reportType: string;
  timestamp: number;
  details?: string;
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

  // ----------------------------------------
  // NOSTR NIP-56 INTEGRATION
  // ----------------------------------------

  /**
   * Publish a report to Nostr relays (NIP-56)
   */
  async publishToNostr(
    targetEventId: string,
    targetPubkey: string,
    reason: ReportReason,
    identity: NostrIdentity,
    details?: string
  ): Promise<NostrEvent | null> {
    try {
      const reportType = REASON_TO_NIP56_TYPE[reason];
      
      const unsigned = nostrService.buildReportEvent({
        targetEventId,
        targetPubkey,
        reportType,
        pubkey: identity.pubkey,
        details,
      });

      const signed = await identityService.signEvent(unsigned);
      const event = await nostrService.publishSignedEvent(signed);

      console.log(`[Reports] Published NIP-56 report to Nostr: ${event.id}`);
      return event;
    } catch (error) {
      console.error('[Reports] Failed to publish to Nostr:', error);
      return null;
    }
  }

  /**
   * Submit a report and optionally publish to Nostr
   */
  async submitReportWithNostr(
    targetType: 'post' | 'comment',
    targetId: string,
    targetPubkey: string,
    reason: ReportReason,
    identity?: NostrIdentity,
    details?: string
  ): Promise<{ report: Report; nostrEvent?: NostrEvent }> {
    // First, save locally
    const report = this.submitReport(
      targetType,
      targetId,
      reason,
      details,
      identity?.pubkey
    );

    // If identity exists, also publish to Nostr
    let nostrEvent: NostrEvent | undefined;
    if (identity) {
      const event = await this.publishToNostr(
        targetId,
        targetPubkey,
        reason,
        identity,
        details
      );

      if (event) {
        nostrEvent = event;
        // Update the local report with Nostr event ID
        const key = this.getKey(targetType, targetId);
        const existingReport = this.reports.get(key);
        if (existingReport) {
          existingReport.nostrEventId = event.id;
          this.saveToStorage();
        }
      }
    }

    return { report, nostrEvent };
  }

  /**
   * Fetch reports for a target from Nostr
   */
  async fetchNostrReports(eventId: string): Promise<NostrReportInfo[]> {
    try {
      const events = await nostrService.fetchReportsForEvent(eventId);
      
      return events.map(event => {
        // Extract report type from e tag
        const eTag = event.tags.find(t => t[0] === 'e' && t[1] === eventId);
        const reportType = eTag?.[3] || 'other';

        return {
          eventId: event.id,
          reporterPubkey: event.pubkey,
          reportType,
          timestamp: event.created_at * 1000,
          details: event.content || undefined,
        };
      });
    } catch (error) {
      console.error('[Reports] Failed to fetch from Nostr:', error);
      return [];
    }
  }

  /**
   * Get count of unique reporters for an event
   */
  async getNostrReportCount(eventId: string): Promise<number> {
    const reports = await this.fetchNostrReports(eventId);
    const uniqueReporters = new Set(reports.map(r => r.reporterPubkey));
    return uniqueReporters.size;
  }
}

export const reportService = new ReportService();
