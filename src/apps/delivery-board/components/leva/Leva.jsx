import { useMemo, useState } from 'react';
import styles from './Leva.module.css';

function formatTime(value) {
  if (!value) return '--:--';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function Leva({ viagem, onAddEntrega, onAddEntregas, onClose, onReopen, onDelete, children }) {
  const [novoPedido, setNovoPedido] = useState('');
  const isOpen = viagem.status === 'aberta';

  const viagemLabel = useMemo(() => {
    const suffix = viagem.id ? viagem.id.slice(-4) : '';
    return suffix ? `#${suffix}` : '';
  }, [viagem.id]);

  const handleAddEntrega = () => {
    const raw = novoPedido.trim();
    if (!raw) return;
    const pedidos = raw
      .split(/[\n,]/)
      .map((p) => p.trim())
      .filter((p) => p !== '');

    if (!pedidos.length) return;

    if (pedidos.length === 1 || !onAddEntregas) {
      onAddEntrega?.(pedidos[0]);
    } else {
      onAddEntregas?.(pedidos);
    }
    setNovoPedido('');
  };

  return (
    <div className={styles.leva}>
      <div className={styles.levaHeader}>
        <div>
          <div className={styles.levaTitle}>
            Viagem <span className={styles.viagemId}>{viagemLabel}</span>
            <span className={styles.statusBadge} data-status={viagem.status}>{viagem.status}</span>
          </div>
          <div className={styles.levaMeta}>
            <span>Saida: {formatTime(viagem.dataHoraSaida)}</span>
            {viagem.dataHoraVolta && <span>Volta: {formatTime(viagem.dataHoraVolta)}</span>}
          </div>
        </div>
        <div className={styles.levaActions}>
          {isOpen && (
            <button
              className="secondary-btn"
              type="button"
              onClick={onClose}
            >
              Fechar viagem
            </button>
          )}
          {!isOpen && (
            <button
              className="secondary-btn"
              type="button"
              onClick={onReopen}
            >
              Reabrir viagem
            </button>
          )}
          <button
            className="secondary-btn"
            type="button"
            title="Excluir viagem"
            onClick={onDelete}
          >
            Excluir
          </button>
        </div>
      </div>

      {isOpen && (
        <div className={styles.addEntregaRow}>
          <input
            type="text"
            placeholder="Adicionar entrega (#pedido)"
            value={novoPedido}
            onChange={(e) => setNovoPedido(e.target.value)}
            data-tour="add-entrega-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddEntrega();
              }
            }}
          />
          <button
            className="primary-btn"
            type="button"
            onClick={handleAddEntrega}
          >
            + Entrega
          </button>
        </div>
      )}

      <div className={styles.levaBody}>
        {children}
      </div>
    </div>
  );
}

export default Leva;
