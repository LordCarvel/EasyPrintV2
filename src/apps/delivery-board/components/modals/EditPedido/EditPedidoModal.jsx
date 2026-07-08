import Modal from '../Modal';
import { confirmAction } from '../../../../../shared/ui/appDialog';
import styles from './EditPedidoModal.module.css';

function EditPedidoModal({ isOpen, onClose, onSubmit, entrega, viagemOptions = [] }) {
  if (!isOpen || !entrega) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const numeroPedido = e.target.pedidoNumber?.value?.trim();
    const targetViagemId = e.target.viagemDestino?.value || entrega.viagemId;
    const statusEntrega = e.target.statusEntrega?.value || entrega.statusEntrega;
    onSubmit?.({ action: 'update', numeroPedido, targetViagemId, statusEntrega });
  };

  const handleDelete = async () => {
    if (await confirmAction('Apagar esta entrega?')) {
      onSubmit?.({ action: 'delete' });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      title="Editar Entrega"
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <input
        type="text"
        id="pedidoNumber"
        name="pedidoNumber"
        placeholder="Numero do pedido"
        defaultValue={entrega.numeroPedido || ''}
        required
        autoFocus
      />
      <label htmlFor="viagemDestino">Mover para viagem:</label>
      <select id="viagemDestino" name="viagemDestino" defaultValue={entrega.viagemId} required>
        {viagemOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <label htmlFor="statusEntrega">Status da entrega:</label>
      <select
        id="statusEntrega"
        name="statusEntrega"
        defaultValue={entrega.statusEntrega || 'pendente'}
        required
      >
        <option value="pendente">Pendente</option>
        <option value="entregue">Entregue</option>
        <option value="nao-entregue">Nao entregue</option>
        <option value="cancelado">Cancelado</option>
      </select>
      <div className={styles.deleteContainer}>
        <button
          type="button"
          onClick={handleDelete}
          className="secondary-btn"
        >
          Apagar entrega
        </button>
      </div>
    </Modal>
  );
}

export default EditPedidoModal;
