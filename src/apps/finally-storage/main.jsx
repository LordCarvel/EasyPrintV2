import ReactDOM from 'react-dom/client';
import App from './App';
import { AppStateProvider } from './shared/context/AppStateContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <AppStateProvider>
    <App />
  </AppStateProvider>
);
