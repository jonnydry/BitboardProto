import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { diagnosticsService } from '../services/diagnosticsService';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary component for graceful error handling
 * Prevents entire app crashes and provides user-friendly error messages
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: Readonly<State>;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    diagnosticsService.error(
      'ErrorBoundary',
      error?.message || 'Unknown error',
      errorInfo?.componentStack || undefined
    );
    
    // Report to error tracking service if enabled
    try {
      const { errorTrackingService } = require('../services/errorTracking');
      errorTrackingService.captureException(error, {
        componentStack: errorInfo?.componentStack,
        source: 'ErrorBoundary',
      });
    } catch {
      // Error tracking not available or not initialized
    }
    
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-terminal-bg text-terminal-text font-mono p-8 flex items-center justify-center">
          <div className="border-2 border-terminal-alert bg-terminal-bg p-6 max-w-2xl w-full shadow-hard-lg">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={24} className="text-terminal-alert" />
              <h2 className="text-2xl font-bold text-terminal-alert">
                SYSTEM_ERROR
              </h2>
            </div>
            
            <div className="mb-4 space-y-2">
              <p className="text-terminal-text">
                An unexpected error occurred. The application has been protected from crashing.
              </p>
              {this.state.error && (
                <div className="bg-terminal-dim/10 border border-terminal-dim p-3 mt-3">
                  <p className="text-xs text-terminal-dim uppercase mb-1">Error Details:</p>
                  <p className="text-sm text-terminal-alert font-mono break-words">
                    {this.state.error.message || 'Unknown error'}
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 border border-terminal-text bg-terminal-text text-black hover:bg-terminal-dim hover:text-terminal-text transition-colors uppercase text-sm font-bold"
              >
                [ RETRY ]
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 border border-terminal-dim text-terminal-dim hover:border-terminal-text hover:text-terminal-text transition-colors uppercase text-sm"
              >
                [ RELOAD_PAGE ]
              </button>
            </div>

            {import.meta.env.DEV && this.state.errorInfo && (
              <details className="mt-4 border border-terminal-dim p-3">
                <summary className="text-xs text-terminal-dim cursor-pointer uppercase mb-2">
                  Stack Trace (Dev Mode)
                </summary>
                <pre className="text-xs text-terminal-dim overflow-auto max-h-48 font-mono">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

