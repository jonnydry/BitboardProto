import { nostrService } from './nostrService';
import { identityService } from './identityService';

/**
 * Profile metadata interface (NIP-01 kind 0 content)
 */
export interface ProfileMetadata {
  name?: string;
  display_name?: string;
  about?: string;
  picture?: string;
  banner?: string;
  website?: string;
  lud06?: string;
  lud16?: string;
  nip05?: string;
  [key: string]: string | undefined;
}

/**
 * Service for handling profile metadata operations
 */
class ProfileService {
  // Local cache for profile metadata (synced from nostrService fetches)
  private profileCache: Map<string, ProfileMetadata> = new Map();

  /**
   * Get cached profile metadata for a pubkey (async, triggers fetch if not cached)
   */
  async getProfileMetadata(pubkey: string): Promise<ProfileMetadata | null> {
    try {
      const profile = await nostrService.fetchProfiles([pubkey], { force: false });
      const rawMetadata = profile.get(pubkey);
      const metadata = rawMetadata as unknown as ProfileMetadata | undefined;
      if (metadata) {
        // Update local cache
        this.profileCache.set(pubkey, metadata);
      }
      return metadata ?? null;
    } catch (error) {
      console.error('[ProfileService] Failed to fetch profile:', error);
      return null;
    }
  }

  /**
   * Get cached profile metadata synchronously (returns null if not cached)
   * Use this when you want to avoid triggering network requests
   */
  getCachedProfileSync(pubkey: string): ProfileMetadata | null {
    return this.profileCache.get(pubkey) || null;
  }

  /**
   * Pre-fetch profiles for multiple pubkeys (batch operation)
   * Call this at a parent level to warm the cache before rendering children
   */
  async prefetchProfiles(pubkeys: string[]): Promise<void> {
    if (pubkeys.length === 0) return;
    try {
      const profiles = await nostrService.fetchProfiles(pubkeys, { force: false });
      profiles.forEach((rawMetadata, pubkey) => {
        this.profileCache.set(pubkey, rawMetadata as unknown as ProfileMetadata);
      });
    } catch (error) {
      console.error('[ProfileService] Failed to prefetch profiles:', error);
    }
  }

  /**
   * Refresh profile metadata for a pubkey (force fetch)
   */
  async refreshProfileMetadata(pubkey: string): Promise<ProfileMetadata | null> {
    try {
      const profile = await nostrService.fetchProfiles([pubkey], { force: true });
      const rawMetadata = profile.get(pubkey);
      return (rawMetadata as unknown as ProfileMetadata) ?? null;
    } catch (error) {
      console.error('[ProfileService] Failed to refresh profile:', error);
      return null;
    }
  }

  /**
   * Update profile metadata and publish to Nostr
   */
  async updateProfile(profile: ProfileMetadata): Promise<void> {
    const identity = identityService.getIdentity();
    if (!identity) {
      throw new Error('No identity available');
    }

    try {
      const event = nostrService.buildProfileEvent({
        pubkey: identity.pubkey,
        ...profile,
      });

      const signed = await identityService.signEvent(event);
      await nostrService.publishSignedEvent(signed);

      // Update local identity with new display name if provided
      if (profile.name || profile.display_name) {
        const updatedIdentity = {
          ...identity,
          displayName: profile.display_name || profile.name,
        };
        identityService.setSessionIdentity(updatedIdentity);
      }
    } catch (error) {
      console.error('[ProfileService] Failed to update profile:', error);
      throw error;
    }
  }

  /**
   * Get display name from profile metadata, with fallback logic
   */
  getDisplayName(pubkey: string, profile?: ProfileMetadata): string {
    // Use nostrService's cached display name first
    const cachedName = nostrService.getDisplayName(pubkey);
    if (cachedName && cachedName !== pubkey.slice(0, 16) + '...') {
      return cachedName;
    }

    // Fallback to profile metadata
    if (profile) {
      return profile.display_name || profile.name || pubkey.slice(0, 16) + '...';
    }

    // Ultimate fallback
    return pubkey.slice(0, 16) + '...';
  }

  /**
   * Validate profile data
   */
  validateProfile(profile: Partial<ProfileMetadata>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (profile.name && profile.name.length > 50) {
      errors.push('Name must be 50 characters or less');
    }

    if (profile.display_name && profile.display_name.length > 50) {
      errors.push('Display name must be 50 characters or less');
    }

    if (profile.about && profile.about.length > 500) {
      errors.push('Bio must be 500 characters or less');
    }

    if (profile.website && !this.isValidUrl(profile.website)) {
      errors.push('Website must be a valid URL');
    }

    if (profile.picture && !this.isValidUrl(profile.picture)) {
      errors.push('Profile picture must be a valid URL');
    }

    if (profile.banner && !this.isValidUrl(profile.banner)) {
      errors.push('Banner image must be a valid URL');
    }

    return { valid: errors.length === 0, errors };
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}

export const profileService = new ProfileService();
