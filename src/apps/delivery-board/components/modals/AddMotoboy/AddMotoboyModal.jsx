import Modal from '../Modal';

function AddMotoboyModal({ isOpen, onClose, onSubmit }) {
  const handleSubmit = (e) => {
    e.preventDefault();
    const motoboyName = e.target.motoboyName?.value?.trim();
    if (!motoboyName) return;
    onSubmit?.({ motoboyName });
  };

  return (
    <Modal
      isOpen={isOpen}
      title="Adicionar Motoboy"
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <input
        type="text"
        id="motoboyName"
        name="motoboyName"
        placeholder="Nome do motoboy"
        required
        autoFocus
      />
    </Modal>
  );
}

export default AddMotoboyModal;
