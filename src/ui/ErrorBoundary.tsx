/**
 * Top-level error boundary (TASK-034, NFR-001, NFR-003, NFR-006). A render
 * failure shows a fixed, safe message; the error object, its message and stack
 * are never displayed, and nothing is logged by this component.
 *
 * Focus: the fallback takes focus when it appears (the focused control it
 * replaced is gone), and after "Try again" focus goes to the element
 * `restoreFocus` returns, because the button that was pressed has been removed.
 */
import { Component, createRef } from 'react';
import type { ReactNode } from 'react';
import { message } from '../core/messages';

interface Props {
  readonly children: ReactNode;
  /** Where focus goes after a successful reset. Called after the children are back in the page. */
  readonly restoreFocus?: () => HTMLElement | null;
}

interface State {
  readonly failed: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  private readonly alertRef = createRef<HTMLDivElement>();

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidMount(): void {
    if (this.state.failed) this.alertRef.current?.focus();
  }

  override componentDidUpdate(_previousProps: Props, previousState: State): void {
    if (this.state.failed && !previousState.failed) this.alertRef.current?.focus();
    if (!this.state.failed && previousState.failed) this.props.restoreFocus?.()?.focus();
  }

  private readonly reset = (): void => {
    this.setState({ failed: false });
  };

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="error-boundary" tabIndex={-1} ref={this.alertRef}>
        <p>{message('ui.unexpectedError')}</p>
        <button type="button" onClick={this.reset}>
          {message('ui.tryAgain')}
        </button>
      </div>
    );
  }
}
