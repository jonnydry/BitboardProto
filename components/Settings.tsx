import React from 'react';
import {
  ArrowLeft,
  Settings as SettingsIcon,
  KeyRound,
  Radio,
  Bell,
  BarChart2,
  Info,
} from 'lucide-react';
import { useUIStore } from '../stores/uiStore';
import { ViewMode, ThemeId } from '../types';
import { NotificationSettings } from './NotificationCenterV2';
import { analyticsService } from '../services/analyticsService';

// ============================================
// SETTINGS PAGE
// ============================================

export const Settings: React.FC = () => {
  const setViewMode = useUIStore((s) => s.setViewMode);
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  const consentStatus = analyticsService.getConsentStatus();
  const isOptedIn = consentStatus === 'opted_in';

  const handleAnalyticsToggle = () => {
    if (isOptedIn) {
      analyticsService.optOut();
    } else {
      analyticsService.optIn();
    }
  };

  function getThemeColor(t: ThemeId): string {
    switch (t) {
      case ThemeId.AMBER:
        return '#ffb000';
      case ThemeId.PHOSPHOR:
        return '#33ff33';
      case ThemeId.PLASMA:
        return '#bf5fff';
      case ThemeId.VERMILION:
        return '#ff3c28';
      case ThemeId.SLATE:
        return '#7fb3d3';
      case ThemeId.PATRIOT:
        return '#ff1428';
      case ThemeId.SAKURA:
        return '#ff8fa3';
      case ThemeId.BITBORING:
        return '#888888';
      default:
        return '#ffb000';
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6 animate-fade-in font-mono text-terminal-text">
      {/* Back button */}
      <button
        onClick={() => setViewMode(ViewMode.FEED)}
        className="flex items-center gap-2 text-terminal-dim hover:text-terminal-text uppercase text-xs md:text-sm font-bold group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        BACK TO FEED
      </button>

      {/* Header */}
      <div className="ui-page-hero">
        <div className="flex items-center gap-3">
          <SettingsIcon size={28} className="text-terminal-dim" />
          <div>
            <h1 className="font-display text-3xl font-semibold leading-none text-terminal-text">
              SETTINGS
            </h1>
            <p className="text-xs tracking-[0.2em] text-terminal-dim uppercase mt-1">
              Configure BitBoard
            </p>
          </div>
        </div>
      </div>

      {/* VISUAL_CORE */}
      <section className="space-y-3">
        <h2 className="ui-section-title flex items-center gap-2">
          <SettingsIcon size={14} className="text-terminal-text/60 shrink-0" />
          VISUAL_CORE
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Object.values(ThemeId).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`group flex items-center gap-2 px-2 py-1.5 font-mono text-xs transition-all border
                ${
                  theme === t
                    ? 'border-terminal-text bg-terminal-dim/10 text-terminal-text'
                    : 'border-transparent hover:border-terminal-dim/50 text-terminal-dim'
                }
              `}
              title={t === ThemeId.BITBORING ? 'BITBORING (UGLY MODE)' : String(t).toUpperCase()}
            >
              <span
                className={`w-2 h-2 rounded-full transition-transform ${theme === t ? 'scale-125' : 'scale-100 group-hover:scale-110'}`}
                style={{
                  background:
                    t === ThemeId.PATRIOT
                      ? 'linear-gradient(90deg, #ff1428 0 33%, #ffffff 33% 66%, #0a4bff 66% 100%)'
                      : undefined,
                  backgroundColor: t === ThemeId.PATRIOT ? undefined : getThemeColor(t),
                  border:
                    t === ThemeId.BITBORING || t === ThemeId.PATRIOT || t === ThemeId.SAKURA
                      ? '1px solid #888'
                      : 'none',
                  boxShadow:
                    theme === t
                      ? `0 0 5px ${t === ThemeId.PATRIOT ? '#ffffff' : getThemeColor(t)}`
                      : 'none',
                }}
              />
              <span className="uppercase whitespace-nowrap overflow-hidden text-ellipsis">{t}</span>
            </button>
          ))}
        </div>
      </section>

      {/* IDENTITY & PRIVACY */}
      <section className="space-y-3">
        <h2 className="text-sm tracking-[0.3em] uppercase text-terminal-dim border-b border-terminal-dim/30 pb-2 flex items-center gap-2">
          <KeyRound size={14} className="text-terminal-text/60 shrink-0" />
          IDENTITY &amp; PRIVACY
        </h2>
        <div className="flex flex-col gap-2">
          <button onClick={() => setViewMode(ViewMode.IDENTITY)} className="ui-list-action">
            <KeyRound size={14} />
            Manage Identity &amp; Keys
          </button>
          <button onClick={() => setViewMode(ViewMode.PRIVACY_POLICY)} className="ui-list-action">
            <Info size={14} />
            Privacy Policy
          </button>
        </div>
      </section>

      {/* NETWORK */}
      <section className="space-y-3">
        <h2 className="ui-section-title flex items-center gap-2">
          <Radio size={14} className="text-terminal-text/60 shrink-0" />
          NETWORK
        </h2>
        <button onClick={() => setViewMode(ViewMode.RELAYS)} className="ui-list-action">
          <Radio size={14} />
          Relay Settings
        </button>
      </section>

      {/* NOTIFICATIONS */}
      <section className="space-y-3">
        <h2 className="ui-section-title flex items-center gap-2">
          <Bell size={14} className="text-terminal-text/60 shrink-0" />
          NOTIFICATIONS
        </h2>
        <div className="border border-terminal-dim/20 bg-terminal-dim/[0.03] p-4">
          <NotificationSettings onClose={() => {}} />
        </div>
      </section>

      {/* ANALYTICS */}
      <section className="space-y-3">
        <h2 className="ui-section-title flex items-center gap-2">
          <BarChart2 size={14} className="text-terminal-text/60 shrink-0" />
          ANALYTICS
        </h2>
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm text-terminal-dim">Usage Analytics</p>
            <p className="text-xs text-terminal-dim/60 mt-0.5">
              Help improve BitBoard by sharing anonymous usage data
            </p>
          </div>
          <button
            onClick={handleAnalyticsToggle}
            role="switch"
            aria-checked={isOptedIn}
            aria-label="Toggle analytics"
            className={`ui-toggle ${isOptedIn ? 'bg-terminal-text' : 'bg-terminal-dim/20'}`}
          >
            <span
              className={`ui-toggle-thumb ${isOptedIn ? 'left-5 bg-black' : 'left-0.5 bg-terminal-dim'}`}
            />
          </button>
        </div>
      </section>

      {/* ABOUT */}
      <section className="space-y-3">
        <h2 className="ui-section-title flex items-center gap-2">
          <Info size={14} className="text-terminal-text/60 shrink-0" />
          ABOUT
        </h2>
        <div className="flex flex-col gap-2">
          <button onClick={() => setViewMode(ViewMode.ABOUT)} className="ui-list-action">
            <Info size={14} />
            About BitBoard
          </button>
          <button onClick={() => setViewMode(ViewMode.TERMS_OF_SERVICE)} className="ui-list-action">
            <Info size={14} />
            Terms of Service
          </button>
        </div>
      </section>
    </div>
  );
};
