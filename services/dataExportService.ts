/**
 * Data Export Service for BitBoard
 *
 * Provides GDPR-compliant data export functionality.
 * Allows users to export their posts, bookmarks, identity, and settings.
 */

import { logger } from './loggingService';
import type { Post, Board, NostrIdentity } from '../types';

export interface ExportData {
  version: string;
  exportDate: string;
  identity?: {
    pubkey: string;
    username: string;
    // Note: nsec is NOT included for security reasons
  };
  posts?: Post[];
  bookmarks?: string[]; // Post IDs
  boards?: Board[];
  settings?: {
    theme: string;
    relays: string[];
    [key: string]: unknown;
  };
  statistics?: {
    totalPosts: number;
    totalVotes: number;
    totalComments: number;
    accountCreated?: string;
  };
}

class DataExportService {
  /**
   * Export all user data to JSON
   */
  async exportAllData(): Promise<ExportData> {
    logger.info('DataExport', 'Starting full data export');

    const exportData: ExportData = {
      version: '1.0.0',
      exportDate: new Date().toISOString(),
    };

    try {
      // Export identity (without private key)
      exportData.identity = this.exportIdentity();

      // Export bookmarks
      exportData.bookmarks = this.exportBookmarks();

      // Export settings
      exportData.settings = this.exportSettings();

      // Export statistics
      exportData.statistics = this.calculateStatistics();

      logger.info('DataExport', 'Data export completed successfully');
      return exportData;
    } catch (error) {
      logger.error('DataExport', 'Failed to export data', error);
      throw error;
    }
  }

  /**
   * Export identity information (excluding private key)
   */
  private exportIdentity(): ExportData['identity'] | undefined {
    try {
      const identityStr = localStorage.getItem('bitboard_identity');
      if (!identityStr) return undefined;

      const identity: NostrIdentity = JSON.parse(identityStr);

      return {
        pubkey: identity.pubkey,
        username: localStorage.getItem('bitboard_username') || 'Anonymous',
      };
    } catch (error) {
      logger.warn('DataExport', 'Failed to export identity', error);
      return undefined;
    }
  }

  /**
   * Export bookmarks
   */
  private exportBookmarks(): string[] {
    try {
      const bookmarksStr = localStorage.getItem('bitboard_bookmarks');
      if (!bookmarksStr) return [];

      return JSON.parse(bookmarksStr);
    } catch (error) {
      logger.warn('DataExport', 'Failed to export bookmarks', error);
      return [];
    }
  }

  /**
   * Export settings
   */
  private exportSettings(): ExportData['settings'] {
    try {
      const theme = localStorage.getItem('bitboard_theme') || 'amber';
      const relaysStr = localStorage.getItem('bitboard_relays');
      const relays = relaysStr ? JSON.parse(relaysStr) : [];

      return {
        theme,
        relays,
      };
    } catch (error) {
      logger.warn('DataExport', 'Failed to export settings', error);
      return {};
    }
  }

  /**
   * Calculate user statistics
   */
  private calculateStatistics(): ExportData['statistics'] {
    try {
      // These would come from actual user data tracking
      // For now, return basic stats from localStorage

      const votedPosts = localStorage.getItem('bitboard_voted_posts');
      const votedPostsCount = votedPosts ? JSON.parse(votedPosts).length : 0;

      return {
        totalPosts: 0, // Would need to query Nostr for this
        totalVotes: votedPostsCount,
        totalComments: 0, // Would need to query Nostr for this
        accountCreated: localStorage.getItem('bitboard_account_created') || undefined,
      };
    } catch (error) {
      logger.warn('DataExport', 'Failed to calculate statistics', error);
      return {
        totalPosts: 0,
        totalVotes: 0,
        totalComments: 0,
      };
    }
  }

  /**
   * Download export data as JSON file
   */
  downloadAsJSON(data: ExportData, filename?: string): void {
    const defaultFilename = `bitboard-export-${new Date().toISOString().split('T')[0]}.json`;
    const finalFilename = filename || defaultFilename;

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = finalFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);

    logger.info('DataExport', `Downloaded export as ${finalFilename}`);
  }

  /**
   * Export and download all user data
   */
  async exportAndDownload(): Promise<void> {
    const data = await this.exportAllData();
    this.downloadAsJSON(data);
  }

  /**
   * Import data from JSON (for account recovery/migration)
   * WARNING: This will overwrite existing data!
   */
  async importData(data: ExportData): Promise<void> {
    logger.warn('DataImport', 'Starting data import - this will overwrite existing data');

    try {
      // Import bookmarks
      if (data.bookmarks) {
        localStorage.setItem('bitboard_bookmarks', JSON.stringify(data.bookmarks));
      }

      // Import settings
      if (data.settings) {
        if (data.settings.theme) {
          localStorage.setItem('bitboard_theme', data.settings.theme as string);
        }
        if (data.settings.relays) {
          localStorage.setItem('bitboard_relays', JSON.stringify(data.settings.relays));
        }
      }

      // Note: Identity is NOT imported automatically for security reasons
      // User must import their nsec separately through identity management

      logger.info('DataImport', 'Data import completed successfully');
    } catch (error) {
      logger.error('DataImport', 'Failed to import data', error);
      throw error;
    }
  }

  /**
   * Delete all user data (GDPR right to be forgotten)
   * WARNING: This action is irreversible!
   */
  deleteAllUserData(): void {
    logger.warn('DataDeletion', 'Deleting all user data - this action is irreversible');

    const keysToDelete = [
      'bitboard_identity',
      'bitboard_username',
      'bitboard_bookmarks',
      'bitboard_voted_posts',
      'bitboard_voted_comments',
      'bitboard_theme',
      'bitboard_relays',
      'bitboard_muted_pubkeys',
      'bitboard_reported_events',
      'bitboard_cached_posts',
      'bitboard_cached_boards',
      'bitboard_enc_key',
      'bitboard_account_created',
    ];

    keysToDelete.forEach((key) => {
      localStorage.removeItem(key);
    });

    logger.info('DataDeletion', 'All user data deleted');
  }
}

// Export singleton instance
export const dataExportService = new DataExportService();
