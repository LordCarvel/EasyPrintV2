import Modal from '../Modal';

const steps = [
  'Adicione um motoboy com o botão + Motoboy.',
  'Abra uma viagem para esse motoboy (botão + Viagem).',
  'Digite pedidos separados por linha ou vírgula para adicionar entregas na viagem.',
  'Marque entregas como entregue/cancelado/nao-entregue ou reabra para pendente.',
  'Reabra uma viagem fechada se precisar continuar usando-a.',
  'Use a busca para encontrar todos os pedidos com o mesmo número.',
];

function HelpModal({ isOpen, onClose, onDontShow }) {
  return (
    <Modal
      isOpen={isOpen}
      title="Como usar"
      onClose={onClose}
      onSubmit={onClose}
      confirmLabel="Fechar"
      hideCancel
    >
      <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingLeft: '1.2rem' }}>
        {steps.map((step, idx) => (
          <li key={idx} style={{ fontSize: '0.95rem' }}>{step}</li>
        ))}
      </ul>
      <div style={{ marginTop: '0.8rem', display: 'flex', gap: '0.5rem' }}>
        <button type="button" className="secondary-btn" onClick={onDontShow}>
          Nao mostrar novamente
        </button>
      </div>
    </Modal>
  );
}

export default HelpModal;
