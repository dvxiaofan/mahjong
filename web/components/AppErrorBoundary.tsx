import { Component, type ErrorInfo, type ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  failed: boolean;
}

export function AppErrorFallback() {
  return (
    <main className="fatal-error" role="alert">
      <p className="panel-eyebrow">RECOVERY</p>
      <h1>牌桌暂时无法显示</h1>
      <p>本地存档仍然保留。重新载入页面后会尝试恢复当前牌局。</p>
      <button
        className="online-primary-button"
        onClick={() => window.location.reload()}
        type="button"
      >
        重新载入
      </button>
    </main>
  );
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // The fallback intentionally avoids exposing state, tokens, or hand data in logs.
  }

  render() {
    return this.state.failed ? <AppErrorFallback /> : this.props.children;
  }
}
