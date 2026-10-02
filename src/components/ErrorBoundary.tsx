import { Component, type ReactNode } from 'react';
import i18n from '@/i18n';

/** 4.10: an error never leaves a blank screen; local data stays untouched. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 p-10 text-center">
        <p className="text-lg font-semibold">{i18n.t('error.title')}</p>
        <p className="text-muted">{i18n.t('error.dataSafe')}</p>
        <button type="button" className="min-h-11 rounded-[8px] bg-primary px-4 font-semibold text-on-primary" onClick={() => location.reload()}>
          {i18n.t('error.reload')}
        </button>
      </div>
    );
  }
}
