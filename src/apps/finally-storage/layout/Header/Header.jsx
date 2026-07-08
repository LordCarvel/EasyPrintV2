import { NavLink, useNavigate } from 'react-router-dom';
import { Icon } from '../../shared/ui/Icon';
import './Header.css';

const links = [
  { to: '/funcoes', label: 'Funcoes' },
  { to: '/taxas', label: 'Taxas' }
];

export function Header() {
  const navigate = useNavigate();

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate('/funcoes');
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

        <h1 className="header-title">Finally Storage</h1>
      </div>

      <nav className="header-right" aria-label="Navegacao principal">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => `header-link ${isActive ? 'active' : ''}`}
            end={link.to === '/funcoes'}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
