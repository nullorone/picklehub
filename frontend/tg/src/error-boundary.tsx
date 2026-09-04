import { Component, type ReactNode } from 'react';

interface Props {
    readonly children: ReactNode;
    readonly description: string;
    readonly retryLabel: string;
    readonly title: string;
}
interface State {
    readonly failed: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { failed: false };
    static getDerivedStateFromError(): State {
        return { failed: true };
    }
    componentDidCatch(): void {
        /* Provider reporting is added with consent later. */
    }
    render(): ReactNode {
        if (!this.state.failed) return this.props.children;
        return (
            <main className="state-card centered" role="alert">
                <h1>{this.props.title}</h1>
                <p>{this.props.description}</p>
                <button
                    className="primary-action"
                    type="button"
                    onClick={() => {
                        window.location.reload();
                    }}
                >
                    {this.props.retryLabel}
                </button>
            </main>
        );
    }
}
