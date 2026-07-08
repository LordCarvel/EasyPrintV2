import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppState } from '../../shared/context/AppStateContext';
import { Icon } from '../../shared/ui/Icon';
import { PreviewModal } from '../../shared/ui/PreviewModal';
import { confirmAction } from '../../../../shared/ui/appDialog';
import {
  calculateCourierBaseTotal,
  calculateCourierTotal,
  calculateTotals,
  formatCurrency
} from '../../shared/utils/calculations';
import './Home.css';

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatDateTime = (value) => {
  if (!value) return 'Ainda nao salvo';

  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch (error) {
    return value;
  }
};

const buildSummaryHtml = (appState) => {
  const totals = calculateTotals(appState);
  const incomingPaymentTotals = totals.incomingPaymentTotals;
  const reportConfig = appState.reportConfig;
  const courierRowsCompact = appState.couriers
    .map((courier) => {
      const totalDeliveries = appState.rateConfigs.reduce(
        (accumulator, rate) => accumulator + Number(courier.countsByRate[rate.id] || 0),
        0
      );

      return `
        <tr>
          <td style="padding:12px 14px;border-bottom:1px solid #dddddd;font-size:13px;line-height:1.95;word-break:break-word;">${escapeHtml(courier.name || '-')}</td>
          <td style="padding:12px 14px;text-align:right;border-bottom:1px solid #dddddd;font-size:13px;line-height:1.95;white-space:nowrap;">${totalDeliveries}</td>
          <td style="padding:12px 14px;text-align:right;border-bottom:1px solid #dddddd;font-size:13px;line-height:1.95;white-space:nowrap;">${formatCurrency(calculateCourierBaseTotal(courier, appState.rateConfigs))}</td>
          <td style="padding:12px 14px;text-align:right;border-bottom:1px solid #dddddd;font-size:13px;line-height:1.95;white-space:nowrap;">${escapeHtml(courier.adjustmentSign)}${formatCurrency(courier.adjustmentValue || 0)}</td>
          <td style="padding:12px 14px;text-align:right;border-bottom:1px solid #dddddd;font-size:13px;font-weight:700;line-height:1.95;white-space:nowrap;">${formatCurrency(calculateCourierTotal(courier, appState.rateConfigs))}</td>
        </tr>
      `;
    })
    .join('');

  const incomingRowsCompact = appState.incomingOrders.length
    ? appState.incomingOrders
      .map(
        (order) => `
          <tr>
            <td style="padding:12px 14px;border-bottom:1px solid #dddddd;font-size:13px;line-height:1.95;word-break:break-word;">${escapeHtml(order.hubOrderId || '-')}</td>
            <td style="padding:12px 14px;border-bottom:1px solid #dddddd;font-size:13px;line-height:1.95;word-break:break-word;">${escapeHtml(order.sourceBranchName || '-')}</td>
            <td style="padding:12px 14px;text-align:right;border-bottom:1px solid #dddddd;font-size:13px;line-height:1.95;white-space:nowrap;">${formatCurrency(order.totalAmount)}</td>
          </tr>
        `
      )
      .join('')
    : `
      <tr>
        <td colspan="3" style="padding:18px 14px;text-align:center;font-size:13px;color:#777777;line-height:1.95;">
          Nenhum pedido do EasyPrint no fechamento.
        </td>
      </tr>
    `;

  const reportSections = [];

  if (reportConfig.showSummaryCards) {
    reportSections.push(`
      <div style="margin-bottom:24px;font-size:13px;line-height:2.1;color:#333333;">
        <strong>Total motoboys:</strong> R$ ${formatCurrency(totals.couriersTotal)}
        <span style="display:inline-block;margin:0 14px;">|</span>
        <strong>EasyPrint:</strong> R$ ${formatCurrency(totals.incomingOrdersTotal)}
        <span style="display:inline-block;margin:0 14px;">|</span>
        <strong>Total caixa:</strong> R$ ${formatCurrency(totals.cashTotal)}
      </div>
    `);
  }

  if (reportConfig.showCourierTable) {
    reportSections.push(`
      <section style="margin-bottom:30px;">
        <h3 style="margin:0 0 14px;font-size:19px;color:#222222;line-height:1.6;">Motoboys</h3>
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
          <thead>
            <tr style="background:#f2f2f2;">
              <th style="width:34%;padding:12px 14px;text-align:left;font-size:12px;line-height:1.8;white-space:nowrap;">Nome</th>
              <th style="width:13%;padding:12px 14px;text-align:right;font-size:12px;line-height:1.8;white-space:nowrap;">Entregas</th>
              <th style="width:18%;padding:12px 14px;text-align:right;font-size:12px;line-height:1.8;white-space:nowrap;">Valor</th>
              <th style="width:15%;padding:12px 14px;text-align:right;font-size:12px;line-height:1.8;white-space:nowrap;">Ajuste</th>
              <th style="width:20%;padding:12px 14px;text-align:right;font-size:12px;line-height:1.8;white-space:nowrap;">Total</th>
            </tr>
          </thead>
          <tbody>${courierRowsCompact}</tbody>
        </table>
        <div style="margin-top:18px;font-size:14px;line-height:2;">
          <strong>Total Motoboys:</strong> R$ ${formatCurrency(totals.couriersTotal)}
        </div>
      </section>
    `);
  }

  if (reportConfig.showManualCashDetails || reportConfig.showEasyPrintBreakdown) {
    reportSections.push(`
      <section style="margin-bottom:${reportConfig.showIncomingOrdersTable ? '30px' : '0'};">
        <h3 style="margin:0 0 14px;font-size:19px;color:#222222;line-height:1.6;">Caixa Final</h3>
        <div style="display:grid;gap:12px;font-size:14px;line-height:2.05;">
          ${reportConfig.showManualCashDetails ? `
            <div style="display:grid;grid-template-columns:minmax(0,1fr) max-content;column-gap:40px;align-items:center;border-bottom:1px solid #dddddd;padding-bottom:8px;"><span style="word-break:break-word;">Dinheiro manual:</span><strong style="white-space:nowrap;">R$ ${formatCurrency(appState.cash.dinheiro)}</strong></div>
            <div style="display:grid;grid-template-columns:minmax(0,1fr) max-content;column-gap:40px;align-items:center;border-bottom:1px solid #dddddd;padding-bottom:8px;"><span style="word-break:break-word;">Cartao manual:</span><strong style="white-space:nowrap;">R$ ${formatCurrency(appState.cash.cartao)}</strong></div>
            <div style="display:grid;grid-template-columns:minmax(0,1fr) max-content;column-gap:40px;align-items:center;border-bottom:1px solid #dddddd;padding-bottom:8px;"><span style="word-break:break-word;">Online manual:</span><strong style="white-space:nowrap;">R$ ${formatCurrency(appState.cash.online)}</strong></div>
          ` : ''}
          ${reportConfig.showEasyPrintBreakdown ? `
            <div style="display:grid;grid-template-columns:minmax(0,1fr) max-content;column-gap:40px;align-items:center;border-bottom:1px solid #dddddd;padding-bottom:8px;"><span style="word-break:break-word;">EasyPrint dinheiro:</span><strong style="white-space:nowrap;">R$ ${formatCurrency(incomingPaymentTotals.dinheiro)}</strong></div>
            <div style="display:grid;grid-template-columns:minmax(0,1fr) max-content;column-gap:40px;align-items:center;border-bottom:1px solid #dddddd;padding-bottom:8px;"><span style="word-break:break-word;">EasyPrint cartao:</span><strong style="white-space:nowrap;">R$ ${formatCurrency(incomingPaymentTotals.cartao)}</strong></div>
            <div style="display:grid;grid-template-columns:minmax(0,1fr) max-content;column-gap:40px;align-items:center;border-bottom:1px solid #dddddd;padding-bottom:8px;"><span style="word-break:break-word;">EasyPrint online:</span><strong style="white-space:nowrap;">R$ ${formatCurrency(incomingPaymentTotals.online)}</strong></div>
            ${incomingPaymentTotals.unmapped
              ? `<div style="display:grid;grid-template-columns:minmax(0,1fr) max-content;column-gap:40px;align-items:center;border-bottom:1px solid #dddddd;padding-bottom:8px;"><span style="word-break:break-word;">EasyPrint nao classificado:</span><strong style="white-space:nowrap;">R$ ${formatCurrency(incomingPaymentTotals.unmapped)}</strong></div>`
              : ''}
          ` : ''}
        </div>
        <div style="margin-top:18px;font-size:14px;line-height:2;">
          <strong>Total Caixa:</strong> R$ ${formatCurrency(totals.cashTotal)}
        </div>
      </section>
    `);
  }

  if (reportConfig.showIncomingOrdersTable) {
    reportSections.push(`
      <section style="margin-top:30px;">
        <h3 style="margin:0 0 14px;font-size:19px;color:#222222;line-height:1.6;">Pedidos do EasyPrint</h3>
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
          <thead>
            <tr style="background:#f2f2f2;">
              <th style="width:38%;padding:12px 14px;text-align:left;font-size:12px;line-height:1.8;white-space:nowrap;">Pedido</th>
              <th style="width:37%;padding:12px 14px;text-align:left;font-size:12px;line-height:1.8;white-space:nowrap;">Filial</th>
              <th style="width:25%;padding:12px 14px;text-align:right;font-size:12px;line-height:1.8;white-space:nowrap;">Total</th>
            </tr>
          </thead>
          <tbody>${incomingRowsCompact}</tbody>
        </table>
      </section>
    `);
  }

  if (!reportSections.length) {
    reportSections.push(`
      <div style="padding:22px 0;font-size:14px;color:#666666;line-height:2;">
        Nenhuma secao detalhada selecionada. O relatorio vai sair apenas com o titulo e o total geral.
      </div>
    `);
  }

  return `
    <div style="box-sizing:border-box;width:860px;max-width:860px;background:#ffffff;color:#222222;font-family:Arial,sans-serif;padding:30px 42px;">
      <h2 style="margin:0 0 26px;text-align:center;font-size:21px;color:#77a2e8;line-height:1.65;">Fechamento de Caixa</h2>
      ${reportSections.join('')}
      <div style="margin-top:26px;text-align:center;font-size:12px;color:#7a7a7a;line-height:2;">${new Date().getFullYear()} - LordCarvel</div>
    </div>
  `;
};

