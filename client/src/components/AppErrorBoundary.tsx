import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Unknown client error',
    };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo): void {
    console.error('Unhandled React error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-slate-900">
          <div className="max-w-xl rounded-[6px] border border-red-200 bg-white p-5 shadow">
            <h1 className="text-lg font-semibold text-red-700">Application Error</h1>
            <p className="mt-2 text-sm">
              The app hit a runtime error while rendering. Open browser DevTools Console for details.
            </p>
            <pre className="mt-3 overflow-auto rounded bg-slate-100 p-3 text-xs text-slate-700">
              {this.state.message}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
