import { useMemo } from 'react';
import { useAppState } from '../../shared/context/AppStateContext';
import { Icon } from '../../shared/ui/Icon';
import { formatCurrency } from '../../shared/utils/calculations';
import './DeliveryHubConfig.css';

const formatDateTime = (value) => {
  if (!value) return 'Ainda nao sincronizado';

  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch (error) {
    return value;
  }
};

export function DeliveryHubConfig() {
  const { appState, isHubSyncing, actions } = useAppState();

  const logs = useMemo(
    () => appState.hubSync.lastAppliedCommands.slice().reverse(),
    [appState.hubSync.lastAppliedCommands]
  );

  const statusText = appState.hubSync.lastError
    ? appState.hubSync.lastError
    : appState.hubSync.lastSyncAt
      ? `Ultima sincronizacao em ${formatDateTime(appState.hubSync.lastSyncAt)}`
      : 'Hub pronto para sincronizar.';

  return (
    <div className="page-shell">
      <section className="page-hero">
        <div>
          <p className="page-eyebrow">Delivery Hub</p>
          <h2 className="page-title">Integracao separada do fluxo de fechamento</h2>
          <p className="page-description">
            Esta pagina concentra a configuracao do hub, o polling de comandos e o historico das ultimas acoes aplicadas no app.
          </p>
        </div>

        <div className="page-hero-meta">
          <div className={`status-note ${appState.hubSync.lastError ? 'status-note-error' : ''}`}>
            {statusText}
          </div>
          <div className="status-note">
            Comandos processados localmente: <strong>{appState.processedCommandIds.length}</strong>
          </div>
        </div>
      </section>

      <section className="hub-layout">
        <article className="card">
          <div className="section-header">
            <div className="section-heading">
              <h3 className="section-title">Conexao com o Hub</h3>
              <p className="section-description">
                O app consulta comandos pendentes, aplica localmente e confirma cada comando com ack.
              </p>
            </div>

            <div className="section-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => actions.synchronizeHub()}
                disabled={isHubSyncing}
              >
                <Icon name="refresh" size={16} />
                {isHubSyncing ? 'Sincronizando...' : 'Sincronizar agora'}
              </button>
            </div>
          </div>

          <div className="hub-form-grid">
            <label className="field field-checkbox">
              <input
                type="checkbox"
                checked={appState.hubConfig.enabled}
                onChange={(event) => actions.setHubConfigField('enabled', event.target.checked)}
              />
              <div>
                <div className="field-label">Ativar sincronizacao com o hub</div>
                <div className="field-helper">Quando ligado, o app faz polling automatico e retry ao voltar online.</div>
              </div>
            </label>

            <label className="field">
              <span className="field-label">Base URL</span>
              <input
                type="text"
                className="input"
                value={appState.hubConfig.baseUrl}
                placeholder="http://127.0.0.1:8080"
                onChange={(event) => actions.setHubConfigField('baseUrl', event.target.value)}
              />
            </label>

            <label className="field">
              <span className="field-label">Project ID</span>
              <input
                type="text"
                className="input"
                value={appState.hubConfig.projectId}
                placeholder="Ex.: 3"
                onChange={(event) => actions.setHubConfigField('projectId', event.target.value)}
              />
            </label>

            <label className="field">
              <span className="field-label">App ID</span>
              <input type="text" className="input" value={appState.hubConfig.appId} readOnly />
            </label>

            <label className="field">
              <span className="field-label">Intervalo de polling (segundos)</span>
              <input
                type="number"
                min="5"
                step="1"
                className="input"
                value={appState.hubConfig.pollIntervalSeconds}
                onChange={(event) => actions.setHubConfigField('pollIntervalSeconds', event.target.value)}
              />
            </label>

            <label className="field">
              <span className="field-label">Taxa padrao para comandos de entrega</span>
              <select
                className="select"
                value={appState.hubConfig.defaultRateId}
                onChange={(event) => actions.setHubConfigField('defaultRateId', event.target.value)}
              >
                {appState.rateConfigs.map((rate) => (
                  <option key={rate.id} value={rate.id}>
                    {rate.name} (R$ {formatCurrency(rate.value)})
                  </option>
                ))}
              </select>
            </label>
          </div>
        </article>

        <aside className="hub-side-column">
          <article className="card">
            <div className="section-heading">
              <h3 className="section-title">Estado atual</h3>
              <p className="section-description">
                Informacoes rapidas para diagnostico sem sair desta pagina.
              </p>
            </div>

            <div className="meta-list">
              <div className="meta-list-item">
                <div className="meta-list-label">Sincronizacao</div>
                <div className="meta-list-value">{appState.hubConfig.enabled ? 'Ativa' : 'Desligada'}</div>
              </div>

              <div className="meta-list-item">
                <div className="meta-list-label">Project ID</div>
                <div className="meta-list-value">{appState.hubConfig.projectId || '-'}</div>
              </div>

              <div className="meta-list-item">
                <div className="meta-list-label">Polling</div>
                <div className="meta-list-value">{appState.hubConfig.pollIntervalSeconds}s</div>
              </div>

              <div className="meta-list-item">
                <div className="meta-list-label">Taxa padrao</div>
                <div className="meta-list-value">
                  {appState.rateConfigs.find((rate) => rate.id === appState.hubConfig.defaultRateId)?.name || '-'}
                </div>
              </div>
            </div>
          </article>

          <article className="card">
            <div className="section-heading">
              <h3 className="section-title">Ultimas acoes</h3>
              <p className="section-description">
                Historico local dos ultimos comandos aplicados pelo hub.
              </p>
            </div>

            {logs.length ? (
              <ul className="hub-log-list">
                {logs.map((entry, index) => (
                  <li key={`${entry.createdAt}-${index}`} className="hub-log-item">
                    <strong>{formatDateTime(entry.createdAt)}</strong>
                    <span>{entry.message}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-state">Nenhuma sincronizacao aplicada ainda.</p>
            )}
          </article>
        </aside>
      </section>

      <section className="contract-grid">
        <article className="card">
          <div className="section-heading">
            <h3 className="section-title">Comandos aceitos</h3>
            <p className="section-description">
              O manifesto da raiz continua sendo a referencia do contrato deste app com o hub.
            </p>
          </div>

          <div className="contract-list">
            <div className="contract-list-item">
              <strong>apply_incoming_order_to_cash</strong>
              <span>Adiciona pedido recebido ao fechamento local, com rateio em dinheiro, cartao e online quando vier do EasyPrint.</span>
            </div>

            <div className="contract-list-item">
              <strong>increment_courier_dispatched_orders</strong>
              <span>Incrementa entregas do motoboy usando a taxa padrao configurada.</span>
            </div>
          </div>
        </article>

        <article className="card">
          <div className="section-heading">
            <h3 className="section-title">Contrato publicado</h3>
            <p className="section-description">
              Arquivo manifesto disponivel na raiz: <code>delivery-hub.integration.json</code>.
            </p>
          </div>

          <div className="contract-list">
            <div className="contract-list-item">
              <strong>appId</strong>
              <span>{appState.hubConfig.appId}</span>
            </div>

            <div className="contract-list-item">
              <strong>Evento publicado</strong>
              <span>courier_cash_adjusted</span>
            </div>

            <div className="contract-list-item">
              <strong>Snapshot declarado</strong>
              <span>courier_night_cash</span>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
