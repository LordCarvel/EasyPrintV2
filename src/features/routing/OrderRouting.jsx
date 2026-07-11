import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../shared/ui/Icon';
import { confirmAction, showAppAlert } from '../../shared/ui/appDialog';
import { clearCurrentStoreId, getCurrentStoreId, getSessionToken, routingApi, setAuthSession } from './routingApi';
import { printRoutedOrderText } from './directOrderPrint';
import { loadStoreSettings, saveStoreSettingsPatch } from './storeSettingsClient';
import { formatCurrency, parseIfoodFinancial } from '../../../shared/routing/ifoodFinancial';
import './OrderRouting.css';

const SAMPLE_ORDER = `6391
ricardo dom

PIZZA PARK
PIZZA PARK
Localizador 6874 6115
Entrega prevista:19:55

Av. Eugênio Krause, 3650 - Armação Penha - Penha●88385000
Apto 303A
Entrega própria

Itens no pedido
Pizza 35cm (8 Fatias)
R$ 47,99
1
Americana
R$ 0,00`;

const TABS = [
  { id: 'send', label: 'Enviar pedido' },
  { id: 'profile', label: 'Minha loja' },
  { id: 'received', label: 'Fila recebida' },
  { id: 'sent', label: 'Enviados' }
];

const formatDateTime = (value) => {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  } catch {
    return '-';
  }
};

const areaTextToInput = (value = []) => Array.isArray(value) ? value.join(', ') : String(value || '');

const paymentLabels = {
  dinheiro: 'Dinheiro',
  cartao: 'Cartao',
  online: 'Online'
};

const getTimestamp = (value) => {
  const timestamp = new Date(value || '').getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const isSentCashOpenOrder = (order = {}, sentCashClearedAt = '') => {
  const clearedTimestamp = getTimestamp(sentCashClearedAt);
  if (!clearedTimestamp) return true;

  const orderTimestamp = getTimestamp(order.createdAt);
  return !orderTimestamp || orderTimestamp > clearedTimestamp;
};

const formatSentCashClearedAt = (value) => {
  const timestamp = getTimestamp(value);
  if (!timestamp) return '';

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp));
};

const RESEND_STATUS = 'reenviado';

const isResentOrder = (order = {}) => Boolean(order.isResend || order.status === RESEND_STATUS);

const getOrderCashKey = (order = {}) =>
  String(order.orderNumber || order.parsedData?.orderNumber || order.parsedData?.locator || '').trim();

const getSentOrderFinancial = (order = {}) => {
  const parsedFinancial = order.parsedData?.financial;
  const fallbackFinancial = parsedFinancial || parseIfoodFinancial(order.rawText || order.parsedData?.rawText || '');
  const deductionValue = Number(
    fallbackFinancial?.deductionValue ??
    fallbackFinancial?.totalValue ??
    fallbackFinancial?.subtotalValue ??
    0
  ) || 0;
  const paymentMethod = fallbackFinancial?.paymentMethod || 'online';

  return {
    ...fallbackFinancial,
    deductionValue,
    paymentMethod,
    hasFinancialData: Boolean(fallbackFinancial?.hasFinancialData || deductionValue > 0)
  };
};

const buildSentCashRows = (orders = []) => {
  const seenCashKeys = new Set();

  return orders.map((order) => {
    const financial = getSentOrderFinancial(order);
    const canceled = order.status === 'cancelado';
    const cashKey = getOrderCashKey(order);
    const duplicateCashEntry = Boolean(cashKey && seenCashKeys.has(cashKey));
    if (cashKey) seenCashKeys.add(cashKey);

    return {
      id: order.id,
      order,
      financial,
      canceled,
      duplicateCashEntry,
      isResend: isResentOrder(order),
      customerName: order.customerName || order.parsedData?.customerName || 'Cliente nao identificado',
      orderNumber: order.orderNumber || order.parsedData?.orderNumber || order.parsedData?.locator || 'Pedido',
      targetStoreName: order.targetStoreName || 'Loja destino',
      createdAt: order.createdAt
    };
  });
};

const buildSentCashStats = (rows = []) => {
  const base = {
    total: 0,
    online: 0,
    dinheiro: 0,
    cartao: 0,
    activeCount: 0,
    missingCount: 0,
    canceledCount: 0,
    duplicateCount: 0
  };

  return rows.reduce((stats, row) => {
    if (row.duplicateCashEntry) {
      stats.duplicateCount += 1;
      return stats;
    }

    if (row.canceled) {
      stats.canceledCount += 1;
      return stats;
    }

    stats.activeCount += 1;

    if (!row.financial.hasFinancialData) {
      stats.missingCount += 1;
    }

    const value = row.financial.deductionValue || 0;
    stats.total += value;

    if (row.financial.paymentMethod === 'dinheiro') {
      stats.dinheiro += value;
    } else if (row.financial.paymentMethod === 'cartao') {
      stats.cartao += value;
    } else {
      stats.online += value;
    }

    return stats;
  }, base);
};

