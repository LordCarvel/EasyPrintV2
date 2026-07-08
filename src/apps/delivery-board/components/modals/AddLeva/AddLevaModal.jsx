import { useMemo, useState } from 'react';
import Modal from '../Modal';
import { confirmAction, showAppAlert } from '../../../../../shared/ui/appDialog';
import { parsePedidos } from '../../../utils/dataHelpers';

function AddLevaModal({ isOpen, onClose, onSubmit, title = 'Adicionar Viagem', canceladosLookup }) {
  const [inputValue, setInputValue] = useState('');

  const pedidos = useMemo(() => parsePedidos(inputValue), [inputValue]);

  const canceladosEncontrados = useMemo(() => {
    if (!canceladosLookup) return [];
    return canceladosLookup(pedidos);
  }, [canceladosLookup, pedidos]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!pedidos.length) {
      void showAppAlert('Informe pelo menos um pedido (separado por linha ou virgula)');
      return;
    }

    if (canceladosEncontrados.length) {
      const lista = canceladosEncontrados.map((p) => `#${p}`).join(', ');
      const confirma = await confirmAction(`Pedidos ${lista} estao cancelados. Deseja continuar?`, {
        title: 'Pedidos cancelados',
        confirmLabel: 'Continuar',
      });
      if (!confirma) return;
    }

    onSubmit?.({ pedidos });
  };

  return (
    <Modal
      isOpen={isOpen}
      title={title}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <textarea
        id="pedidosInput"
        name="pedidosInput"
        rows="4"
        placeholder="Pedidos por linha ou separados por virgula - Enter confirma; Shift+Enter nova linha"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.target.form?.requestSubmit();
          }
        }}
      />
      {canceladosEncontrados.length > 0 && (
        <p style={{ color: '#b00020', fontSize: '0.9rem', marginTop: '0.25rem' }}>
          Encontrado(s) cancelado(s): {canceladosEncontrados.map((p) => `#${p}`).join(', ')}
        </p>
      )}
    </Modal>
  );
}

export default AddLevaModal;
