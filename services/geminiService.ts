/**
 * Gemini Link Scanning Service
 *
 * DISABLED: This feature has been removed.
 * Link previews now use basic OpenGraph/meta tag fetching only.
 *
 * Reason for removal: VITE_ prefixed env vars are embedded in the client bundle,
 * making API keys visible to anyone who visits the site.
 */

import { logger } from './loggingService';

export interface LinkScanResult {
  title: string;
  description: string;
  imageUrl: string;
}

/**
 * Returns null - Gemini link scanning is disabled.
 * Link previews fall back to basic metadata fetching.
 */
export async function scanLink(_url: string): Promise<LinkScanResult | null> {
  logger.debug('Gemini', 'Link scanning disabled - using basic metadata only');
  return null;
}
