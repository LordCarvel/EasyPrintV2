import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { Header } from './layout/Header/Header';
import { Footer } from './layout/Footer/Footer';
import { Home } from './features/home/Home';
import { ConfigKeywords } from './features/catalog/ConfigKeywords';
import { ConfigTemplate } from './features/template/ConfigTemplate';
import { CashRegister } from './features/cash-register/CashRegister';
import { OrderRouting } from './features/routing/OrderRouting';
import { RoutingPrintOrder } from './features/routing/RoutingPrintOrder';
import './EasyPrintApp.css';

function AppContent() {
  return (
    <>
      <Header />
      <div className='container'>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/catalogo" element={<ConfigKeywords />} />
          <Route path="/config-template" element={<ConfigTemplate />} />
          <Route path="/caixa" element={<CashRegister />} />
          <Route path="/roteamento" element={<OrderRouting />} />
          <Route path="/roteamento/imprimir/:orderId" element={<RoutingPrintOrder />} />
        </Routes>
      </div>
      <Footer />
    </>
  );
}

function App() {
  return (
    <div className="easy-print-app">
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppContent />
      </Router>
    </div>
  );
}

export default App


