import React, { Component, ReactNode, ErrorInfo } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Critical Sync Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-space text-red-400 p-8 text-center">
          <h1 className="text-2xl font-bold mb-4 text-white">Application Synchronization Failed</h1>
          <pre className="bg-panel p-4 rounded-lg text-xs max-w-2xl overflow-auto mb-6 border border-red-900/30">
            {this.state.error?.message || "Unknown Runtime Error"}
          </pre>
          <button 
            onClick={() => window.location.reload()} 
            className="px-6 py-2 bg-accent text-white rounded-full font-bold hover:bg-accent-hover transition-colors"
          >
            Restart Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  );
}