function Field({ label, hint, children }) {
  return (
    <label className="routing-field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function StatusBadge({ status }) {
  return <span className={`routing-status routing-status-${status}`}>{status || 'enviado'}</span>;
}

function AddressSummary({ parsedData }) {
  const address = parsedData?.address || {};

  return (
    <div className="routing-address-summary">
      <div>
        <span>Pedido</span>
        <strong>{parsedData?.orderNumber || '-'}</strong>
      </div>
      <div>
        <span>Cliente</span>
        <strong>{parsedData?.customerName || '-'}</strong>
      </div>
      <div className="wide">
        <span>Endereco</span>
        <strong>{address.display || address.raw || '-'}</strong>
      </div>
      <div>
        <span>Bairro</span>
        <strong>{address.neighborhood || '-'}</strong>
      </div>
      <div>
        <span>Cidade</span>
        <strong>{address.city || '-'}</strong>
      </div>
    </div>
  );
}

function SetupScreen({ onConfigured }) {
  const [stores, setStores] = useState([]);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [form, setForm] = useState({ name: 'Minha loja', city: '', username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadStores = async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await routingApi.listSetupStores();
      setStores(payload.stores || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStores();
  }, []);

  const lockSession = (session) => {
    setAuthSession(session);
    onConfigured(session.store.id);
  };

  const login = async () => {
    if (!loginForm.username.trim() || !loginForm.password) {
      void showAppAlert('Informe usuario e senha da loja.');
      return;
    }

    try {
      const session = await routingApi.login(loginForm);
      lockSession(session);
    } catch (err) {
      setError(err.message);
    }
  };

  const createStore = async () => {
    if (!form.name.trim() || !form.username.trim() || !form.password) {
      void showAppAlert('Informe nome, usuario e senha da loja.');
      return;
    }

    try {
      const payload = await routingApi.createSetupStore(form);
      const session = await routingApi.login({ username: form.username, password: form.password });
      lockSession(session);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="order-routing setup">
      <section className="routing-panel">
        <div className="routing-page-header compact">
          <div>
            <h2>Entrar na loja</h2>
            <p>Use o usuario e senha da loja. Depois esta maquina fica presa nessa sessão.</p>
          </div>
        </div>

        {error ? <div className="routing-error">{error}</div> : null}
        {loading ? <div className="routing-empty-state">Carregando lojas...</div> : null}

        <div className="routing-login-grid">
          <Field label="Usuario da loja">
            <input
              value={loginForm.username}
              onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void login();
              }}
            />
          </Field>

          <Field label="Senha">
            <input
              type="password"
              value={loginForm.password}
              onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void login();
              }}
            />
          </Field>
        </div>

        <button type="button" className="routing-primary-action" onClick={login}>
          Entrar
        </button>

        <p className="routing-note">Lojas iniciais: usuario penha, gravata ou sao-domingos. Senha inicial: 1234.</p>

        <div className="routing-store-list">
          {stores.map((store) => (
            <article key={store.id} className="routing-readonly-store">
              <div>
                <strong>{store.name}</strong>
                <span>{store.city || 'Sem regiao informada'}</span>
              </div>
              <small>Usuario: {store.username || store.id}</small>
              <p>{areaTextToInput(store.serviceAreas) || 'Sem areas cadastradas'}</p>
            </article>
          ))}
        </div>

        <div className="routing-divider" />

        <h3 className="routing-subtitle">Criar novo perfil</h3>
        <Field label="Nome da loja">
          <input
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          />
        </Field>
        <Field label="Cidade / regiao">
          <input
            value={form.city}
            onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
          />
        </Field>
        <Field label="Usuario">
          <input
            value={form.username}
            onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
          />
        </Field>
        <Field label="Senha">
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
          />
        </Field>
        <button type="button" className="routing-primary-action" onClick={createStore}>
          Criar e entrar
        </button>
      </section>
    </div>
  );
}

