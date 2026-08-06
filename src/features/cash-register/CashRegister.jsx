import { Fragment, useEffect, useState } from 'react';
import { Icon } from '../../shared/ui/Icon';
import { confirmAction, showAppAlert } from '../../shared/ui/appDialog';
import { hydrateLocalSettingsFromStore, saveStoreSettingsPatch } from '../routing/storeSettingsClient';
import { routingApi } from '../routing/routingApi';
import { formatCurrency, parseIfoodFinancial } from '../../../shared/routing/ifoodFinancial';
import { formatEasyPrintDateTime, getEasyPrintTimestamp } from '../../shared/utils/dateTime';
import './CashRegister.css';

const getTimestamp = getEasyPrintTimestamp;

const isSentCashOpenOrder = (order = {}, sentCashClearedAt = '') => {
  const clearedTimestamp = getTimestamp(sentCashClearedAt);
  if (!clearedTimestamp) return true;

  const orderTimestamp = getTimestamp(order.createdAt);
  return !orderTimestamp || orderTimestamp > clearedTimestamp;
};

const formatSentCashClearedAt = (value) => {
  return formatEasyPrintDateTime(value, '');
};

export function CashRegister() {
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({ dinheiro: 0, cartao: 0, online: 0 });
  const [sentOrders, setSentOrders] = useState([]);
  const [sentCashClearedAt, setSentCashClearedAt] = useState('');
  const [sentCashBusy, setSentCashBusy] = useState(false);
  const [sentStats, setSentStats] = useState({ total: 0, dinheiro: 0, cartao: 0, online: 0, count: 0 });
  const [sentError, setSentError] = useState('');
  const [processed, setProcessed] = useState([]);
  const [secretMode, setSecretMode] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editPaymentMethod, setEditPaymentMethod] = useState('online');
  const [editTotal, setEditTotal] = useState('');

  useEffect(() => {
    loadOrders();
    void loadSentOrders();
  }, []);

  useEffect(() => {
    calculateStats();
  }, [orders]);

  useEffect(() => {
    calculateSentStats();
  }, [sentOrders, sentCashClearedAt]);

  useEffect(() => {
    const handleNewOrder = (event) => {
      addOrder(event.detail);
    };

    window.addEventListener('registerOrder', handleNewOrder);
    return () => window.removeEventListener('registerOrder', handleNewOrder);
  }, [orders, processed]);

  const readLocalArray = (key) => {
    try {
      const saved = localStorage.getItem(key);
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const saveRegisterState = (nextOrders, nextProcessed = processed) => {
    const safeOrders = Array.isArray(nextOrders) ? nextOrders : [];
    const safeProcessed = Array.isArray(nextProcessed) ? nextProcessed : [];

    setOrders(safeOrders);
    setProcessed(safeProcessed);
    localStorage.setItem('cashOrders', JSON.stringify(safeOrders));
    localStorage.setItem('cashProcessed', JSON.stringify(safeProcessed));
    void saveStoreSettingsPatch({
      cashOrders: safeOrders,
      cashProcessed: safeProcessed
    }).catch((error) => {
      console.error('Falha ao salvar caixa no perfil da loja', error);
    });
  };

  const loadOrders = () => {
    const localOrders = readLocalArray('cashOrders');
    const localProcessed = readLocalArray('cashProcessed');
    setOrders(localOrders);
    setProcessed(localProcessed);

    void hydrateLocalSettingsFromStore()
      .then((settings) => {
        setOrders(Array.isArray(settings.cashOrders) ? settings.cashOrders : localOrders);
        setProcessed(Array.isArray(settings.cashProcessed) ? settings.cashProcessed : localProcessed);
      })
      .catch((error) => {
        console.warn('Usando caixa local porque o perfil da loja nao carregou', error);
      });
  };

  const loadSentOrders = async () => {
    try {
      const [payload, settingsPayload] = await Promise.all([
        routingApi.listSentOrders(),
        routingApi.getSettings()
      ]);
      setSentOrders(Array.isArray(payload.orders) ? payload.orders : []);
      setSentCashClearedAt(settingsPayload.settings?.sentCashClearedAt || '');
      setSentError('');
    } catch (error) {
      setSentOrders([]);
      setSentError(error.message);
    }
  };

  const getSentOrderFinancial = (order = {}) => {
    const financial = order.parsedData?.financial || parseIfoodFinancial(order.rawText || order.parsedData?.rawText || '');
    const deductionValue = Number(
      financial?.deductionValue ??
      financial?.totalValue ??
      financial?.subtotalValue ??
      0
    ) || 0;

    return {
      ...financial,
      deductionValue,
      paymentMethod: financial?.paymentMethod || 'online',
      hasFinancialData: Boolean(financial?.hasFinancialData || deductionValue > 0)
    };
  };

  const calculateStats = () => {
    let dinheiro = 0;
    let cartao = 0;
    let online = 0;
    const seenOrders = new Set();

    orders.forEach((order) => {
      const orderKey = String(order.orderNumber || order.id || '').trim();
      if (order.isReprint) return;
      if (orderKey && seenOrders.has(orderKey)) return;
      if (orderKey) seenOrders.add(orderKey);

      const valor = Number.parseFloat(order.total) || 0;

      if (order.paymentMethod === 'dinheiro') {
        dinheiro += valor;
        return;
      }

      if (order.paymentMethod === 'cartao') {
        cartao += valor;
        return;
      }

      online += valor;
    });

    setStats({ dinheiro, cartao, online });
  };

  const calculateSentStats = () => {
    const seenOrders = new Set();
    const nextStats = { total: 0, dinheiro: 0, cartao: 0, online: 0, count: 0 };

    sentOrders
      .filter((order) => isSentCashOpenOrder(order, sentCashClearedAt))
      .forEach((order) => {
        const orderKey = String(order.orderNumber || order.parsedData?.orderNumber || order.id || '').trim();
        if (order.status === 'cancelado') return;
        if (orderKey && seenOrders.has(orderKey)) return;
        if (orderKey) seenOrders.add(orderKey);

        const financial = getSentOrderFinancial(order);
        if (!financial.hasFinancialData) return;

        nextStats.total += financial.deductionValue;
        nextStats.count += 1;

        if (financial.paymentMethod === 'dinheiro') {
          nextStats.dinheiro += financial.deductionValue;
        } else if (financial.paymentMethod === 'cartao') {
          nextStats.cartao += financial.deductionValue;
        } else {
          nextStats.online += financial.deductionValue;
        }
      });

    setSentStats(nextStats);
  };

  const toggleSecret = () => {
    setSecretMode((prev) => !prev);
  };

  const startEdit = (order) => {
    setEditingId(order.id);
    setEditPaymentMethod(order.paymentMethod || 'online');
    setEditTotal((Number.parseFloat(order.total) || 0).toFixed(2));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditPaymentMethod('online');
    setEditTotal('');
  };

  const saveEdit = () => {
    if (!editingId) return;

    const next = orders.map((order) =>
      order.id === editingId
        ? {
            ...order,
            paymentMethod: editPaymentMethod,
            total: Number.parseFloat(editTotal) || 0,
            adjusted: true
          }
        : order
    );

    saveRegisterState(next);
    cancelEdit();
  };

  const addOrder = (orderData) => {
    const orderNumber = String(orderData.orderNumber || orderData.number || '').trim();
    if (!orderNumber) return;

    const paymentMethod = orderData.paymentMethod || 'online';
    const totalValue = Number.parseFloat(orderData.totalValue) || 0;

    const newOrder = {
      id: orderNumber,
      orderNumber,
      customer: orderData.customerName || orderData.custumerName,
      total: totalValue,
      paymentMethod,
      itemCount: orderData.items?.length || 0,
      timestamp: new Date().toLocaleTimeString('pt-BR'),
      date: new Date().toLocaleDateString('pt-BR'),
      isReprint: false
    };

    const existing = orders.find((order) =>
      String(order.orderNumber || order.id || '').trim() === newOrder.orderNumber
    );
    if (existing || processed.includes(orderNumber) || orderData.isReprint) {
      const nextProcessed = processed.includes(orderNumber) ? processed : [...processed, orderNumber];
      saveRegisterState(orders, nextProcessed);
      return;
    }

    const nextOrders = [...orders, newOrder];
    const nextProcessed = [...processed, orderNumber];

    saveRegisterState(nextOrders, nextProcessed);
  };

  const deleteOrder = (id) => {
    const next = orders.filter((order) => order.id !== id);
    saveRegisterState(next);
  };

  const clearAll = async () => {
    if (!(await confirmAction('Tem certeza? Isso vai limpar todo o registro do caixa.'))) {
      return;
    }

    saveRegisterState([], []);
  };

  const clearSentCashDay = async () => {
    const openSentOrders = sentOrders.filter((order) => isSentCashOpenOrder(order, sentCashClearedAt));
    if (!openSentOrders.length) {
      void showAppAlert('Nao ha saidas abertas para limpar.');
      return;
    }

    const confirmed = await confirmAction(
      'Isso limpa apenas as saidas dos pedidos enviados. Os pedidos continuam salvos no historico e novos envios entram normalmente.',
      { title: 'Limpar saidas dos enviados', confirmLabel: 'Limpar dia' }
    );
    if (!confirmed) return;

    setSentCashBusy(true);
    try {
      const nextClearedAt = new Date().toISOString();
      const settings = await saveStoreSettingsPatch({ sentCashClearedAt: nextClearedAt });
      setSentCashClearedAt(settings.sentCashClearedAt || nextClearedAt);
      await loadSentOrders();
    } catch (error) {
      void showAppAlert(error.message || 'Falha ao limpar saidas dos enviados.', { tone: 'danger' });
    } finally {
      setSentCashBusy(false);
    }
  };

  const reopenSentCashDay = async () => {
    const confirmed = await confirmAction(
      'Isso volta a mostrar os pedidos enviados anteriores nos totais de saida.',
      { title: 'Reabrir saidas dos enviados', confirmLabel: 'Reabrir' }
    );
    if (!confirmed) return;

    setSentCashBusy(true);
    try {
      const settings = await saveStoreSettingsPatch({ sentCashClearedAt: '' });
      setSentCashClearedAt(settings.sentCashClearedAt || '');
      await loadSentOrders();
    } catch (error) {
      void showAppAlert(error.message || 'Falha ao reabrir saidas dos enviados.', { tone: 'danger' });
    } finally {
      setSentCashBusy(false);
    }
  };

  const paymentLabel = (method) => {
    if (method === 'dinheiro') return 'Dinheiro';
    if (method === 'cartao') return 'Cartao';
    return 'Online';
  };

  const incomingTotal = stats.dinheiro + stats.cartao + stats.online;
  const balanceTotal = incomingTotal - sentStats.total;
  const sentCashOrders = sentOrders.filter((order) => isSentCashOpenOrder(order, sentCashClearedAt));

  const exportReport = () => {
    const exportedOrderKeys = new Set();
    const exportedOrders = orders.filter((order) => {
      const orderKey = String(order.orderNumber || order.id || '').trim();
      if (order.isReprint) return false;
      if (orderKey && exportedOrderKeys.has(orderKey)) return false;
      if (orderKey) exportedOrderKeys.add(orderKey);
      return true;
    });
    const exportedSentKeys = new Set();
    const exportedSentOrders = sentCashOrders.filter((order) => {
      const orderKey = String(order.orderNumber || order.parsedData?.orderNumber || order.id || '').trim();
      if (order.status === 'cancelado') return false;
      if (orderKey && exportedSentKeys.has(orderKey)) return false;
      if (orderKey) exportedSentKeys.add(orderKey);
      return true;
    });
    const report = `RELATORIO DE CAIXA\n${'='.repeat(50)}\n\nData: ${new Date().toLocaleDateString('pt-BR')}\nHora: ${new Date().toLocaleTimeString('pt-BR')}\n\n${'='.repeat(50)}\nRESUMO FINANCEIRO\n${'='.repeat(50)}\n\nEntrou no caixa: ${formatCurrency(incomingTotal)}\nSaiu iFood: ${formatCurrency(sentStats.total)}\nSaldo: ${formatCurrency(balanceTotal)}\n\nEntradas por metodo\nDinheiro: ${formatCurrency(stats.dinheiro)}\nCartao: ${formatCurrency(stats.cartao)}\nOnline: ${formatCurrency(stats.online)}\n\nSaidas iFood por metodo\nDinheiro: ${formatCurrency(sentStats.dinheiro)}\nCartao: ${formatCurrency(sentStats.cartao)}\nOnline: ${formatCurrency(sentStats.online)}\n\n${'='.repeat(50)}\nPEDIDOS DE ENTRADA\n${'='.repeat(50)}\n\n${exportedOrders
      .map(
        (order) =>
          `Pedido #${order.orderNumber} | ${order.customer} | R$ ${order.total.toFixed(2)} | ${paymentLabel(order.paymentMethod)} | ${order.timestamp}${
            order.isReprint ? ' (REIMPRESSAO)' : ''
          }`
      )
      .join('\n')}\n\n${'='.repeat(50)}\nPEDIDOS ENVIADOS / SAIDAS\n${'='.repeat(50)}\n\n${exportedSentOrders
      .map((order) => {
        const financial = getSentOrderFinancial(order);
        return `Pedido #${order.orderNumber || order.parsedData?.orderNumber || '-'} | ${order.customerName || order.parsedData?.customerName || '-'} | ${order.targetStoreName || '-'} | ${paymentLabel(financial.paymentMethod)} | ${formatCurrency(financial.deductionValue)}`;
      })
      .join('\n')}\n\n${'='.repeat(50)}`;

    const blob = new Blob([report], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio_caixa_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.txt`;
    link.click();
  };

  return (
    <div className="cash-register">
      <div className="register-header">
        <h2>Registro de Caixa</h2>
        <p>Controle de pedidos e pagamentos</p>
        <button
          type="button"
          className="secret-trigger"
          onClick={toggleSecret}
          aria-label="Abrir modo de ajuste do caixa"
        />
      </div>

      <div className="stats-container">
        <div className="stat-box total">
          <label>Entrou no caixa</label>
          <span className="stat-value">{formatCurrency(incomingTotal)}</span>
        </div>

        <div className="stat-box outgoing">
          <label>Saiu iFood</label>
          <span className="stat-value">{formatCurrency(sentStats.total)}</span>
        </div>

        <div className={`stat-box ${balanceTotal < 0 ? 'negative' : 'balance'}`}>
          <label>Saldo</label>
          <span className="stat-value">{formatCurrency(balanceTotal)}</span>
        </div>
      </div>

      <div className="stats-container payment-breakdown">
        <div className="stat-box">
          <label>Entrou dinheiro</label>
          <span className="stat-value">{formatCurrency(stats.dinheiro)}</span>
        </div>

        <div className="stat-box">
          <label>Entrou cartao</label>
          <span className="stat-value">{formatCurrency(stats.cartao)}</span>
        </div>

        <div className="stat-box">
          <label>Entrou online</label>
          <span className="stat-value">{formatCurrency(stats.online)}</span>
        </div>

        <div className="stat-box">
          <label>Enviados calculados</label>
          <span className="stat-value">{sentStats.count}</span>
        </div>
      </div>

      <div className="register-actions">
        <button type="button" onClick={exportReport} className="btn-export icon-with-label">
          <Icon name="report" size={14} />
          <span>Exportar Relatorio</span>
        </button>

        <button type="button" onClick={clearAll} className="btn-clear icon-with-label">
          <Icon name="trash" size={14} />
          <span>Limpar Caixa</span>
        </button>
      </div>

      <section className="cash-flow-panel">
        <div className="cash-flow-header">
          <div>
            <h3>Saidas dos enviados</h3>
            <p>Pedidos enviados por esta loja entram como desconto/saida da conta iFood.</p>
          </div>
          <div className="cash-flow-actions">
            <button type="button" className="btn-refresh-sent" onClick={loadSentOrders} disabled={sentCashBusy}>
              Atualizar
            </button>
            <button
              type="button"
              className="btn-clear-sent"
              onClick={clearSentCashDay}
              disabled={!sentCashOrders.length || sentCashBusy}
            >
              Limpar dia
            </button>
            {sentCashClearedAt ? (
              <button type="button" className="btn-reopen-sent" onClick={reopenSentCashDay} disabled={sentCashBusy}>
                Reabrir
              </button>
            ) : null}
          </div>
        </div>

        {sentError ? <div className="cash-flow-warning">{sentError}</div> : null}

        {sentCashClearedAt ? (
          <div className="cash-flow-info">
            Saidas anteriores fechadas em {formatSentCashClearedAt(sentCashClearedAt)}. O historico enviado continua salvo.
          </div>
        ) : null}

        <div className="sent-flow-grid">
          <div>
            <span>Online</span>
            <strong>{formatCurrency(sentStats.online)}</strong>
          </div>
          <div>
            <span>Cartao</span>
            <strong>{formatCurrency(sentStats.cartao)}</strong>
          </div>
          <div>
            <span>Dinheiro</span>
            <strong>{formatCurrency(sentStats.dinheiro)}</strong>
          </div>
        </div>

        <div className="orders-table-container sent-orders-table">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Destino</th>
                <th>Pagamento</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {sentCashOrders.length === 0 && (
                <tr>
                  <td className="empty-message" colSpan="5">
                    {sentOrders.length ? 'Saidas dos enviados limpas. Novos pedidos enviados aparecerao aqui.' : 'Nenhuma saida de pedido enviado ainda.'}
                  </td>
                </tr>
              )}

              {sentCashOrders.map((order) => {
                const financial = getSentOrderFinancial(order);
                return (
                  <tr key={order.id} className={order.status === 'cancelado' ? 'canceled-row' : ''}>
                    <td className="order-number">#{order.orderNumber || order.parsedData?.orderNumber || '-'}</td>
                    <td>{order.customerName || order.parsedData?.customerName || '-'}</td>
                    <td>{order.targetStoreName || '-'}</td>
                    <td>
                      <span className={`badge badge-${financial.paymentMethod || 'online'}`}>
                        {paymentLabel(financial.paymentMethod)}
                      </span>
                    </td>
                    <td className="amount">
                      {financial.hasFinancialData ? formatCurrency(financial.deductionValue) : 'Conferir'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {secretMode && (
        <div className="secret-panel">
          <div className="secret-panel__title">Modo de ajuste do caixa</div>
          <p className="secret-panel__desc">
            Altere forma de pagamento ou valor final quando houver divergencia na comanda.
          </p>

          <div className="orders-table-container">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Valor</th>
                  <th>Pagamento</th>
                  <th>Hora</th>
                  <th>Acoes</th>
                </tr>
              </thead>

              <tbody>
                {orders.length === 0 && (
                  <tr>
                    <td className="empty-message" colSpan="6">
                      Nenhum pedido registrado ainda.
                    </td>
                  </tr>
                )}

                {orders
                  .slice()
                  .reverse()
                  .map((order) => (
                    <Fragment key={order.id}>
                      <tr className={order.isReprint ? 'reprint-row' : ''}>
                        <td className="order-number">#{order.orderNumber}</td>
                        <td>{order.customer || '-'}</td>
                        <td className="amount">R$ {(Number.parseFloat(order.total) || 0).toFixed(2)}</td>
                        <td>
                          <span className={`badge badge-${order.paymentMethod || 'online'}`}>
                            {order.paymentMethod || 'online'}
                          </span>
                          {order.adjusted && <span className="adjusted-tag">ajustado</span>}
                        </td>
                        <td className="time">{order.timestamp}</td>
                        <td className="actions-cell">
                          <button type="button" className="btn-edit-order" onClick={() => startEdit(order)}>
                            Editar
                          </button>

                          <button
                            type="button"
                            className="btn-delete-order"
                            onClick={() => deleteOrder(order.id)}
                            aria-label={`Excluir pedido ${order.orderNumber}`}
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        </td>
                      </tr>

                      {editingId === order.id && (
                        <tr className="edit-row">
                          <td colSpan="6">
                            <div className="edit-panel">
                              <label>Forma de pagamento</label>

                              <select
                                value={editPaymentMethod}
                                onChange={(event) => setEditPaymentMethod(event.target.value)}
                              >
                                <option value="dinheiro">Dinheiro</option>
                                <option value="cartao">Cartao</option>
                                <option value="online">Online</option>
                              </select>

                              <label>Novo valor</label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={editTotal}
                                onChange={(event) => setEditTotal(event.target.value)}
                              />

                              <div className="edit-actions">
                                <button type="button" className="btn-save-edit" onClick={saveEdit}>
                                  Salvar
                                </button>

                                <button type="button" className="btn-cancel-edit" onClick={cancelEdit}>
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

