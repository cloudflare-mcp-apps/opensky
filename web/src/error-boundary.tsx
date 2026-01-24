/**
 * Error Boundary Component
 *
 * Catches React errors in the widget and displays a user-friendly error page.
 * Prevents a single component error from crashing the entire widget.
 */

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: unknown) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main role="alert" aria-live="assertive" className="flex items-center justify-center h-[600px] bg-red-50 dark:bg-red-900/20">
          <div className="text-center p-8 max-w-md">
            <h1 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">
              Widget Error
            </h1>
            <p className="text-slate-700 dark:text-slate-300 mb-2 text-sm">
              An unexpected error occurred:
            </p>
            <code className="block bg-slate-200 dark:bg-slate-800 p-3 rounded mb-4 text-xs text-slate-900 dark:text-slate-100 overflow-auto max-h-24">
              {this.state.error?.message || "Unknown error"}
            </code>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              aria-label="Reload widget to recover from error"
            >
              Reload Widget
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
