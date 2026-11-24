// Keeps a view that fails while rendering from emptying the whole window. Only the
// failing view is replaced, by an English message with a retry; the navigation, the
// status area and every provider above it stay mounted, so pending saves continue and
// closing or quitting still waits for them. Navigating (a new resetKey) or Try again
// shows the view again.

import { Component, type ReactNode } from 'react';
import { Button } from './Button';
import { Notice } from './Notice';

export interface ViewErrorBoundaryProps {
  /** A new value, such as the next navigation request, shows the view again. */
  resetKey: unknown;
  /** Called after a view failed, for example to bring back navigation hidden by focus mode. */
  onError?: () => void;
  children?: ReactNode;
}

interface ViewErrorBoundaryState {
  failed: boolean;
  resetKey: unknown;
}

export class ViewErrorBoundary extends Component<ViewErrorBoundaryProps, ViewErrorBoundaryState> {
  state: ViewErrorBoundaryState = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<ViewErrorBoundaryState> {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: ViewErrorBoundaryProps,
    state: ViewErrorBoundaryState,
  ): Partial<ViewErrorBoundaryState> | null {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey };
  }

  componentDidCatch() {
    this.props.onError?.();
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="view">
        <Notice
          tone="error"
          title="This view couldn't be shown."
          actions={<Button onClick={() => this.setState({ failed: false })}>Try again</Button>}
        >
          Your saved entries are not affected. Try again, or choose another view.
        </Notice>
      </div>
    );
  }
}
