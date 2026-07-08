import { useRef, useState } from 'react';
import { promptAction, showAppAlert } from '../../../../shared/ui/appDialog';
import styles from './Controls.module.css';

function Controls({
  searchValue = '',
  onSearch,
  onAddMotoboy,
  onClearAll,
  onSetWorkspace,
  onExport,
  onImport,
  activeFilter,
  onOpenHelp,
  onStartTour,
}) {
  const [workspaceValue, setWorkspaceValue] = useState('');
  const importFileRef = useRef(null);

  const handleImportClick = () => {
    importFileRef.current?.click();
  };

  const handleImportChange = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onImport?.(file);
      e.target.value = '';
    }
  };

  const handleSetWorkspace = () => {
    const ws = workspaceValue.trim() || 'default';
    onSetWorkspace?.(ws);
    setWorkspaceValue('');
  };

  const handleCopyLink = async () => {
    const link = location.href;
    try {
      await navigator.clipboard.writeText(link);
      void showAppAlert('Link copiado para a area de transferencia');
    } catch {
      await promptAction('Copie o link abaixo:', link);
    }
  };

  return (
    <section className={styles.controls}>
      <input
        id="searchInput"
        type="text"
        placeholder="Buscar por numero do pedido"
        className="search-input"
        value={searchValue}
        onChange={(e) => onSearch?.(e.target.value)}
      />
      <div className={styles.buttonGroup}>
        {activeFilter && (
          <button
            id="clearFiltersBtn"
            className="secondary-btn"
            onClick={() => onSearch?.('')}
          >
            Limpar busca
          </button>
        )}
        <button
          id="addMotoboyBtn"
          className="primary-btn"
          onClick={onAddMotoboy}
        >
          + Motoboy
        </button>
        <button
          id="clearAllBtn"
          className="secondary-btn"
          onClick={onClearAll}
        >
          Limpar tudo
        </button>
        <button
          id="copyLinkBtn"
          className="secondary-btn"
          onClick={handleCopyLink}
        >
          Copiar link
        </button>
        <button
          id="helpBtn"
          className="secondary-btn"
          onClick={onOpenHelp}
        >
          Ajuda
        </button>
        <button
          id="tourBtn"
          className="secondary-btn"
          onClick={onStartTour}
        >
          Tutorial guiado
        </button>
      </div>
      <div className={styles.workspaceGroup}>
        <input
          id="workspaceInput"
          className="search-input"
          style={{ width: '220px' }}
          placeholder="Workspace (ex: pizzaria-123)"
          value={workspaceValue}
          onChange={(e) => setWorkspaceValue(e.target.value)}
        />
        <button
          id="setWorkspaceBtn"
          className="secondary-btn"
          onClick={handleSetWorkspace}
        >
          Definir workspace
        </button>
        <button
          id="exportBtn"
          className="secondary-btn"
          onClick={onExport}
        >
          Exportar JSON
        </button>
        <button
          id="importBtn"
          className="secondary-btn"
          onClick={handleImportClick}
        >
          Importar JSON
        </button>
        <input
          ref={importFileRef}
          id="importFile"
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={handleImportChange}
        />
      </div>
    </section>
  );
}

export default Controls;
