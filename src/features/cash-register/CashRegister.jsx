import { Fragment, useEffect, useState } from 'react';
import { Icon } from '../../shared/ui/Icon';
import './CashRegister.css';

export function CashRegister() {
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({ dinheiro: 0, cartao: 0, online: 0 });
  const [processed, setProcessed] = useState([]);
  const [secretMode, setSecretMode] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editPaymentMethod, setEditPaymentMethod] = useState('online');
  const [editTotal, setEditTotal] = useState('');

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    calculateStats();
  }, [orders]);

  useEffect(() => {
    const handleNewOrder = (event) => {
      addOrder(event.detail);
    };

    window.addEventListener('registerOrder', handleNewOrder);
    return () => window.removeEventListener('registerOrder', handleNewOrder);
  }, [orders, processed]);

  const loadOrders = () => {
    const savedOrders = localStorage.getItem('cashOrders');
    if (savedOrders) {
      setOrders(JSON.parse(savedOrders));
    }

    const savedProcessed = localStorage.getItem('cashProcessed');
    if (savedProcessed) {
      setProcessed(JSON.parse(savedProcessed));
    }
  };

  const calculateStats = () => {
    let dinheiro = 0;
    let cartao = 0;
    let online = 0;

    orders.forEach((order) => {
      if (order.isReprint) return;

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

    setOrders(next);
    localStorage.setItem('cashOrders', JSON.stringify(next));
    cancelEdit();
  };

  const addOrder = (orderData) => {
    const orderNumber = orderData.orderNumber || orderData.number;
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

    const existing = orders.find((order) => order.orderNumber === newOrder.orderNumber);
    if (existing || processed.includes(orderNumber) || orderData.isReprint) {
      newOrder.isReprint = true;
      const next = [...orders, newOrder];
      setOrders(next);
      localStorage.setItem('cashOrders', JSON.stringify(next));
      return;
    }

    const nextOrders = [...orders, newOrder];
    const nextProcessed = [...processed, orderNumber];

    setOrders(nextOrders);
    setProcessed(nextProcessed);
    localStorage.setItem('cashOrders', JSON.stringify(nextOrders));
    localStorage.setItem('cashProcessed', JSON.stringify(nextProcessed));
  };

  const deleteOrder = (id) => {
    const next = orders.filter((order) => order.id !== id);
    setOrders(next);
    localStorage.setItem('cashOrders', JSON.stringify(next));
  };

  const clearAll = () => {
    if (!window.confirm('Tem certeza? Isso vai limpar todo o registro do caixa.')) {
      return;
    }

    setOrders([]);
    setProcessed([]);
    localStorage.removeItem('cashOrders');
    localStorage.removeItem('cashProcessed');
  };

  const paymentLabel = (method) => {
    if (method === 'dinheiro') return 'Dinheiro';
    if (method === 'cartao') return 'Cartao';
    return 'Online';
  };

  const exportReport = () => {
    const report = `RELATORIO DE CAIXA\n${'='.repeat(50)}\n\nData: ${new Date().toLocaleDateString('pt-BR')}\nHora: ${new Date().toLocaleTimeString('pt-BR')}\n\n${'='.repeat(50)}\nRESUMO FINANCEIRO\n${'='.repeat(50)}\n\nDinheiro: R$ ${stats.dinheiro.toFixed(2)}\nCartao: R$ ${stats.cartao.toFixed(2)}\nOnline: R$ ${stats.online.toFixed(2)}\n\n${'='.repeat(50)}\nPEDIDOS REGISTRADOS\n${'='.repeat(50)}\n\n${orders
      .map(
        (order) =>
          `Pedido #${order.orderNumber} | ${order.customer} | R$ ${order.total.toFixed(2)} | ${paymentLabel(order.paymentMethod)} | ${order.timestamp}${
            order.isReprint ? ' (REIMPRESSAO)' : ''
          }`
      )
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
        <div className="stat-box">
          <label>Dinheiro</label>
          <span className="stat-value">R$ {stats.dinheiro.toFixed(2)}</span>
        </div>

        <div className="stat-box">
          <label>Cartao</label>
          <span className="stat-value">R$ {stats.cartao.toFixed(2)}</span>
        </div>

        <div className="stat-box">
          <label>Online</label>
          <span className="stat-value">R$ {stats.online.toFixed(2)}</span>
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

