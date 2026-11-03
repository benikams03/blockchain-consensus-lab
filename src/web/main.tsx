import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Interface interrompue', error, info.componentStack); }
  render() { return this.state.failed ? <div className="boot">Le laboratoire a été interrompu.<span>Rechargez la page pour démarrer une nouvelle expérience.</span><button onClick={() => location.reload()}>Recharger</button></div> : this.props.children; }
}
createRoot(document.getElementById('app')!).render(<ErrorBoundary><App/></ErrorBoundary>);
