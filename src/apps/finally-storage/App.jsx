import { HashRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import { Home } from './features/home/Home';
import { RateConfig } from './features/rates/RateConfig';
import { Footer } from './layout/Footer/Footer';
import { Header } from './layout/Header/Header';
import './App.css';

function AppContent() {
  return (
    <>
      <Header />
      <div className="container">
        <div className="page-view">
          <Routes>
            <Route path="/" element={<Navigate to="/funcoes" replace />} />
            <Route path="/funcoes" element={<Home />} />
            <Route path="/taxas" element={<RateConfig />} />
            <Route path="*" element={<Navigate to="/funcoes" replace />} />
          </Routes>
        </div>
      </div>
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <Router future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <AppContent />
    </Router>
  );
}
