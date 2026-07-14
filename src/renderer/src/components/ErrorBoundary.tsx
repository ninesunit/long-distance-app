import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

// Catches render errors so a crashing popup shows a readable message instead of
// a blank, un-reopenable window — and surfaces the error text for debugging.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('Popup crashed:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="w-full h-full p-3 font-sans">
          <div className="pixel-window w-full h-full flex flex-col gap-2 p-4 overflow-auto no-drag">
            <p className="font-pixel text-[10px] text-campfire-dark">Something broke 😿</p>
            <p className="text-[11px] text-ink break-words">{this.state.error.message}</p>
            <button
              onClick={() => this.setState({ error: null })}
              className="pixel-btn text-[10px] py-1.5 mt-auto"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
