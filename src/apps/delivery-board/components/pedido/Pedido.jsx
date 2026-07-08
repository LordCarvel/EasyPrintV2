import styles from './Pedido.module.css';

const STATUS_LABELS = {
  pendente: 'pendente',
  entregue: 'entregue',
  'nao-entregue': 'nao-entregue',
  cancelado: 'cancelado',
};

function Pedido({
  numeroPedido,
  statusEntrega = 'pendente',
  highlighted = false,
  externalOrigin = false,
  originLabel = '',
  onClick,
  onReopen,
}) {
  const statusKey = STATUS_LABELS[statusEntrega] || 'pendente';
  const normalizedNumber = String(numeroPedido || '').replace(/^#/, '');
  const branchLabel = originLabel || 'Outra filial';

  return (
    <div
      className={styles.pedido}
      data-status={statusKey}
      data-highlighted={highlighted ? 'true' : 'false'}
      data-external={externalOrigin ? 'true' : 'false'}
      data-tour="pedido-item"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick?.();
        }
        if (event.key === 'r' && statusKey !== 'pendente') {
          onReopen?.();
        }
      }}
      onDoubleClick={() => {
        if (statusKey !== 'pendente') onReopen?.();
      }}
    >
      <div className={styles.mainInfo}>
        <span className={styles.numero}>#{normalizedNumber}</span>
        {externalOrigin && (
          <span className={styles.branchBadge} title={branchLabel}>
            {branchLabel}
          </span>
        )}
      </div>
      <span className={styles.status}>{statusKey}</span>
      {statusKey !== 'pendente' && (
        <button
          type="button"
          className={styles.reopen}
          title="Reabrir (voltar para pendente)"
          onClick={(event) => {
            event.stopPropagation();
            onReopen?.();
          }}
        >
          R
        </button>
      )}
    </div>
  );
}

export default Pedido;
