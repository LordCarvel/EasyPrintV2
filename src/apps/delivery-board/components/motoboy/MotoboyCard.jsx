import styles from './MotoboyCard.module.css';

function MotoboyCard({ motoboy, stats, onAddViagem, onDeleteMotoboy, children }) {
  const initial = motoboy?.nome ? motoboy.nome.charAt(0).toUpperCase() : '?';
  const total = stats?.total ?? 0;
  const entregues = stats?.entregues ?? 0;

  return (
    <div className={styles.motoboyCard}>
      <div className={styles.motoboyHeader}>
        <span className={styles.motoboyName}>
          <span className={styles.avatar}>{initial}</span>
          {motoboy?.nome || 'Motoboy'}
          {motoboy?.ativo === false && <span className={styles.inactiveBadge}>inativo</span>}
        </span>
        <div className={styles.stats}>
          <span className={styles.statItem} title="Total de entregas registradas">Total: {total}</span>
          <span className={styles.statItem} title="Entregas marcadas como entregues">Entregues: {entregues}</span>
        </div>
        <div className={styles.actionGroup}>
          <button
            className="add-leva-btn"
            type="button"
            onClick={onAddViagem}
          >
            + Viagem
          </button>
          <button
            className="secondary-btn"
            type="button"
            title="Excluir motoboy"
            onClick={onDeleteMotoboy}
          >
            Excluir
          </button>
        </div>
      </div>
      <div className={styles.motoboyBody}>
        {children}
      </div>
    </div>
  );
}

export default MotoboyCard;
