import React, { useState, useEffect, useCallback } from 'react';
import {
  MapPin,
  Navigation,
  RefreshCw,
  AlertTriangle,
  Check,
  Radio,
  Activity,
  Users,
} from 'lucide-react';
import {
  geohashService,
  PRECISION_LABELS,
  PRECISION_DESCRIPTIONS,
} from '../services/geohashService';
import { geonetDiscoveryService, type GeoChannel } from '../services/geonetDiscoveryService';
import { GeohashPrecision, type Board } from '../types';

interface LocationSelectorProps {
  onSelectBoard: (board: Board) => void;
  onClose: () => void;
}

export const LocationSelector: React.FC<LocationSelectorProps> = ({ onSelectBoard, onClose }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationBoards, setLocationBoards] = useState<Board[]>([]);
  const [selectedPrecision, setSelectedPrecision] = useState<GeohashPrecision>(
    GeohashPrecision.NEIGHBORHOOD,
  );
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(null);
  const [activeChannels, setActiveChannels] = useState<GeoChannel[]>([]);
  const [showActiveChannels, setShowActiveChannels] = useState(true);

  const discoverChannels = useCallback(async (lat: number, lon: number) => {
    setIsDiscovering(true);
    try {
      const result = await geonetDiscoveryService.discoverNearbyChannels(lat, lon);
      setActiveChannels(result.channels);
    } catch (err) {
      console.error('[LocationSelector] Discovery failed:', err);
    } finally {
      setIsDiscovering(false);
    }
  }, []);

  // Discover active channels when position is set
  useEffect(() => {
    if (position) {
      discoverChannels(position.lat, position.lon);
    }
  }, [position, discoverChannels]);

  const handleGetLocation = async () => {
    setIsLoading(true);
    setError(null);

    if (!geohashService.isGeolocationAvailable()) {
      setError('Geolocation is not supported by your browser');
      setIsLoading(false);
      return;
    }

    try {
      const pos = await geohashService.getCurrentPosition();
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      setPosition({ lat, lon });

      const boards = geohashService.generateLocationBoards(lat, lon);
      setLocationBoards(boards);
    } catch (err: unknown) {
      const e = err as { code?: number };
      if (e.code === 1) {
        setError('Location access denied. Please enable location permissions.');
      } else if (e.code === 2) {
        setError('Location unavailable. Please try again.');
      } else if (e.code === 3) {
        setError('Location request timed out. Please try again.');
      } else {
        setError('Failed to get location. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinActiveChannel = (channel: GeoChannel) => {
    const board = geonetDiscoveryService.channelToBoard(channel);
    onSelectBoard(board);
  };

  const handleSelectBoard = (board: Board) => {
    onSelectBoard(board);
  };

  const precisionLevels = [
    GeohashPrecision.BLOCK,
    GeohashPrecision.NEIGHBORHOOD,
    GeohashPrecision.CITY,
    GeohashPrecision.PROVINCE,
    GeohashPrecision.REGION,
    GeohashPrecision.COUNTRY,
  ];

  return (
    <div className="ui-surface-editor max-w-xl overflow-hidden">
      <div className="flex items-center justify-between border-b border-terminal-dim/15 px-5 py-3">
        <h2 className="flex items-center gap-2 font-display text-2xl font-semibold text-terminal-text">
          <MapPin size={20} />
          Location Channels
        </h2>
        <button
          onClick={onClose}
          className="text-terminal-dim hover:text-terminal-text transition-colors"
        >
          ESC
        </button>
      </div>

      <div className="px-5 py-5">
        {/* Info */}
        <div className="p-4 border border-terminal-dim/50 bg-terminal-dim/5 text-sm mb-6">
          <p className="text-terminal-dim leading-relaxed">
            <span className="text-terminal-text">Location-based boards</span> use geohash technology
            (like BitChat) to create channels tied to your physical location. Connect with nearby
            users at different geographic scales.
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 border border-terminal-alert/40 bg-terminal-alert/10 p-3 text-sm text-terminal-alert">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {!position ? (
          // ========== REQUEST LOCATION ==========
          <div className="space-y-4">
            <button
              onClick={handleGetLocation}
              disabled={isLoading}
              className="ui-button-primary flex w-full items-center justify-center gap-2 px-6 py-4 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  Locating...
                </>
              ) : (
                <>
                  <Navigation size={18} />
                  Enable Location
                </>
              )}
            </button>

            <p className="text-xs text-terminal-dim text-center">
              Your exact location is never stored or shared. Only the geohash zone is used.
            </p>
          </div>
        ) : (
          // ========== LOCATION FOUND ==========
          <div className="space-y-6">
            {/* Current Location */}
            <div className="flex items-center gap-3 border border-terminal-dim/30 bg-terminal-dim/5 p-3">
              <Navigation size={16} className="text-terminal-text" />
              <div className="flex-1">
                <span className="text-xs uppercase tracking-[0.12em] text-terminal-dim">
                  Coordinates Locked
                </span>
                <div className="text-sm font-mono">
                  {position.lat.toFixed(4)}, {position.lon.toFixed(4)}
                </div>
              </div>
              <button
                onClick={handleGetLocation}
                className="border border-terminal-dim/30 p-2 transition-colors hover:border-terminal-dim/60"
                title="Refresh location"
              >
                <RefreshCw size={14} />
              </button>
            </div>

            {/* Active Channels Discovery */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-terminal-dim uppercase font-bold flex items-center gap-2">
                  <Activity size={12} />
                  Nearby Active Channels
                </label>
                <button
                  onClick={() => setShowActiveChannels(!showActiveChannels)}
                  className="text-xs uppercase tracking-[0.12em] text-terminal-dim hover:text-terminal-text"
                >
                  {showActiveChannels ? 'Hide' : 'Show'}
                </button>
              </div>

              {showActiveChannels && (
                <div className="border border-terminal-dim/50 bg-terminal-dim/5">
                  {isDiscovering ? (
                    <div className="p-4 text-center text-terminal-dim text-sm flex items-center justify-center gap-2">
                      <RefreshCw size={14} className="animate-spin" />
                      Scanning for activity...
                    </div>
                  ) : activeChannels.length === 0 ? (
                    <div className="p-4 text-center text-terminal-dim text-sm">
                      No recent activity found nearby. Be the first to post!
                    </div>
                  ) : (
                    <div className="max-h-[200px] overflow-y-auto">
                      {activeChannels.slice(0, 10).map((channel) => (
                        <button
                          key={channel.geohash}
                          onClick={() => handleJoinActiveChannel(channel)}
                          className="group w-full border-b border-terminal-dim/15 p-3 text-left transition-colors hover:bg-terminal-dim/10 last:border-b-0"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <MapPin size={12} className="text-terminal-dim" />
                              <span className="font-mono text-sm">#{channel.geohash}</span>
                              {geonetDiscoveryService.isRecentlyActive(channel) && (
                                <span className="rounded-sm bg-terminal-text/10 px-1.5 py-0.5 text-2xs text-terminal-text">
                                  ACTIVE
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-terminal-dim opacity-0 group-hover:opacity-100">
                              JOIN →
                            </span>
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-2xs text-terminal-dim">
                            <span className="flex items-center gap-1">
                              <Activity size={10} />
                              {channel.postCount} posts
                            </span>
                            <span className="flex items-center gap-1">
                              <Users size={10} />
                              {channel.uniqueAuthors} users
                            </span>
                            <span>
                              {geonetDiscoveryService.formatLastActivity(channel.lastActivityAt)}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Precision Selector */}
            <div className="space-y-2">
              <label className="text-xs text-terminal-dim uppercase font-bold">
                Or Select Range Manually
              </label>
              <div className="grid grid-cols-2 gap-2">
                {precisionLevels.map((precision) => {
                  const board = locationBoards.find((b) => b.precision === precision);
                  const isSelected = selectedPrecision === precision;
                  // Find if there's activity for this precision
                  const channelActivity = activeChannels.find((c) => c.precision === precision);

                  return (
                    <button
                      key={precision}
                      onClick={() => setSelectedPrecision(precision)}
                      className={`border p-3 text-left transition-all ${
                        isSelected
                          ? 'border-terminal-dim/60 bg-terminal-dim/10'
                          : 'border-terminal-dim/25 hover:border-terminal-dim/50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Radio
                          size={12}
                          className={isSelected ? 'text-terminal-text' : 'text-terminal-dim'}
                        />
                        <span
                          className={`text-sm font-bold ${isSelected ? 'text-terminal-text' : 'text-terminal-dim'}`}
                        >
                          {PRECISION_LABELS[precision]}
                        </span>
                        {channelActivity && channelActivity.postCount > 0 && (
                          <span className="text-2xs px-1 bg-terminal-dim/30 text-terminal-text">
                            {channelActivity.postCount}
                          </span>
                        )}
                      </div>
                      <div className="text-2xs text-terminal-dim mt-1">
                        {PRECISION_DESCRIPTIONS[precision]}
                      </div>
                      {board && (
                        <div className="text-xs font-mono text-terminal-text mt-2">
                          #{board.geohash}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Board Preview */}
            {locationBoards.length > 0 && (
              <div className="space-y-3 border-t border-terminal-dim/20 pt-4">
                <div className="text-xs font-bold uppercase tracking-[0.12em] text-terminal-dim">
                  Selected Channel
                </div>
                {(() => {
                  const selectedBoard = locationBoards.find(
                    (b) => b.precision === selectedPrecision,
                  );
                  if (!selectedBoard) return null;

                  return (
                    <div className="border border-terminal-dim/25 bg-terminal-dim/10 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin size={14} />
                        <span className="font-bold">{selectedBoard.name}</span>
                      </div>
                      <p className="text-xs text-terminal-dim mb-4">{selectedBoard.description}</p>
                      <button
                        onClick={() => handleSelectBoard(selectedBoard)}
                        className="ui-button-primary flex w-full items-center justify-center gap-2 px-4 py-3"
                      >
                        <Check size={16} />
                        Join Channel
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
