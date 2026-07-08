import './index.css';
import App from './App.jsx';
import { AppStateProvider } from './shared/context/AppStateContext.jsx';

export default function FinallyStorageEmbeddedApp() {
  return (
    <div className="finally-storage-app">
      <AppStateProvider>
        <App />
      </AppStateProvider>
    </div>
  );
}
