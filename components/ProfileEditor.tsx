import React, { useState } from 'react';
import { Save, X, User, Globe, Zap, Mail, Image, FileText } from 'lucide-react';
import { profileService, type ProfileMetadata } from '../services/profileService';
import { toastService } from '../services/toastService';
import { UIConfig } from '../config';

interface ProfileEditorProps {
  onSave: (profile: ProfileMetadata) => void;
  onCancel: () => void;
  initialProfile?: Partial<ProfileMetadata>;
  isLoading?: boolean;
}

export const ProfileEditor: React.FC<ProfileEditorProps> = ({
  onSave,
  onCancel,
  initialProfile = {},
  isLoading: _isLoading = false,
}) => {
  const [profile, setProfile] = useState<Partial<ProfileMetadata>>(initialProfile);
  const [errors, setErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    const validation = profileService.validateProfile(profile);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setIsSaving(true);
    setErrors([]);

    try {
      await profileService.updateProfile(profile);
      toastService.push({
        type: 'success',
        message: 'Profile updated successfully',
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: 'profile-updated',
      });
      onSave(profile);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update profile';
      toastService.push({
        type: 'error',
        message: 'Failed to update profile',
        detail: errorMessage,
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: 'profile-update-failed',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const updateField = (field: keyof ProfileMetadata, value: string) => {
    setProfile((prev) => ({ ...prev, [field]: value || undefined }));
    // Clear errors when user starts typing
    if (errors.length > 0) {
      setErrors([]);
    }
  };

  return (
    <div className="ui-surface-editor overflow-hidden">
      <div className="flex items-center justify-between border-b border-terminal-dim/15 px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-terminal-text" />
          <span className="font-mono text-sm uppercase tracking-[0.12em] text-terminal-dim">
            Edit Profile
          </span>
        </div>
        <button
          onClick={onCancel}
          className="text-terminal-dim hover:text-terminal-text transition-colors"
          disabled={isSaving}
        >
          <X size={20} />
        </button>
      </div>

      <div className="px-5 py-5">
        <div className="mb-6 flex items-center justify-between border-b border-terminal-dim/15 pb-3">
          <h2 className="flex items-center gap-2 font-display text-3xl font-semibold text-terminal-text">
            <User size={20} />
            Edit profile
          </h2>
        </div>

        {errors.length > 0 && (
          <div className="mb-4 border border-terminal-alert/40 bg-terminal-alert/10 p-3 text-terminal-alert">
            <div className="mb-1 font-bold">Validation Errors:</div>
            <ul className="text-sm list-disc list-inside">
              {errors.map((error, i) => (
                <li key={i}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="ui-section-title">Basic Information</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-terminal-dim uppercase font-bold flex items-center gap-2">
                  <User size={12} />
                  Name
                </label>
                <input
                  type="text"
                  value={profile.name || ''}
                  onChange={(e) => updateField('name', e.target.value)}
                  className="ui-input"
                  placeholder="Your display name"
                  maxLength={50}
                  disabled={isSaving}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-terminal-dim uppercase font-bold flex items-center gap-2">
                  <User size={12} />
                  Display Name (Legacy)
                </label>
                <input
                  type="text"
                  value={profile.display_name || ''}
                  onChange={(e) => updateField('display_name', e.target.value)}
                  className="ui-input"
                  placeholder="Legacy display name"
                  maxLength={50}
                  disabled={isSaving}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-terminal-dim uppercase font-bold flex items-center gap-2">
                <FileText size={12} />
                Bio/About
              </label>
              <textarea
                value={profile.about || ''}
                onChange={(e) => updateField('about', e.target.value)}
                className="ui-input resize-none"
                placeholder="Tell others about yourself..."
                rows={3}
                maxLength={500}
                disabled={isSaving}
              />
              <div className="text-xs text-terminal-dim text-right">
                {profile.about?.length || 0}/500
              </div>
            </div>
          </div>

          {/* Media */}
          <div className="space-y-4">
            <h3 className="ui-section-title">Media</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-terminal-dim uppercase font-bold flex items-center gap-2">
                  <Image size={12} />
                  Profile Picture URL
                </label>
                <input
                  type="url"
                  value={profile.picture || ''}
                  onChange={(e) => updateField('picture', e.target.value)}
                  className="ui-input"
                  placeholder="https://example.com/avatar.jpg"
                  disabled={isSaving}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-terminal-dim uppercase font-bold flex items-center gap-2">
                  <Image size={12} />
                  Banner Image URL
                </label>
                <input
                  type="url"
                  value={profile.banner || ''}
                  onChange={(e) => updateField('banner', e.target.value)}
                  className="ui-input"
                  placeholder="https://example.com/banner.jpg"
                  disabled={isSaving}
                />
              </div>
            </div>
          </div>

          {/* Links */}
          <div className="space-y-4">
            <h3 className="ui-section-title">Links & Contact</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-terminal-dim uppercase font-bold flex items-center gap-2">
                  <Globe size={12} />
                  Website
                </label>
                <input
                  type="url"
                  value={profile.website || ''}
                  onChange={(e) => updateField('website', e.target.value)}
                  className="ui-input"
                  placeholder="https://yourwebsite.com"
                  disabled={isSaving}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-terminal-dim uppercase font-bold flex items-center gap-2">
                  <Mail size={12} />
                  NIP-05 Address
                </label>
                <input
                  type="text"
                  value={profile.nip05 || ''}
                  onChange={(e) => updateField('nip05', e.target.value)}
                  className="ui-input"
                  placeholder="username@domain.com"
                  disabled={isSaving}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-terminal-dim uppercase font-bold flex items-center gap-2">
                  <Zap size={12} />
                  Lightning Address (LUD-16)
                </label>
                <input
                  type="text"
                  value={profile.lud16 || ''}
                  onChange={(e) => updateField('lud16', e.target.value)}
                  className="ui-input"
                  placeholder="username@wallet.com"
                  disabled={isSaving}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-terminal-dim uppercase font-bold flex items-center gap-2">
                  <Zap size={12} />
                  LNURL (LUD-06)
                </label>
                <input
                  type="text"
                  value={profile.lud06 || ''}
                  onChange={(e) => updateField('lud06', e.target.value)}
                  className="ui-input"
                  placeholder="lnurl1..."
                  disabled={isSaving}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 border-t border-terminal-dim/20 pt-6">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="ui-button-primary flex flex-1 items-center justify-center gap-2 py-4"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  SAVING...
                </>
              ) : (
                <>
                  <Save size={18} />
                  Save Profile
                </>
              )}
            </button>

            <button
              onClick={onCancel}
              disabled={isSaving}
              className="ui-button-secondary px-6 py-4"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