export function OrderRouting() {
  const navigate = useNavigate();
  const [currentStoreId, setStoreIdState] = useState(() => (getSessionToken() ? getCurrentStoreId() : ''));
  const [activeTab, setActiveTab] = useState('send');
  const [me, setMe] = useState(null);
  const [profileForm, setProfileForm] = useState(null);
  const [orderText, setOrderText] = useState(SAMPLE_ORDER);
  const [routePreview, setRoutePreview] = useState(null);
  const [targetStoreId, setTargetStoreId] = useState('');
  const [routeConfirmed, setRouteConfirmed] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [receivedOrders, setReceivedOrders] = useState([]);
  const [sentOrders, setSentOrders] = useState([]);
  const [sentCashClearedAt, setSentCashClearedAt] = useState('');
  const [sentCashBusy, setSentCashBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackType, setFeedbackType] = useState('success');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  const currentStore = me?.store;
  const allowedTargets = routePreview?.allowedTargets || me?.allowedTargets || [];
  const selectedTarget = allowedTargets.find((store) => store.id === targetStoreId);
  const otherStores = (me?.stores || []).filter((store) => store.id !== currentStore?.id);
  const openSentCashOrders = useMemo(
    () => sentOrders.filter((order) => isSentCashOpenOrder(order, sentCashClearedAt)),
    [sentOrders, sentCashClearedAt]
  );
  const sentCashRows = useMemo(() => buildSentCashRows(openSentCashOrders), [openSentCashOrders]);
  const sentCashStats = useMemo(() => buildSentCashStats(sentCashRows), [sentCashRows]);
  const connectionsByTarget = useMemo(() => {
    const map = new Map();
    (me?.connections || []).forEach((connection) => {
      map.set(connection.targetStoreId, connection);
    });
    return map;
  }, [me?.connections]);

  const loadMe = async () => {
    if (!getCurrentStoreId()) return;

    try {
      const payload = await routingApi.getMe();
      setMe(payload);
      setProfileForm({
        name: payload.store.name || '',
        username: payload.store.username || '',
        password: '',
        city: payload.store.city || '',
        serviceAreas: areaTextToInput(payload.store.serviceAreas),
        reviewAreas: areaTextToInput(payload.store.reviewAreas),
        receivesOrders: payload.store.receivesOrders,
        autoPrint: payload.store.autoPrint
      });
      setApiError('');
    } catch (err) {
      setApiError(err.message);
      if (err.status === 401) {
        clearCurrentStoreId();
        setStoreIdState('');
      }
    }
  };

  const loadOrders = async () => {
    if (!getCurrentStoreId()) return;

    try {
      const [received, sent, settings] = await Promise.all([
        routingApi.listReceivedOrders(),
        routingApi.listSentOrders(),
        loadStoreSettings()
      ]);
      setReceivedOrders(received.orders || []);
      setSentOrders(sent.orders || []);
      setSentCashClearedAt(settings.sentCashClearedAt || '');
    } catch (err) {
      setApiError(err.message);
    }
  };

  useEffect(() => {
    if (!currentStoreId) return;
    void loadMe();
    void loadOrders();
  }, [currentStoreId]);

  const handleConfigured = (storeId) => {
    setStoreIdState(storeId);
  };

  const showFeedback = (message, type = 'success') => {
    setFeedback(message);
    setFeedbackType(type);
  };

  const resetStore = async () => {
    const confirmed = await confirmAction(
      'Isso vai desconfigurar a loja atual neste computador. Use apenas se instalou na loja errada.',
      { title: 'Trocar loja desta maquina', confirmLabel: 'Resetar loja' }
    );
    if (!confirmed) return;
    try {
      await routingApi.logout();
    } catch {
      // A sessao local ainda deve ser limpa mesmo se a API estiver fora.
    }
    clearCurrentStoreId();
    setStoreIdState('');
    setMe(null);
    setRoutePreview(null);
    setConfirmModalOpen(false);
  };

  const pasteOrder = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (clipboardText) {
        setOrderText(clipboardText);
        await detectRoute(clipboardText);
        return;
      }
    } catch (err) {
      console.error('Falha ao ler clipboard do navegador', err);
    }

    try {
      const desktopText = window.easyHubDesktop?.readClipboard?.();
      if (desktopText) {
        setOrderText(desktopText);
        await detectRoute(desktopText);
        return;
      }
    } catch (err) {
      console.error('Falha ao ler clipboard do Electron', err);
    }

    void showAppAlert('Cole o pedido manualmente no campo de texto.');
  };

  const detectRoute = async (value = orderText) => {
    const rawText = value.trim();
    if (!rawText) {
      void showAppAlert('Cole um pedido antes de detectar.');
      return;
    }

    setLoading(true);
    setFeedback('');
    setFeedbackType('success');
    setRouteConfirmed(false);
    try {
      const payload = await routingApi.parseRoute(rawText);
      setRoutePreview(payload);
      setTargetStoreId(payload.routeResult?.suggestedStoreId || '');
      setConfirmModalOpen(true);
    } catch (err) {
      setApiError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const printCurrentOrder = async () => {
    const rawText = orderText.trim();
    if (!rawText) {
      void showAppAlert('Cole um pedido antes de imprimir.');
      return;
    }

    try {
      await printRoutedOrderText(rawText);
    } catch (err) {
      void showAppAlert(err.message || 'Falha ao imprimir pedido.', { tone: 'danger' });
    }
  };

  const sendOrder = async (confirmedByModal = false) => {
    if (!targetStoreId) {
      void showAppAlert('Escolha a loja de destino.');
      return;
    }

    const reviewConfirmed = routeConfirmed || confirmedByModal;

    if (routePreview?.routeResult?.requiresReview && !reviewConfirmed) {
      setConfirmModalOpen(true);
      return;
    }

    setLoading(true);
    try {
      const payload = await routingApi.createOrder({
        rawText: orderText,
        targetStoreId,
        routeConfirmed: reviewConfirmed
      });
      if (payload.duplicate || payload.order?.isResend) {
        showFeedback(
          payload.message || 'Atencao: este pedido esta sendo enviado novamente. Ele nao sera lancado outra vez no caixa.',
          'warning'
        );
      } else {
        showFeedback(payload.message || 'Pedido enviado para a fila.');
      }
      setOrderText('');
      setRoutePreview(null);
      setTargetStoreId('');
      setRouteConfirmed(false);
      setConfirmModalOpen(false);
      setActiveTab('sent');
      await loadOrders();
    } catch (err) {
      if (err.payload?.requiresReview) {
        setRoutePreview({
          parsedData: err.payload.parsedData,
          routeResult: err.payload.routeResult,
          allowedTargets
        });
        setConfirmModalOpen(true);
      }
      void showAppAlert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!confirmModalOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (!loading) void sendOrder(true);
      }

      if (event.key === 'Escape') {
        setConfirmModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmModalOpen, loading, orderText, routeConfirmed, routePreview, targetStoreId]);

  const saveProfile = async () => {
    if (!profileForm?.name.trim()) {
      void showAppAlert('Informe o nome da loja.');
      return;
    }

    try {
      await routingApi.saveMyStore(profileForm);
      window.dispatchEvent(new CustomEvent('storeProfileReloadRequested'));
      showFeedback('Perfil da loja salvo.');
      await loadMe();
    } catch (err) {
      void showAppAlert(err.message);
    }
  };

  const toggleConnection = async (targetId, checked) => {
    try {
      await routingApi.setConnection(targetId, checked);
      await loadMe();
    } catch (err) {
      void showAppAlert(err.message);
    }
  };

  const markPrinted = async (order) => {
    try {
      await routingApi.markPrinted(order.id, order.version);
      await loadOrders();
    } catch (err) {
      if (err.status === 409) {
        await loadOrders();
      }
      void showAppAlert(err.message);
    }
  };

  const printReceivedOrder = async (order) => {
    if (!order?.rawText) {
      void showAppAlert('Esse pedido nao tem texto bruto salvo para imprimir.');
      return;
    }

    try {
      const payload = await routingApi.markPrinted(order.id, order.version);
      await printRoutedOrderText(order.rawText, {
        skipCash: isResentOrder(order)
      });
      if (payload.order) {
        setReceivedOrders((current) =>
          current.map((item) => (item.id === payload.order.id ? payload.order : item))
        );
      }
      await loadOrders();
    } catch (err) {
      if (err.status === 409) {
        await loadOrders();
      }
      void showAppAlert(err.message || 'Falha ao imprimir pedido.', { tone: 'danger' });
    }
  };

  const cancelOrder = async (order) => {
    if (!(await confirmAction('Cancelar/remover este pedido da fila?'))) return;
    try {
      await routingApi.cancelOrder(order.id, order.version);
      await loadOrders();
    } catch (err) {
      if (err.status === 409) {
        await loadOrders();
      }
      void showAppAlert(err.message);
    }
  };

  useEffect(() => {
    if (!currentStoreId) return undefined;

    const timer = window.setInterval(() => {
      void loadOrders();
    }, 10000);

    return () => window.clearInterval(timer);
  }, [currentStoreId]);

  useEffect(() => {
    const handleReceivedOrdersUpdate = (event) => {
      if (Array.isArray(event.detail?.orders)) {
        setReceivedOrders(event.detail.orders);
      }
    };

    window.addEventListener('easyhubReceivedOrdersUpdated', handleReceivedOrdersUpdate);
    return () => window.removeEventListener('easyhubReceivedOrdersUpdated', handleReceivedOrdersUpdate);
  }, []);

  const clearSentCashDay = async () => {
    if (!sentCashRows.length) {
      void showAppAlert('Nao ha saidas abertas para limpar.');
      return;
    }

    const confirmed = await confirmAction(
      'Isso limpa apenas o caixa dos pedidos enviados deste dia. Os pedidos continuam salvos no historico e novos envios entram normalmente.',
      { title: 'Limpar caixa dos enviados', confirmLabel: 'Limpar dia' }
    );
    if (!confirmed) return;

    setSentCashBusy(true);
    try {
      const nextClearedAt = new Date().toISOString();
      const settings = await saveStoreSettingsPatch({ sentCashClearedAt: nextClearedAt });
      setSentCashClearedAt(settings.sentCashClearedAt || nextClearedAt);
      showFeedback('Caixa dos enviados limpo. Novos pedidos enviados entram no proximo fechamento.');
      await loadOrders();
    } catch (err) {
      void showAppAlert(err.message || 'Falha ao limpar caixa dos enviados.', { tone: 'danger' });
    } finally {
      setSentCashBusy(false);
    }
  };

  const reopenSentCashDay = async () => {
    const confirmed = await confirmAction(
      'Isso volta a mostrar os pedidos enviados anteriores nos totais de saida.',
      { title: 'Reabrir caixa dos enviados', confirmLabel: 'Reabrir' }
    );
    if (!confirmed) return;

    setSentCashBusy(true);
    try {
      const settings = await saveStoreSettingsPatch({ sentCashClearedAt: '' });
      setSentCashClearedAt(settings.sentCashClearedAt || '');
      showFeedback('Caixa dos enviados reaberto.');
      await loadOrders();
    } catch (err) {
      void showAppAlert(err.message || 'Falha ao reabrir caixa dos enviados.', { tone: 'danger' });
    } finally {
      setSentCashBusy(false);
    }
  };

  const exportSentCashReport = () => {
    const rows = sentCashRows.filter((row) => !row.canceled && !row.duplicateCashEntry);
    const report = [
      'RELATORIO DE DESCONTO IFOOD',
      '='.repeat(50),
      '',
      `Loja origem: ${currentStore?.name || '-'}`,
      `Data: ${new Date().toLocaleDateString('pt-BR')}`,
      `Hora: ${new Date().toLocaleTimeString('pt-BR')}`,
      '',
      'RESUMO',
      '='.repeat(50),
      `Total a descontar: ${formatCurrency(sentCashStats.total)}`,
      `Online: ${formatCurrency(sentCashStats.online)}`,
      `Cartao: ${formatCurrency(sentCashStats.cartao)}`,
      `Dinheiro: ${formatCurrency(sentCashStats.dinheiro)}`,
      `Pedidos ativos: ${sentCashStats.activeCount}`,
      `Sem valor detectado: ${sentCashStats.missingCount}`,
      `Cancelados ignorados: ${sentCashStats.canceledCount}`,
      '',
      'PEDIDOS ENVIADOS',
      '='.repeat(50),
      ...rows.map((row) => (
        `#${row.orderNumber} | ${row.customerName} | ${row.targetStoreName} | ${paymentLabels[row.financial.paymentMethod] || 'Online'} | ${formatCurrency(row.financial.deductionValue)} | ${formatDateTime(row.createdAt)}`
      )),
      '',
      '='.repeat(50)
    ].join('\n');
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `desconto_ifood_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.txt`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  if (!currentStoreId) {
    return <SetupScreen onConfigured={handleConfigured} />;
  }

  const renderSend = () => (
    <section className="routing-panel routing-send-panel">
      <div className="routing-section-title">
        <h3>Cole o pedido</h3>
        <button type="button" onClick={pasteOrder} disabled={loading}>
          <Icon name="copy" size={15} />
          Colar
        </button>
      </div>

      <textarea
        className="routing-order-textarea"
        value={orderText}
        onPaste={(event) => {
          const textarea = event.currentTarget;
          window.setTimeout(() => {
            if (textarea.value.trim()) void detectRoute(textarea.value);
          }, 0);
        }}
        onChange={(event) => {
          setOrderText(event.target.value);
          setRoutePreview(null);
          setRouteConfirmed(false);
          setConfirmModalOpen(false);
        }}
        placeholder="Cole aqui o texto bruto do iFood"
      />

      <div className="routing-send-actions">
        <button type="button" className="routing-secondary-action" onClick={printCurrentOrder} disabled={loading}>
          <Icon name="print" size={16} />
          Imprimir neste caixa
        </button>

        <button type="button" className="routing-secondary-action" onClick={() => detectRoute()} disabled={loading}>
          Detectar destino
        </button>

        {routePreview ? (
          <button
            type="button"
            className="routing-primary-action"
            onClick={() => setConfirmModalOpen(true)}
            disabled={loading}
          >
            <Icon name="send" size={16} />
            Confirmar envio
          </button>
        ) : null}
      </div>

      {routePreview ? (
        <div className={`routing-suggestion ${routePreview.routeResult?.requiresReview ? 'warning' : 'ok'}`}>
          <span>Loja sugerida</span>
          <strong>{selectedTarget?.name || 'Escolha a loja destino'}</strong>
          <small>{routePreview.routeResult?.reason || 'Endereco detectado.'}</small>
        </div>
      ) : null}
    </section>
  );

  const renderProfile = () => (
    <div className="routing-two-columns">
      <section className="routing-panel">
        <div className="routing-section-title">
          <h3>Minha loja</h3>
        </div>

        {profileForm ? (
          <>
            <Field label="Nome da minha loja">
              <input
                value={profileForm.name}
                onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))}
              />
            </Field>

            <Field label="Usuario da loja">
              <input
                value={profileForm.username}
                onChange={(event) => setProfileForm((current) => ({ ...current, username: event.target.value }))}
              />
            </Field>

            <Field label="Nova senha" hint="Deixe em branco para manter a senha atual.">
              <input
                type="password"
                value={profileForm.password}
                onChange={(event) => setProfileForm((current) => ({ ...current, password: event.target.value }))}
              />
            </Field>

            <Field label="Cidade / regiao">
              <input
                value={profileForm.city}
                onChange={(event) => setProfileForm((current) => ({ ...current, city: event.target.value }))}
              />
            </Field>

            <Field label="Areas atendidas" hint="Separe por virgula. Ex.: Armacao Penha, Centro Penha">
              <textarea
                value={profileForm.serviceAreas}
                onChange={(event) => setProfileForm((current) => ({ ...current, serviceAreas: event.target.value }))}
              />
            </Field>

            <Field label="Areas que pedem confirmacao" hint="Use regioes divididas. Ex.: Santa Lidia, Meia Praia">
              <textarea
                value={profileForm.reviewAreas}
                onChange={(event) => setProfileForm((current) => ({ ...current, reviewAreas: event.target.value }))}
              />
            </Field>

            <label className="routing-check">
              <input
                type="checkbox"
                checked={profileForm.receivesOrders}
                onChange={(event) => setProfileForm((current) => ({ ...current, receivesOrders: event.target.checked }))}
              />
              Minha loja recebe pedidos
            </label>

            <label className="routing-check">
              <input
                type="checkbox"
                checked={profileForm.autoPrint}
                onChange={(event) => setProfileForm((current) => ({ ...current, autoPrint: event.target.checked }))}
              />
              Imprimir automaticamente pedidos recebidos nesta loja
            </label>

            <button type="button" className="routing-primary-action" onClick={saveProfile}>
              Salvar meu perfil
            </button>
          </>
        ) : null}
      </section>

      <section className="routing-panel">
        <div className="routing-section-title">
          <h3>Outras lojas</h3>
        </div>
        <p className="routing-note">Voce pode ler os perfis e escolher para quais lojas sua loja pode enviar pedidos.</p>

        <div className="routing-store-list">
          {otherStores.map((store) => {
            const connection = connectionsByTarget.get(store.id);
            return (
              <article key={store.id} className="routing-readonly-store">
                <div>
                  <strong>{store.name}</strong>
                  <span>{store.city || 'Sem regiao informada'}</span>
                </div>
                <p>{areaTextToInput(store.serviceAreas) || 'Sem areas cadastradas'}</p>
                {store.reviewAreas?.length ? <small>Confirmar: {areaTextToInput(store.reviewAreas)}</small> : null}
                <label className="routing-check">
                  <input
                    type="checkbox"
                    checked={Boolean(connection?.canSendOrders)}
                    onChange={(event) => toggleConnection(store.id, event.target.checked)}
                  />
                  Posso enviar pedidos para esta loja
                </label>
              </article>
            );
          })}
        </div>

        <button type="button" className="routing-danger-action" onClick={resetStore}>
          Resetar loja deste computador
        </button>
      </section>
    </div>
  );

  const renderSentCashPanel = () => (
    <section className="routing-panel sent-cash-panel">
      <div className="routing-section-title">
        <div>
          <h3>Caixa dos enviados</h3>
          <p className="routing-note">Pedidos enviados por esta loja para descontar da conta iFood da origem.</p>
        </div>
        <div className="sent-cash-actions">
          <button type="button" onClick={exportSentCashReport} disabled={!sentCashRows.length || sentCashBusy}>
            <Icon name="report" size={14} />
            Exportar
          </button>
          <button type="button" onClick={clearSentCashDay} disabled={!sentCashRows.length || sentCashBusy}>
            <Icon name="trash" size={14} />
            Limpar dia
          </button>
          {sentCashClearedAt ? (
            <button type="button" onClick={reopenSentCashDay} disabled={sentCashBusy}>
              <Icon name="refresh" size={14} />
              Reabrir
            </button>
          ) : null}
        </div>
      </div>

      {sentCashClearedAt ? (
        <div className="sent-cash-info">
          Saidas anteriores fechadas em {formatSentCashClearedAt(sentCashClearedAt)}. O historico enviado continua salvo abaixo.
        </div>
      ) : null}

      <div className="sent-cash-stats">
        <div className="sent-cash-stat total">
          <span>A descontar iFood</span>
          <strong>{formatCurrency(sentCashStats.total)}</strong>
          <small>{sentCashStats.activeCount} pedido(s) ativos</small>
        </div>

        <div className="sent-cash-stat">
          <span>Online</span>
          <strong>{formatCurrency(sentCashStats.online)}</strong>
          <small>Pago pelo app</small>
        </div>

        <div className="sent-cash-stat">
          <span>Cartao</span>
          <strong>{formatCurrency(sentCashStats.cartao)}</strong>
          <small>Conferir maquininha</small>
        </div>

        <div className="sent-cash-stat">
          <span>Dinheiro</span>
          <strong>{formatCurrency(sentCashStats.dinheiro)}</strong>
          <small>Conferir recebimento</small>
        </div>
      </div>

      {sentCashStats.duplicateCount ? (
        <div className="sent-cash-warning">
          {sentCashStats.duplicateCount} reenvio(s) antigo(s) foram ignorados nos totais para nao duplicar o caixa.
        </div>
      ) : null}

      {sentCashStats.missingCount ? (
        <div className="sent-cash-warning">
          {sentCashStats.missingCount} pedido(s) sem valor detectado. Abra o pedido e confira o texto bruto do iFood.
        </div>
      ) : null}

      <div className="sent-cash-table-wrap">
        <table className="sent-cash-table">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Cliente</th>
              <th>Destino</th>
              <th>Pagamento</th>
              <th>Valor</th>
              <th>Status</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {sentCashRows.length ? sentCashRows.map((row) => (
              <tr
                key={row.id}
                className={`${row.canceled ? 'is-canceled' : ''} ${row.duplicateCashEntry ? 'is-duplicate' : ''} ${!row.financial.hasFinancialData ? 'missing-value' : ''}`}
              >
                <td className="sent-cash-order">#{row.orderNumber}</td>
                <td>{row.customerName}</td>
                <td>{row.targetStoreName}</td>
                <td>
                  <span className={`sent-cash-badge ${row.financial.paymentMethod}`}>
                    {paymentLabels[row.financial.paymentMethod] || 'Online'}
                  </span>
                </td>
                <td className="sent-cash-amount">
                  {row.duplicateCashEntry
                    ? 'Ignorado'
                    : row.financial.hasFinancialData ? formatCurrency(row.financial.deductionValue) : 'Conferir'}
                </td>
                <td><StatusBadge status={row.order.status} /></td>
                <td>{formatDateTime(row.createdAt)}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan="7" className="sent-cash-empty">
                  {sentOrders.length ? 'Caixa dos enviados limpo. Novos pedidos enviados aparecerao aqui.' : 'Nenhum pedido enviado ainda.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );

  const renderOrderList = (orders, type) => (
    <section className="routing-panel">
      <div className="routing-section-title">
        <h3>{type === 'received' ? 'Fila recebida' : 'Historico enviado'}</h3>
        <span>{orders.length} pedido(s)</span>
      </div>

      <div className="routing-queue-list">
        {orders.length ? orders.map((order) => {
          const resent = isResentOrder(order);

          return (
            <article
              key={order.id}
              className={`routing-order-card ${order.status === 'impresso' ? 'printed' : ''} ${resent ? 'resent' : ''}`}
            >
              <div className="routing-order-card-header">
                <strong>#{order.orderNumber || order.parsedData?.locator || 'Pedido'}</strong>
                <StatusBadge status={order.status} />
              </div>

              {resent ? (
                <div className="routing-resend-warning">
                  Atencao: este pedido esta sendo enviado novamente. O caixa mantem apenas uma entrada para ele.
                </div>
              ) : null}

              <p>{order.customerName || order.parsedData?.customerName || 'Cliente nao identificado'}</p>
              <small>{order.parsedData?.address?.display || order.parsedData?.address?.raw || 'Endereco nao identificado'}</small>
              <span className="routing-source">
                {type === 'received' ? `Origem: ${order.sourceStoreName}` : `Destino: ${order.targetStoreName}`} - {formatDateTime(order.createdAt)}
              </span>

              <div className="routing-order-actions">
                <button type="button" onClick={() => printReceivedOrder(order)}>
                  <Icon name="print" size={14} />
                  Imprimir
                </button>
                {type === 'received' ? (
                  <button type="button" className="secondary" onClick={() => markPrinted(order)}>
                    <Icon name="check" size={14} />
                    Impresso
                  </button>
                ) : null}
                <button type="button" className="danger" onClick={() => cancelOrder(order)}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </article>
          );
        }) : (
          <div className="routing-empty-state">
            <strong>Nenhum pedido</strong>
            <span>{type === 'received' ? 'Pedidos enviados para sua loja aparecem aqui.' : 'Pedidos enviados por sua loja aparecem aqui.'}</span>
          </div>
        )}
      </div>
    </section>
  );

  const renderConfirmModal = () => {
    if (!confirmModalOpen || !routePreview) return null;

    return (
      <div className="routing-modal-backdrop" onClick={() => setConfirmModalOpen(false)}>
        <div className="routing-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <div className="routing-modal-header">
            <div>
              <h3>Confirmar envio</h3>
              <p>{routePreview.routeResult?.reason || 'Endereco detectado pelo pedido.'}</p>
            </div>
            <button type="button" onClick={() => setConfirmModalOpen(false)} aria-label="Fechar confirmacao">
              <Icon name="close" size={16} />
            </button>
          </div>

          <AddressSummary parsedData={routePreview.parsedData} />

          <div className={`routing-suggestion ${routePreview.routeResult?.requiresReview ? 'warning' : 'ok'}`}>
            <span>Destino</span>
            <strong>{selectedTarget?.name || 'Escolha a loja destino'}</strong>
            <small>
              {routePreview.routeResult?.requiresReview
                ? 'Essa regiao foi marcada para conferencia.'
                : 'O pedido sera enviado para a fila desta loja.'}
            </small>
          </div>

          <Field label="Enviar para">
            <select value={targetStoreId} onChange={(event) => setTargetStoreId(event.target.value)} autoFocus>
              <option value="">Escolher loja manualmente</option>
              {allowedTargets.map((store) => (
                <option key={store.id} value={store.id}>{store.name}</option>
              ))}
            </select>
          </Field>

          <div className="routing-modal-actions">
            <button type="button" className="routing-secondary-action" onClick={() => setConfirmModalOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="routing-primary-action"
              onClick={() => sendOrder(true)}
              disabled={loading || !targetStoreId}
            >
              <Icon name="send" size={16} />
              Enviar pedido
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="order-routing">
      <div className="routing-page-header">
        <div>
          <h2>Roteamento</h2>
          <p>{currentStore?.name || 'Loja configurada'} e a loja atual desta maquina</p>
        </div>
      </div>

      {apiError ? <div className="routing-error">{apiError}</div> : null}
      {feedback ? <div className={`routing-feedback ${feedbackType === 'warning' ? 'warning' : ''}`}>{feedback}</div> : null}

      <div className="routing-tabs" role="tablist" aria-label="Roteamento">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => {
              setActiveTab(tab.id);
              if (tab.id === 'received' || tab.id === 'sent') void loadOrders();
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'send' ? renderSend() : null}
      {activeTab === 'profile' ? renderProfile() : null}
      {activeTab === 'received' ? renderOrderList(receivedOrders, 'received') : null}
      {activeTab === 'sent' ? (
        <>
          {renderSentCashPanel()}
          {renderOrderList(sentOrders, 'sent')}
        </>
      ) : null}
      {renderConfirmModal()}
    </div>
  );
}
