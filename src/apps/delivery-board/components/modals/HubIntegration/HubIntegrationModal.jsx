import { useMemo, useState } from 'react';
import Modal from '../Modal';
import styles from './HubIntegrationModal.module.css';
import { isSharedOrderDispatchable } from '../../../utils/deliveryHub';

function formatDateTime(value) {
  if (!value) return 'Ainda nao sincronizado';

  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch {
    return value;
  }
}

function HubIntegrationModal({
  isOpen,
  onClose,
  config,
  syncState,
  onSave,
  onSync,
  onFlush,
  onCopyCommand,
  onOpenWhatsapp,
  onAcknowledgeCommand,
}) {
  const [formState, setFormState] = useState(() => config);

  const dispatchableOrdersCount = useMemo(
    () => (syncState.sharedOrders || []).filter((order) => isSharedOrderDispatchable(order)).length,
    [syncState.sharedOrders]
  );

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave?.({
      ...formState,
      pollIntervalSeconds: Number(formState.pollIntervalSeconds || 20),
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      title="Integracao com o Delivery Hub"
      onClose={onClose}
      onSubmit={handleSubmit}
      confirmLabel="Salvar configuracao"
    >
      <label className={styles.toggleRow}>
        <input
          type="checkbox"
          checked={Boolean(formState.enabled)}
          onChange={(event) => setFormState((prev) => ({ ...prev, enabled: event.target.checked }))}
        />
        <span>Ativar integracao com o Hub</span>
      </label>

      <label className={styles.field}>
        <span>URL do Hub</span>
        <input
          type="text"
          value={formState.baseUrl || ''}
          placeholder="http://127.0.0.1:8080"
          onChange={(event) => setFormState((prev) => ({ ...prev, baseUrl: event.target.value }))}
        />
      </label>

      <label className={styles.field}>
        <span>Project ID no Hub</span>
        <input
          type="text"
          value={formState.projectId ?? ''}
          placeholder="Ex: 12"
          onChange={(event) => setFormState((prev) => ({ ...prev, projectId: event.target.value }))}
        />
      </label>

      <label className={styles.field}>
        <span>Intervalo de sync (segundos)</span>
        <input
          type="number"
          min="5"
          step="1"
          value={formState.pollIntervalSeconds ?? 20}
          onChange={(event) => setFormState((prev) => ({ ...prev, pollIntervalSeconds: event.target.value }))}
        />
      </label>

      <div className={styles.infoLine}>appId fixo: <strong>delivery-board</strong></div>

      <div className={styles.metaGrid}>
        <div className={styles.metaCard}>
          <span className={styles.metaLabel}>Pedidos do hub</span>
          <strong>{dispatchableOrdersCount}</strong>
        </div>
        <div className={styles.metaCard}>
          <span className={styles.metaLabel}>Eventos pendentes</span>
          <strong>{syncState.pendingEventsCount || 0}</strong>
        </div>
        <div className={styles.metaCard}>
          <span className={styles.metaLabel}>Comandos WhatsApp</span>
          <strong>{syncState.pendingCommands?.length || 0}</strong>
        </div>
      </div>

      <div className={styles.actionsRow}>
        <button type="button" className="secondary-btn" onClick={onSync} disabled={syncState.isSyncing}>
          {syncState.isSyncing ? 'Sincronizando...' : 'Sincronizar agora'}
        </button>
        <button type="button" className="secondary-btn" onClick={onFlush} disabled={syncState.isSyncing}>
          Reenviar fila
        </button>
      </div>

      <div className={styles.statusBox} data-error={syncState.lastError ? 'true' : 'false'}>
        <div>Ultimo sync: {formatDateTime(syncState.lastSyncAt)}</div>
        {syncState.lastError ? <div>Erro: {syncState.lastError}</div> : <div>Pronto para publicar rodas e consumir comandos.</div>}
        {syncState.publishFeedback ? (
          <div className={styles.statusInline} data-tone={syncState.publishFeedback.tone || 'info'}>
            Ultima publicacao: {syncState.publishFeedback.message}
          </div>
        ) : null}
      </div>

      <div className={styles.commandSection}>
        <div className={styles.sectionTitle}>Fila local de publicacao</div>

        {syncState.pendingEvents?.length ? (
          <div className={styles.pendingEventList}>
            {syncState.pendingEvents.map((event) => (
              <div key={event.queueKey} className={styles.pendingEventCard}>
                <div className={styles.commandHeader}>
                  <strong>{event.event || 'evento pendente'}</strong>
                  <span>{event.sourceRunId || 'sem sourceRunId'}</span>
                </div>
                <div className={styles.pendingEventMeta}>
                  <span>Tentativas: {event.retries || 0}</span>
                  <span>Ultima tentativa: {formatDateTime(event.lastAttemptAt)}</span>
                </div>
                <div className={styles.pendingEventError}>
                  {event.lastError || 'Aguardando reenvio automatico.'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            Nenhum evento local aguardando reenvio.
          </div>
        )}
      </div>

      <div className={styles.commandSection}>
        <div className={styles.sectionTitle}>Comandos pendentes do Hub</div>

        {syncState.pendingCommands?.length ? (
          <div className={styles.commandList}>
            {syncState.pendingCommands.map((command) => {
              const payload = command.payload || {};
              const ordersLabel = Array.isArray(payload.orders)
                ? payload.orders.map((item) => item?.sourceOrderId).filter(Boolean).join(', ')
                : '';

              return (
                <div key={command.id} className={styles.commandCard}>
                  <div className={styles.commandHeader}>
                    <strong>{payload.destinationLabel || payload.sourceBranchName || payload.sourceBranchId || 'Filial externa'}</strong>
                    <span>{command.command}</span>
                  </div>
                  <div className={styles.commandMeta}>
                    <span>Numero: {payload.destinationWhatsappNumber || 'Nao configurado'}</span>
                    <span>Pedidos: {ordersLabel || 'Sem pedidos'}</span>
                  </div>
                  <textarea
                    readOnly
                    value={payload.messageText || 'Nenhuma mensagem gerada pelo Hub.'}
                    rows={4}
                  />
                  <div className={styles.commandActions}>
                    <button type="button" className="secondary-btn" onClick={() => onCopyCommand?.(command)}>
                      Copiar mensagem
                    </button>
                    <button type="button" className="secondary-btn" onClick={() => onOpenWhatsapp?.(command)}>
                      Abrir WhatsApp
                    </button>
                    <button type="button" className="secondary-btn" onClick={() => onAcknowledgeCommand?.(command)}>
                      Marcar como processado
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyState}>Nenhum comando pendente no momento.</div>
        )}
      </div>
    </Modal>
  );
}

export default HubIntegrationModal;
