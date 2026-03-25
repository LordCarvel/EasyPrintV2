import { useEffect, useState } from 'react';
import {
  DEFAULT_DELIVERY_HUB_CONFIG,
  DELIVERY_HUB_CONFIG_KEY,
  DELIVERY_HUB_PENDING_EVENTS_KEY,
  DELIVERY_HUB_PUBLISHED_ORDERS_KEY,
  flushDeliveryHubPendingEvents,
  getDeliveryHubConfig,
  getPendingDeliveryHubEvents,
  getPublishedDeliveryHubOrders,
  saveDeliveryHubConfig
} from '../../shared/integration/deliveryHub';
import './DeliveryHubConfig.css';

const getStatsSnapshot = () => ({
  pendingCount: getPendingDeliveryHubEvents().length,
  publishedCount: Object.keys(getPublishedDeliveryHubOrders()).length
});

export function DeliveryHubConfig() {
  const [form, setForm] = useState(DEFAULT_DELIVERY_HUB_CONFIG);
  const [storesText, setStoresText] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isRetrying, setIsRetrying] = useState(false);
  const [stats, setStats] = useState(getStatsSnapshot);

  useEffect(() => {
    const config = getDeliveryHubConfig();
    setForm(config);
    setStoresText(config.externalStores.join('\n'));
    setStats(getStatsSnapshot());

    const handleStorage = (event) => {
      if (
        event.key === null ||
        event.key === DELIVERY_HUB_CONFIG_KEY ||
        event.key === DELIVERY_HUB_PENDING_EVENTS_KEY ||
        event.key === DELIVERY_HUB_PUBLISHED_ORDERS_KEY
      ) {
        setStats(getStatsSnapshot());

        if (event.key === null || event.key === DELIVERY_HUB_CONFIG_KEY) {
          const nextConfig = getDeliveryHubConfig();
          setForm(nextConfig);
          setStoresText(nextConfig.externalStores.join('\n'));
        }
      }
    };

    const handleStateUpdate = () => {
      setStats(getStatsSnapshot());
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('deliveryHubStateUpdated', handleStateUpdate);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('deliveryHubStateUpdated', handleStateUpdate);
    };
  }, []);

  const handleChange = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  const handleSave = (event) => {
    event.preventDefault();

    const saved = saveDeliveryHubConfig({
      ...form,
      externalStores: storesText
    });

    setForm(saved);
    setStoresText(saved.externalStores.join('\n'));
    setFeedback('Configuracao salva localmente.');
  };

  const handleReset = () => {
    const resetConfig = saveDeliveryHubConfig(DEFAULT_DELIVERY_HUB_CONFIG);
    setForm(resetConfig);
    setStoresText(resetConfig.externalStores.join('\n'));
    setFeedback('Configuracao restaurada para o padrao.');
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    setFeedback('');

    try {
      const result = await flushDeliveryHubPendingEvents();
      setStats(getStatsSnapshot());

      if (result.reason === 'empty') {
        setFeedback('Nao ha eventos pendentes para reenviar.');
      } else if (result.reason === 'integration_not_ready') {
        setFeedback('Configure e ative a integracao antes de reenviar a fila.');
      } else if (result.reason === 'offline') {
        setFeedback('Sem conexao no momento. A fila sera tentada novamente quando voltar online.');
      } else {
        setFeedback(
          `${result.published} evento(s) publicado(s). ${result.remaining} ainda pendente(s).`
        );
      }
    } catch (error) {
      setFeedback('Falha ao tentar reenviar a fila pendente.');
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="delivery-hub-config">
      <div className="delivery-hub-header">
        <h2>Integracao Delivery Hub</h2>
        <p>Configure a publicacao automatica do evento incoming_order_registered.</p>
      </div>

      <div className="delivery-hub-summary">
        <div className="delivery-hub-summary-card">
          <strong>{stats.pendingCount}</strong>
          <span>Eventos pendentes</span>
        </div>

        <div className="delivery-hub-summary-card">
          <strong>{stats.publishedCount}</strong>
          <span>Pedidos publicados</span>
        </div>
      </div>

      <form className="delivery-hub-form" onSubmit={handleSave}>
        <label className="delivery-hub-checkbox">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) => handleChange('enabled', event.target.checked)}
          />
          <span>Ativar integracao com o Hub</span>
        </label>

        <div className="delivery-hub-field">
          <label htmlFor="deliveryHubBaseUrl">URL do Hub</label>
          <input
            id="deliveryHubBaseUrl"
            type="text"
            value={form.baseUrl}
            onChange={(event) => handleChange('baseUrl', event.target.value)}
            placeholder="http://127.0.0.1:8080"
          />
        </div>

        <div className="delivery-hub-field">
          <label htmlFor="deliveryHubProjectId">Project ID no Hub</label>
          <input
            id="deliveryHubProjectId"
            type="text"
            value={form.projectId}
            onChange={(event) => handleChange('projectId', event.target.value)}
            placeholder="Ex.: easy-print"
          />
        </div>

        <div className="delivery-hub-field">
          <label htmlFor="deliveryHubAppId">App ID</label>
          <input
            id="deliveryHubAppId"
            type="text"
            value={form.appId}
            readOnly
          />
        </div>

        <div className="delivery-hub-field">
          <label htmlFor="deliveryHubStores">Lojas externas permitidas</label>
          <textarea
            id="deliveryHubStores"
            value={storesText}
            onChange={(event) => setStoresText(event.target.value)}
            placeholder={'Uma loja por linha\nEx.: Loja Centro iFood'}
          />
          <small>Se "Enviar todos os pedidos" estiver desligado, so essas lojas publicam no Hub.</small>
        </div>

        <label className="delivery-hub-checkbox">
          <input
            type="checkbox"
            checked={form.emitAllOrders}
            onChange={(event) => handleChange('emitAllOrders', event.target.checked)}
          />
          <span>Enviar todos os pedidos</span>
        </label>

        <div className="delivery-hub-actions">
          <button type="submit">Salvar configuracao</button>
          <button type="button" className="secondary" onClick={handleReset}>
            Restaurar padrao
          </button>
          <button type="button" className="secondary" onClick={handleRetry} disabled={isRetrying}>
            {isRetrying ? 'Reenviando...' : 'Tentar reenviar fila'}
          </button>
        </div>
      </form>

      {feedback ? <p className="delivery-hub-feedback">{feedback}</p> : null}
    </div>
  );
}
