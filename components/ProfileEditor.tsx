import React, { useState, useEffect } from 'react';
import { Save, X, Upload, User, Globe, Zap, Mail, Image, FileText } from 'lucide-react';
import { profileService, type ProfileMetadata } from '../services/profileService';
import { identityService } from '../services/identityService';
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
  isLoading = false,
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
    setProfile(prev => ({ ...prev, [field]: value || undefined }));
    // Clear errors when user starts typing
    if (errors.length > 0) {
      setErrors([]);
    }
  };

  return (
    <div className="border-2 border-terminal-text bg-terminal-bg p-6 max-w-2xl mx-auto w-full shadow-hard-lg animate-fade-in">
      <div className="flex items-center justify-between mb-6 border-b border-terminal-dim pb-2">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <User size={20} />
          EDIT_PROFILE
        </h2>
        <button
          onClick={onCancel}
          className="text-terminal-dim hover:text-terminal-text transition-colors"
          disabled={isSaving}
        >
          <X size={20} />
        </button>
      </div>

      {errors.length > 0 && (
        <div className="mb-4 p-3 border border-terminal-alert bg-terminal-alert/10 text-terminal-alert">
          <div className="font-bold mb-1">Validation Errors:</div>
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
          <h3 className="text-sm font-bold text-terminal-text uppercase border-b border-terminal-dim/30 pb-1">
            Basic Information
          </h3>

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
                className="w-full bg-terminal-bg border border-terminal-dim p-3 text-terminal-text font-mono focus:outline-none focus:border-terminal-text transition-colors"
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
                className="w-full bg-terminal-bg border border-terminal-dim p-3 text-terminal-text font-mono focus:outline-none focus:border-terminal-text transition-colors"
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
              className="w-full bg-terminal-bg border border-terminal-dim p-3 text-terminal-text font-mono focus:outline-none focus:border-terminal-text transition-colors resize-none"
              placeholder="Tell others about yourself..."
              rows={3}
              maxLength={500}
              disabled={isSaving}
            />
            <div className="text-xs text-terminal-dim text-right">
              {(profile.about?.length || 0)}/500
            </div>
          </div>
        </div>

        {/* Media */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-terminal-text uppercase border-b border-terminal-dim/30 pb-1">
            Media
          </h3>

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
                className="w-full bg-terminal-bg border border-terminal-dim p-3 text-terminal-text font-mono focus:outline-none focus:border-terminal-text transition-colors text-sm"
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
                className="w-full bg-terminal-bg border border-terminal-dim p-3 text-terminal-text font-mono focus:outline-none focus:border-terminal-text transition-colors text-sm"
                placeholder="https://example.com/banner.jpg"
                disabled={isSaving}
              />
            </div>
          </div>
        </div>

        {/* Links */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-terminal-text uppercase border-b border-terminal-dim/30 pb-1">
            Links & Contact
          </h3>

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
                className="w-full bg-terminal-bg border border-terminal-dim p-3 text-terminal-text font-mono focus:outline-none focus:border-terminal-text transition-colors text-sm"
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
                className="w-full bg-terminal-bg border border-terminal-dim p-3 text-terminal-text font-mono focus:outline-none focus:border-terminal-text transition-colors text-sm"
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
                className="w-full bg-terminal-bg border border-terminal-dim p-3 text-terminal-text font-mono focus:outline-none focus:border-terminal-text transition-colors text-sm"
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
                className="w-full bg-terminal-bg border border-terminal-dim p-3 text-terminal-text font-mono focus:outline-none focus:border-terminal-text transition-colors text-sm"
                placeholder="lnurl1..."
                disabled={isSaving}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-6 border-t border-terminal-dim/30">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 bg-terminal-text text-black font-bold px-6 py-4 hover:bg-terminal-dim hover:text-white transition-colors uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                SAVING...
              </>
            ) : (
              <>
                <Save size={18} />
                SAVE_PROFILE
              </>
            )}
          </button>

          <button
            onClick={onCancel}
            disabled={isSaving}
            className="px-6 py-4 border border-terminal-dim text-terminal-dim hover:border-terminal-text hover:text-terminal-text transition-colors uppercase disabled:opacity-50"
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
};
