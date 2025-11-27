import React, { useState, useEffect } from 'react';
import { MapPin, Navigation, RefreshCw, AlertTriangle, Check, Radio } from 'lucide-react';
import { geohashService, PRECISION_LABELS, PRECISION_DESCRIPTIONS } from '../services/geohashService';
import { GeohashPrecision, type Board } from '../types';

interface LocationSelectorProps {
  onSelectBoard: (board: Board) => void;
  onClose: () => void;
}

export const LocationSelector: React.FC<LocationSelectorProps> = ({ onSelectBoard, onClose }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationBoards, setLocationBoards] = useState<Board[]>([]);
  const [selectedPrecision, setSelectedPrecision] = useState<GeohashPrecision>(GeohashPrecision.NEIGHBORHOOD);
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(null);

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
    } catch (err: any) {
      if (err.code === 1) {
        setError('Location access denied. Please enable location permissions.');
      } else if (err.code === 2) {
        setError('Location unavailable. Please try again.');
      } else if (err.code === 3) {
        setError('Location request timed out. Please try again.');
      } else {
        setError('Failed to get location. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
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
    <div className="border-2 border-terminal-text bg-terminal-bg p-6 max-w-xl mx-auto w-full shadow-hard-lg animate-fade-in">
      <div className="flex items-center justify-between mb-6 border-b border-terminal-dim pb-2">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <MapPin size={20} />
          LOCATION_CHANNELS
        </h2>
        <button 
          onClick={onClose}
          className="text-terminal-dim hover:text-terminal-text transition-colors"
        >
          [ ESC ]
        </button>
      </div>

      {/* Info */}
      <div className="p-4 border border-terminal-dim/50 bg-terminal-dim/5 text-sm mb-6">
        <p className="text-terminal-dim leading-relaxed">
          <span className="text-terminal-text">Location-based boards</span> use geohash technology 
          (like BitChat) to create channels tied to your physical location. Connect with nearby 
          users at different geographic scales.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 border border-terminal-alert bg-terminal-alert/10 text-terminal-alert flex items-center gap-2 text-sm">
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
            className="w-full bg-terminal-text text-black font-bold px-6 py-4 hover:bg-terminal-dim hover:text-white transition-colors uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                LOCATING...
              </>
            ) : (
              <>
                <Navigation size={18} />
                ENABLE_LOCATION
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
          <div className="flex items-center gap-3 p-3 border border-terminal-dim/50 bg-terminal-dim/5">
            <Navigation size={16} className="text-green-500" />
            <div className="flex-1">
              <span className="text-xs text-terminal-dim">COORDINATES LOCKED</span>
              <div className="text-sm font-mono">
                {position.lat.toFixed(4)}, {position.lon.toFixed(4)}
              </div>
            </div>
            <button
              onClick={handleGetLocation}
              className="p-2 border border-terminal-dim hover:border-terminal-text transition-colors"
              title="Refresh location"
            >
              <RefreshCw size={14} />
            </button>
          </div>

          {/* Precision Selector */}
          <div className="space-y-2">
            <label className="text-xs text-terminal-dim uppercase font-bold">Select Range</label>
            <div className="grid grid-cols-2 gap-2">
              {precisionLevels.map((precision) => {
                const board = locationBoards.find(b => b.precision === precision);
                const isSelected = selectedPrecision === precision;
                
                return (
                  <button
                    key={precision}
                    onClick={() => setSelectedPrecision(precision)}
                    className={`p-3 border text-left transition-all ${
                      isSelected 
                        ? 'border-terminal-text bg-terminal-dim/20' 
                        : 'border-terminal-dim/50 hover:border-terminal-dim'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Radio size={12} className={isSelected ? 'text-terminal-text' : 'text-terminal-dim'} />
                      <span className={`text-sm font-bold ${isSelected ? 'text-terminal-text' : 'text-terminal-dim'}`}>
                        {PRECISION_LABELS[precision]}
                      </span>
                    </div>
                    <div className="text-[10px] text-terminal-dim mt-1">
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
            <div className="space-y-3 pt-4 border-t border-terminal-dim/30">
              <div className="text-xs text-terminal-dim uppercase font-bold">Selected Channel</div>
              {(() => {
                const selectedBoard = locationBoards.find(b => b.precision === selectedPrecision);
                if (!selectedBoard) return null;
                
                return (
                  <div className="p-4 border border-terminal-text bg-terminal-dim/10">
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin size={14} />
                      <span className="font-bold">{selectedBoard.name}</span>
                    </div>
                    <p className="text-xs text-terminal-dim mb-4">
                      {selectedBoard.description}
                    </p>
                    <button
                      onClick={() => handleSelectBoard(selectedBoard)}
                      className="w-full bg-terminal-text text-black font-bold px-4 py-3 hover:bg-terminal-dim hover:text-white transition-colors uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                      <Check size={16} />
                      JOIN_CHANNEL
                    </button>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
};




