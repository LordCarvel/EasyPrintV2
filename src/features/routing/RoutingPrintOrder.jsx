import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../../shared/ui/Icon';
import { showAppAlert } from '../../shared/ui/appDialog';
import { PENDING_PRINT_AUTO_KEY, PENDING_PRINT_RESEND_KEY, PENDING_PRINT_TEXT_KEY } from '../../shared/routing/orderRouting';
import { routingApi } from './routingApi';
import './OrderRouting.css';

export function RoutingPrintOrder() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');

  const loadOrder = async () => {
    try {
      const payload = await routingApi.getOrder(orderId);
      setOrder(payload.order);

      try {
        const viewed = await routingApi.markViewed(orderId, payload.order.version);
        setOrder(viewed.order);
      } catch (err) {
        if (err.status === 409) {
          const refreshed = await routingApi.getOrder(orderId);
          setOrder(refreshed.order);
        }
        // A loja origem pode abrir o historico enviado, mas so a loja destino marca como visto.
      }
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    void loadOrder();
  }, [orderId]);

  const printWithManualLayout = async () => {
    if (!order?.rawText) {
      void showAppAlert('Esse pedido nao tem texto bruto salvo para imprimir.');
      return;
    }

    try {
      const payload = await routingApi.markPrinted(orderId, order.version);
      setOrder(payload.order);
    } catch (err) {
      if (err.status === 409) {
        const refreshed = await routingApi.getOrder(orderId);
        setOrder(refreshed.order);
        void showAppAlert(err.message);
        return;
      }
      console.error('Falha ao marcar pedido como impresso', err);
    }

    localStorage.setItem(PENDING_PRINT_TEXT_KEY, order.rawText);
    localStorage.setItem(PENDING_PRINT_AUTO_KEY, '1');
    if (order.isResend || order.status === 'reenviado') {
      localStorage.setItem(PENDING_PRINT_RESEND_KEY, '1');
    } else {
      localStorage.removeItem(PENDING_PRINT_RESEND_KEY);
    }

    navigate('/impressao-manual');
  };

  const parsed = order?.parsedData || {};
  const address = parsed.address || {};

  return (
    <div className="order-routing print-view">
      <section className="routing-panel routing-print-shell">
        <div className="routing-print-toolbar">
          <button type="button" className="routing-secondary-action" onClick={() => navigate('/roteamento')}>
            <Icon name="arrowLeft" size={15} />
            Voltar
          </button>
          <button type="button" className="routing-primary-action" onClick={printWithManualLayout} disabled={!order}>
            <Icon name="print" size={15} />
            Imprimir igual manual
          </button>
        </div>

        {error ? <div className="routing-error">{error}</div> : null}

        {order ? (
          <div className="routing-manual-print-card">
            {order.isResend || order.status === 'reenviado' ? (
              <div className="routing-resend-warning">
                Atencao: este pedido foi enviado novamente. Ele nao sera lancado outra vez no caixa.
              </div>
            ) : null}
            <span>Pedido #{order.orderNumber || parsed.locator || '-'}</span>
            <strong>{order.customerName || parsed.customerName || 'Cliente nao identificado'}</strong>
            <p>{address.display || address.raw || 'Endereco nao identificado'}</p>
          </div>
        ) : (
          <div className="routing-empty-state">Carregando pedido...</div>
        )}
      </section>
    </div>
  );
}
