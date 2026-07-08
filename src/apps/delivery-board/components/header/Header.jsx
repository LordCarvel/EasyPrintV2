import styles from './Header.module.css';
import { useRoute, navigate } from '../../router/Router';
import { getWorkspaceId } from '../../utils/workspace';

function Header() {
  const route = useRoute();
  const workspaceId = getWorkspaceId();

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate('/');
  };

  const routeLabel = route?.name === 'workspace'
    ? `Workspace ${route.params?.workspaceId || workspaceId}`
    : route?.name === 'motoboy'
      ? 'Motoboy'
      : 'Painel';

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <button
          type="button"
          className={styles.backButton}
          onClick={handleBack}
          aria-label="Voltar"
          title="Voltar"
        >
          {'<'}
        </button>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>Delivery Board</h1>
          <p className={styles.subtitle}>Despacho e acompanhamento de entregas</p>
        </div>
      </div>

      <div className={styles.right}>
        <span className={styles.badge}>ws: {workspaceId}</span>
        <span className={`${styles.badge} ${styles.badgePrimary}`}>{routeLabel}</span>
      </div>
    </header>
  );
}

export default Header;