export function Home() {
  const { appState, previewImage, lastSavedAt, actions } = useAppState();
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const totals = useMemo(() => calculateTotals(appState), [appState]);
  const summaryHtml = useMemo(() => buildSummaryHtml(appState), [appState]);
  const incomingPaymentTotals = totals.incomingPaymentTotals;
  const reportConfig = appState.reportConfig;

  const autosaveText = lastSavedAt
    ? `Autosave local ativo. Ultima gravacao: ${formatDateTime(lastSavedAt)}`
    : 'Autosave local ativo.';

  const hubStatusText = appState.hubSync.lastError
    ? appState.hubSync.lastError
    : appState.hubSync.lastSyncAt
      ? `Ultima sincronizacao: ${formatDateTime(appState.hubSync.lastSyncAt)}`
      : 'Configure o hub para receber comandos automaticos no fechamento.';

  const savedPreviewText = previewImage?.generatedAt
    ? `Ultima imagem salva localmente em ${formatDateTime(previewImage.generatedAt)}`
    : 'Nenhuma imagem salva localmente ainda.';

  const handleClearDay = async () => {
    const confirmed = await confirmAction(
      'Isso vai limpar motoboys, caixa manual, pedidos do EasyPrint e a ultima imagem salva. As configuracoes de taxas, hub e relatorio serao mantidas. Deseja continuar?'
    );

    if (!confirmed) return;

    setIsPreviewOpen(false);
    actions.clearDayData();
  };

  return (
    <div className="page-shell">
      <section className="page-hero">
        <div>
          <p className="page-eyebrow">Funcoes do Projeto</p>
          <h2 className="page-title">Operacao diaria separada das configuracoes</h2>
          <p className="page-description">
            Esta pagina fica so com as funcoes operacionais do app: fechamento, motoboys, entradas do hub,
            caixa final e exportacao da imagem. Taxas e Hub ficam nas paginas separadas de configuracao.
          </p>
        </div>

        <div className="page-hero-meta">
          <div className="status-note">{autosaveText}</div>
          <div className={`status-note ${appState.hubSync.lastError ? 'status-note-error' : ''}`}>
            {hubStatusText}
          </div>

          <div className="page-link-row">
            <Link to="/taxas" className="page-link-chip">
              Configurar taxas
            </Link>
            <Link to="/integracao-hub" className="page-link-chip">
              Configurar hub
            </Link>
          </div>
        </div>
      </section>

      <section className="home-summary-grid">
        <article className="summary-card">
          <span className="summary-label">Total Motoboys</span>
          <strong className="summary-value">R$ {formatCurrency(totals.couriersTotal)}</strong>
          <span className="summary-footnote">Somatorio automatico por taxa e ajuste</span>
        </article>

        <article className="summary-card">
          <span className="summary-label">Pedidos do EasyPrint</span>
          <strong className="summary-value">R$ {formatCurrency(totals.incomingOrdersTotal)}</strong>
          <span className="summary-footnote">{appState.incomingOrders.length} pedido(s) recebidos via hub</span>
        </article>

        <article className="summary-card">
          <span className="summary-label">Total Caixa</span>
          <strong className="summary-value">R$ {formatCurrency(totals.cashTotal)}</strong>
          <span className="summary-footnote">Manual + EasyPrint separado por forma de pagamento</span>
        </article>
      </section>

      <section className="card">
        <div className="section-header">
          <div className="section-heading">
            <h3 className="section-title">Motoboys</h3>
            <p className="section-description">
              Cada taxa vira uma coluna automaticamente. O total por motoboy e calculado sem depender de valor fixo manual.
            </p>
          </div>

          <div className="section-actions">
            <button type="button" className="btn btn-primary" onClick={actions.addCourier}>
              + Adicionar motoboy
            </button>
          </div>
        </div>

        <div className="table-shell">
          <table className="data-table responsive-table courier-table">
            <thead>
              <tr>
                <th>Nome</th>
                {appState.rateConfigs.map((rate) => (
                  <th key={rate.id}>
                    {rate.name}
                    <small>R$ {formatCurrency(rate.value)}</small>
                  </th>
                ))}
                <th>Ajuste</th>
                <th>Total</th>
                <th>Acoes</th>
              </tr>
            </thead>

            <tbody>
              {appState.couriers.map((courier) => (
                <tr key={courier.id}>
                  <td data-label="Nome">
                    <input
                      type="text"
                      className="input"
                      value={courier.name}
                      placeholder="Nome do motoboy"
                      onChange={(event) => actions.updateCourier(courier.id, { name: event.target.value })}
                    />
                  </td>

                  {appState.rateConfigs.map((rate) => (
                    <td key={rate.id} data-label={rate.name}>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        className="input home-compact-input"
                        value={courier.countsByRate[rate.id]}
                        placeholder="0"
                        onChange={(event) =>
                          actions.updateCourier(courier.id, {
                            countsByRate: {
                              [rate.id]: event.target.value
                            }
                          })
                        }
                      />
                    </td>
                  ))}

                  <td data-label="Ajuste">
                    <div className="adjustment-field">
                      <select
                        className="select"
                        value={courier.adjustmentSign}
                        onChange={(event) =>
                          actions.updateCourier(courier.id, {
                            adjustmentSign: event.target.value
                          })
                        }
                      >
                        <option value="+">+</option>
                        <option value="-">-</option>
                      </select>

                      <input
                        type="number"
                        step="0.01"
                        className="input"
                        value={courier.adjustmentValue}
                        placeholder="0,00"
                        onChange={(event) =>
                          actions.updateCourier(courier.id, {
                            adjustmentValue: event.target.value
                          })
                        }
                      />
                    </div>
                  </td>

                  <td data-label="Total">
                    <strong>R$ {formatCurrency(calculateCourierTotal(courier, appState.rateConfigs))}</strong>
                  </td>

                  <td data-label="Acoes">
                    <button
                      type="button"
                      className="btn btn-danger btn-icon"
                      onClick={() => actions.removeCourier(courier.id)}
                    >
                      <Icon name="trash" size={15} />
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="home-lower-grid">
        <article className="card">
          <div className="section-header">
            <div className="section-heading">
              <h3 className="section-title">Pedidos do EasyPrint</h3>
              <p className="section-description">
                Pedidos do EasyPrint recebidos via hub entram separados em dinheiro, cartao e online.
              </p>
            </div>

            <div className="section-actions">
              <button type="button" className="btn btn-secondary" onClick={actions.clearIncomingOrders}>
                Limpar entradas
              </button>
            </div>
          </div>

          <div className="table-shell">
            <table className="data-table responsive-table orders-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Filial</th>
                  <th>Pedido</th>
                  <th>Dinheiro</th>
                  <th>Cartao</th>
                  <th>Online</th>
                  <th>Total</th>
                  <th>Recebido</th>
                </tr>
              </thead>

              <tbody>
                {appState.incomingOrders.length ? (
                  appState.incomingOrders.map((order) => (
                    <tr key={order.hubOrderId || `${order.sourceBranchId}-${order.receivedAt}`}>
                      <td data-label="Data">{order.operationalDate || '-'}</td>
                      <td data-label="Filial">{order.sourceBranchName || '-'}</td>
                      <td data-label="Pedido">{order.hubOrderId || '-'}</td>
                      <td data-label="Dinheiro">R$ {formatCurrency(order.cashAmount)}</td>
                      <td data-label="Cartao">R$ {formatCurrency(order.cardAmount)}</td>
                      <td data-label="Online">R$ {formatCurrency(order.onlineAmount)}</td>
                      <td data-label="Total">R$ {formatCurrency(order.totalAmount)}</td>
                      <td data-label="Recebido">{formatDateTime(order.receivedAt)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" className="empty-state">
                      Nenhum pedido do EasyPrint recebido ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <div className="home-side-column">
          <article className="card">
            <div className="section-header">
              <div className="section-heading">
                <h3 className="section-title">Configuracao do Relatorio</h3>
                <p className="section-description">
                  Escolha o que entra na imagem final para evitar um fechamento muito carregado.
                </p>
              </div>

              <div className="section-actions">
                <button type="button" className="btn btn-secondary" onClick={actions.resetReportConfig}>
                  Restaurar padrao
                </button>
              </div>
            </div>

            <div className="report-config-grid">
              <label className="field field-checkbox">
                <input
                  type="checkbox"
                  checked={reportConfig.showSummaryCards}
                  onChange={(event) => actions.setReportConfigField('showSummaryCards', event.target.checked)}
                />
                <div>
                  <div className="field-label">Mostrar resumo superior</div>
                  <div className="field-helper">Exibe os cards de totais no topo do relatorio.</div>
                </div>
              </label>

              <label className="field field-checkbox">
                <input
                  type="checkbox"
                  checked={reportConfig.showCourierTable}
                  onChange={(event) => actions.setReportConfigField('showCourierTable', event.target.checked)}
                />
                <div>
                  <div className="field-label">Mostrar tabela de motoboys</div>
                  <div className="field-helper">Mantem o detalhamento por taxa de cada motoboy.</div>
                </div>
              </label>

              <label className="field field-checkbox">
                <input
                  type="checkbox"
                  checked={reportConfig.showIncomingOrdersTable}
                  onChange={(event) => actions.setReportConfigField('showIncomingOrdersTable', event.target.checked)}
                />
                <div>
                  <div className="field-label">Mostrar pedidos do EasyPrint</div>
                  <div className="field-helper">Oculta a tabela dos pedidos recebidos quando quiser um layout mais limpo.</div>
                </div>
              </label>

              <label className="field field-checkbox">
                <input
                  type="checkbox"
                  checked={reportConfig.showManualCashDetails}
                  onChange={(event) => actions.setReportConfigField('showManualCashDetails', event.target.checked)}
                />
                <div>
                  <div className="field-label">Mostrar caixa manual</div>
                  <div className="field-helper">Exibe dinheiro, cartao e online preenchidos manualmente.</div>
                </div>
              </label>

              <label className="field field-checkbox">
                <input
                  type="checkbox"
                  checked={reportConfig.showEasyPrintBreakdown}
                  onChange={(event) => actions.setReportConfigField('showEasyPrintBreakdown', event.target.checked)}
                />
                <div>
                  <div className="field-label">Mostrar rateio do EasyPrint</div>
                  <div className="field-helper">Exibe o detalhamento por dinheiro, cartao e online vindo do EasyPrint.</div>
                </div>
              </label>
            </div>
          </article>

          <article className="card">
            <div className="section-heading">
              <h3 className="section-title">Caixa Final</h3>
              <p className="section-description">
                Os valores manuais continuam editaveis e o EasyPrint entra separado por forma de pagamento.
              </p>
            </div>

            <div className="cash-grid">
              <label className="field">
                <span className="field-label">Dinheiro manual (R$)</span>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  value={appState.cash.dinheiro}
                  placeholder="0"
                  onChange={(event) => actions.setCashField('dinheiro', event.target.value)}
                />
              </label>

              <label className="field">
                <span className="field-label">Cartao manual (R$)</span>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  value={appState.cash.cartao}
                  placeholder="0"
                  onChange={(event) => actions.setCashField('cartao', event.target.value)}
                />
              </label>

              <label className="field">
                <span className="field-label">Online manual (R$)</span>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  value={appState.cash.online}
                  placeholder="0"
                  onChange={(event) => actions.setCashField('online', event.target.value)}
                />
              </label>

              <label className="field">
                <span className="field-label">EasyPrint dinheiro (R$)</span>
                <input
                  type="text"
                  className="input"
                  value={formatCurrency(incomingPaymentTotals.dinheiro)}
                  readOnly
                />
              </label>

              <label className="field">
                <span className="field-label">EasyPrint cartao (R$)</span>
                <input
                  type="text"
                  className="input"
                  value={formatCurrency(incomingPaymentTotals.cartao)}
                  readOnly
                />
              </label>

              <label className="field">
                <span className="field-label">EasyPrint online (R$)</span>
                <input
                  type="text"
                  className="input"
                  value={formatCurrency(incomingPaymentTotals.online)}
                  readOnly
                />
              </label>

              <label className="field">
                <span className="field-label">EasyPrint nao classificado (R$)</span>
                <input
                  type="text"
                  className="input"
                  value={formatCurrency(incomingPaymentTotals.unmapped)}
                  readOnly
                />
              </label>
            </div>

            <div className="totals-strip">
              <div className="total-chip">
                <div className="total-chip-label">Total Caixa</div>
                <div className="total-chip-value">R$ {formatCurrency(totals.cashTotal)}</div>
              </div>
            </div>
          </article>

          <article className="card">
            <div className="section-header">
              <div className="section-heading">
                <h3 className="section-title">Imagem do Fechamento</h3>
                <p className="section-description">
                  A imagem agora e gerada em uma area isolada, sem zoom artificial, e a ultima pre-visualizacao continua salva no localStorage.
                </p>
              </div>

              <div className="section-actions">
                <button type="button" className="btn btn-danger" onClick={handleClearDay}>
                  <Icon name="trash" size={16} />
                  Limpar tudo do dia
                </button>
                <button type="button" className="btn btn-primary" onClick={() => setIsPreviewOpen(true)}>
                  <Icon name="report" size={16} />
                  Exportar imagem
                </button>
              </div>
            </div>

            <div className="status-note">{savedPreviewText}</div>
            <p className="hint-text">A captura usa uma renderizacao dedicada para evitar sobreposicao de texto. O reset limpa apenas os dados operacionais do dia.</p>
          </article>
        </div>
      </section>

      {isPreviewOpen ? (
        <PreviewModal
          html={summaryHtml}
          initialImage={previewImage?.dataUrl || ''}
          onClose={() => setIsPreviewOpen(false)}
          onGenerated={({ dataUrl, generatedAt }) => actions.setPreviewImage({ dataUrl, generatedAt })}
        />
      ) : null}
    </div>
  );
}
