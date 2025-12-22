import React, { useState } from 'react';
import { Image as ImageIcon, XCircle, Loader2 } from 'lucide-react';

interface ImagePreviewProps {
  src: string;
  alt?: string;
  className?: string;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({ src, alt = 'Image', className = '' }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleLoad = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  if (hasError) {
    return (
      <div className={`border border-terminal-alert/50 p-4 text-center bg-terminal-dim/5 text-terminal-alert flex flex-col items-center gap-2 ${className}`}>
        <XCircle size={24} />
        <span className="text-xs font-mono uppercase">IMAGE_LOAD_FAILED</span>
        <span className="text-[10px] break-all opacity-70">{src}</span>
      </div>
    );
  }

  return (
    <div className={`relative group font-mono ${className}`}>
      {/* Loading State */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-terminal-dim/10 z-10">
          <div className="flex flex-col items-center gap-2 text-terminal-dim animate-pulse">
            <Loader2 size={24} className="animate-spin" />
            <span className="text-xs uppercase">LOADING_ASSET...</span>
          </div>
        </div>
      )}

      {/* Image Container */}
      <div 
        className={`
          border border-terminal-dim/50 bg-black overflow-hidden relative cursor-pointer
          ${isExpanded ? 'fixed inset-4 z-50 border-terminal-text shadow-hard bg-terminal-bg/95 flex items-center justify-center' : 'hover:border-terminal-text transition-colors'}
        `}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded && (
          <div className="absolute top-0 left-0 right-0 p-2 flex justify-between items-center bg-black/50 backdrop-blur-sm border-b border-terminal-dim z-50">
            <span className="text-xs text-terminal-text font-bold">IMG_VIEWER_V1.0</span>
            <span className="text-xs text-terminal-dim">[ CLICK TO CLOSE ]</span>
          </div>
        )}
        
        <div className={isExpanded ? 'max-w-full max-h-full p-4' : 'relative'}>
          {/* Scanline overlay for expanded view */}
          {isExpanded && <div className="absolute inset-0 pointer-events-none bg-scanline opacity-10"></div>}
          
          <img 
            src={src} 
            alt={alt}
            onLoad={handleLoad}
            onError={handleError}
            loading="lazy"
            className={`
              block max-w-full h-auto object-contain
              ${isLoading ? 'opacity-0' : 'opacity-100'} 
              ${!isExpanded ? 'grayscale sepia contrast-125 brightness-75 group-hover:filter-none group-hover:brightness-100 transition-all duration-300 max-h-[400px] w-full' : ''}
            `}
          />
        </div>

        {/* Overlay for non-expanded state */}
        {!isExpanded && !isLoading && (
          <>
            <div className="absolute inset-0 bg-terminal-text/5 pointer-events-none group-hover:opacity-0 transition-opacity z-10 mix-blend-overlay"></div>
            <div className="absolute bottom-0 left-0 bg-terminal-bg/90 px-2 py-1 text-[10px] text-terminal-text border-t border-r border-terminal-dim flex items-center gap-1">
              <ImageIcon size={10} />
              IMG_ASSET
            </div>
          </>
        )}
      </div>
      
      {/* Backdrop for expanded view */}
      {isExpanded && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40"
          onClick={() => setIsExpanded(false)}
        ></div>
      )}
    </div>
  );
};






