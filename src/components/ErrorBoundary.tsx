import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo);
  }

  private handleReset = () => {
    try {
      localStorage.removeItem('trivia-editing-quiz');
    } catch {}
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans text-slate-800">
          <div className="bg-white p-8 rounded-[2rem] shadow-xl border-4 border-red-200 max-w-lg w-full text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 mb-2">Something went wrong</h1>
            <p className="text-slate-600 text-sm mb-4 font-medium">
              An unexpected issue occurred while rendering this screen. You can recover immediately by reloading.
            </p>
            {this.state.error?.message && (
              <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-mono text-left mb-6 break-words max-h-32 overflow-y-auto border border-red-200">
                {this.state.error.message}
              </div>
            )}
            <button
              onClick={this.handleReset}
              className="w-full py-3.5 px-6 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl transition-all shadow-md flex items-center justify-center gap-2 active:scale-98"
            >
              <RefreshCw className="w-5 h-5" /> Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
