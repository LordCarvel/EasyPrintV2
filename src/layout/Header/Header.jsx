import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../../shared/ui/Icon';
import './Header.css';

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path) => location.pathname === path;

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  };

  return (
    <header className="header">
      <div className="header-left">
        <button
          type="button"
          className="header-back-btn"
          title="Voltar para pagina anterior"
          aria-label="Voltar para pagina anterior"
          onClick={handleBack}
        >
          <Icon name="arrowLeft" size={18} />
        </button>

        <h1 className="header-title">Easy Print - Impressao Facil</h1>
      </div>

      <nav className="header-right">
        <Link to="/" className={`header-link ${isActive('/') ? 'active' : ''}`}>
          Impressao
        </Link>

        <Link to="/caixa" className={`header-link ${isActive('/caixa') ? 'active' : ''}`}>
          Caixa
        </Link>

        <Link to="/catalogo" className={`header-link ${isActive('/catalogo') ? 'active' : ''}`}>
          Cardapio e Palavras
        </Link>

        <Link to="/config-template" className={`header-link ${isActive('/config-template') ? 'active' : ''}`}>
          Comanda
        </Link>
      </nav>
    </header>
  );
}

