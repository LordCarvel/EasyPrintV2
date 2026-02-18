import { useEffect, useMemo, useState } from 'react';
import { Printer } from '../../shared/utils/Printer';
import { buildHighlighter, escapeHtml } from '../../shared/utils/highlight';
import './ConfigTemplate.css';

const DEFAULT_TEMPLATE = {
  showBranch: true,
  showOrderNumber: true,
  showTime: true,
  showCustomer: true,
  showLocator: true,
  showAddress: true,
  showDelivery: true,
  showItems: true,
  showPayment: true,
  highlightKeywords: true,
  paymentFontSize: 'large'
};

const SAMPLE_ORDER = {
  number: '6390',
  customer: 'Zilda Ferreira',
  brand: 'PIZZAS 10 GRAVATA',
  store: 'PIZZAS 10 GRAVATA',
  placedAt: '21:18',
  locator: '3111 8799',
  channel: 'via iFood',
  eta: '21:57',
  orderPosition: '1o pedido',
  contactPhone: '0800 700 3020',
  contactId: '31118799',
  status: 'Pedido em preparo',
  elapsed: 'Ha 1 minuto.',
  address: {
    street: 'R. Luzia Nascimento Oliveira, 152 - Armacao - Penha',
    complement: 'Ap 1'
  },
  deliveryType: 'Entrega propria',
  deliveryStatus: 'Confirmacao de entrega pendente',
  items: [
    {
      name: 'Pizza 35cm (8 Fatias)',
      price: 49.99,
      qty: 1,
      additions: [
        { name: 'Frango com Catupiry Original', price: 5.0, qty: 1 },
        { name: 'Borda Sem Recheio', price: 0, qty: 1 }
      ]
    }
  ],
  deliveryFee: 4.99,
  subtotal: 54.98,
  incentives: [
    { label: 'Valores cobrados da sua loja', value: -4.99 },
    { label: 'Incentivos iFood', value: -17.5 },
    { label: 'Promocao paga pelo iFood', value: -17.5 }
  ],
  payment: {
    title: 'Pago via iFood-PIX - PIX',
    description: 'O iFood ja recebeu este valor e vamos repassar a sua loja',
    value: -32.49,
    footer: 'Pago via iFood, nao precisa cobrar na entrega'
  }
};

const bullet = '<span style="margin: 0 6px;">&#8226;</span>';
const currency = (value) => {
  const abs = Math.abs(value).toFixed(2).replace('.', ',');
  return value < 0 ? `-R$ ${abs}` : `R$ ${abs}`;
};

export function ConfigTemplate() {
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [preview, setPreview] = useState('');
  const [keywordsConfig, setKeywordsConfig] = useState([]);
  const highlightText = useMemo(() => buildHighlighter(keywordsConfig), [keywordsConfig]);

  useEffect(() => {
    const saved = localStorage.getItem('template');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setTemplate({ ...DEFAULT_TEMPLATE, ...parsed });
      } catch {
        setTemplate(DEFAULT_TEMPLATE);
      }
    }

    const savedKeywords = localStorage.getItem('keywords');
    if (savedKeywords) {
      try {
        setKeywordsConfig(JSON.parse(savedKeywords));
      } catch {
        setKeywordsConfig([]);
      }
    }
  }, []);

  useEffect(() => {
    generatePreview();
  }, [template, keywordsConfig]);

  const saveTemplate = (newTemplate) => {
    setTemplate(newTemplate);
    localStorage.setItem('template', JSON.stringify(newTemplate));
  };

  const toggleOption = (key) => {
    const newTemplate = { ...template, [key]: !template[key] };
    saveTemplate(newTemplate);
  };

  const applyHighlight = (text) =>
    template.highlightKeywords ? highlightText(text) : escapeHtml(text);

  const buildHeader = (order) => {
    let html = '';

    if (template.showOrderNumber) {
      html += `<div style="text-align:center; font-weight:700; font-size:18px; letter-spacing:1px;">${order.number}</div>`;
    }

    if (template.showCustomer) {
      html += `<div style="text-align:center; font-size:13px; margin-top:2px;">${applyHighlight(order.customer)}</div>`;
    }

    if (template.showBranch) {
      html += `<div style="text-align:center; font-size:12px; margin-top:4px; font-weight:700;">${applyHighlight(order.brand)}</div>`;
      html += `<div style="text-align:center; font-size:12px;">${applyHighlight(order.store)}</div>`;
    }

    const timeBits = [];
    if (template.showTime) timeBits.push(applyHighlight(`Feito as ${order.placedAt}`));
    if (template.showLocator) timeBits.push(applyHighlight(`Localizador ${order.locator}`));
    timeBits.push(applyHighlight(order.channel));

    if (timeBits.length) {
      html += `<div style="text-align:center; font-size:11px; margin-top:6px;">${timeBits.join(` ${bullet} `)}</div>`;
    }

    if (template.showTime) {
      html += `<div style="text-align:center; font-size:11px; margin-top:2px;">${applyHighlight(`Entrega prevista:${order.eta}`)}</div>`;
    }

    html += `<div style="text-align:center; font-size:10px; margin-top:2px;">${applyHighlight(order.orderPosition)}</div>`;
    html += `<div style="text-align:center; font-size:10px; margin-top:2px;">${applyHighlight(`${order.contactPhone} ID: ${order.contactId}`)}</div>`;
    html += `<div style="text-align:center; font-size:11px; margin-top:4px; font-weight:700;">${applyHighlight(order.status)}</div>`;
    html += `<div style="text-align:center; font-size:10px; color:#555;">${applyHighlight(order.elapsed)}</div>`;
    html += `<div style="margin:8px 0; border-bottom:1px dashed #000;"></div>`;
    return html;
  };

  const buildAddress = (order) => {
    const rows = [];
    if (template.showAddress) {
      rows.push(applyHighlight(`${order.address.street} -`));
      if (order.address.complement) rows.push(applyHighlight(order.address.complement));
    }
    if (template.showDelivery) {
      if (order.deliveryType) rows.push(applyHighlight(order.deliveryType));
      if (order.deliveryStatus) rows.push(applyHighlight(order.deliveryStatus));
    }

    if (!rows.length) return '';

    let html = '<div style="margin-bottom:10px; font-size:11px; line-height:1.5;">';
    rows.forEach((row) => {
      html += `<div>${row}</div>`;
    });
    html += '</div>';
    return html;
  };

  const buildItems = (order) => {
    let html = '<div style="font-size:11px; line-height:1.55; border-bottom:1px dashed #000; padding-bottom:8px;">';
    html += '<div style="font-weight:700; text-transform:uppercase;">Itens no pedido</div>';
    html += '<div style="font-size:10px; color:#777;">Substituir itens</div>';

    order.items.forEach((item) => {
      html += '<div style="margin-top:6px;">';
      html += '<div style="display:flex; justify-content:space-between; align-items:flex-start; column-gap:8px; font-weight:700;">';
      html += `<span style="flex:1; word-break:break-word;">${applyHighlight(item.name)}</span><span style="white-space:nowrap;">${currency(item.price)}</span>`;
      html += '</div>';

      item.additions?.forEach((add) => {
        html += '<div style="display:flex; justify-content:space-between; align-items:flex-start; column-gap:8px; margin-left:8px; font-size:10px;">';
        html += `<span style="flex:1; word-break:break-word;">${applyHighlight(add.name)}</span><span style="white-space:nowrap;">${currency(add.price)}</span>`;
        html += '</div>';
      });

      html += '</div>';
    });

    html += `<div style="display:flex; justify-content:space-between; margin-top:8px;"><span>Taxa de entrega</span><span>${currency(order.deliveryFee)}</span></div>`;
    html += `<div style="display:flex; justify-content:space-between; margin-top:4px; font-weight:700;"><span>Subtotal</span><span>${currency(order.subtotal)}</span></div>`;

    html += '<div style="margin-top:8px; font-weight:700;">Incentivos e cobrancas da loja</div>';
    order.incentives.forEach((inc) => {
      html += `<div style="display:flex; justify-content:space-between;"><span>${inc.label}</span><span>${currency(inc.value)}</span></div>`;
    });

    html += '</div>';
    return html;
  };

  const buildPayment = (order) => {
    const fontSizeMap = { small: '10px', normal: '12px', large: '14px' };
    const fontSize = fontSizeMap[template.paymentFontSize] || '12px';

    let html = '<div style="margin-top:10px;">';
    html += `<div style="text-align:center; border:1px dashed #000; padding:8px; font-size:${fontSize};">`;
    html += `<div style="font-weight:700;">${applyHighlight(order.payment.title)}</div>`;
    html += `<div style="font-size:11px; margin:4px 0;">${applyHighlight(order.payment.description)}</div>`;
    html += `<div style="font-weight:700; color:#0a9a3e; margin:4px 0;">${applyHighlight(currency(order.payment.value))}</div>`;
    html += `<div style="font-size:11px;">${applyHighlight(order.payment.footer)}</div>`;
    html += '</div>';
    html += '</div>';
    return html;
  };

  const generatePreview = () => {
    const order = SAMPLE_ORDER;
    let html = '<div class="receipt-root" style="font-family: Arial, sans-serif; font-size: 11px; max-width: 240px; line-height: 1.55;">';

    html += buildHeader(order);
    html += buildAddress(order);
    if (template.showItems) html += buildItems(order);
    if (template.showPayment) html += buildPayment(order);

    html += '</div>';
    setPreview(html);
  };

  const handlePrint = () => {
    if (!preview) return;
    Printer.printPreview(preview);
  };

  return (
    <div className="config-template" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div className="config-header">
        <h2>Configuracao da Comanda</h2>
        <p>Personalize o layout da comanda termica</p>
      </div>

      <div className="template-layout" style={{ display: 'flex', gap: 16, padding: '12px', flex: 1 }}>
        <div className="template-controls" style={{ width: 340, boxSizing: 'border-box' }}>
          <div className="controls-section" style={{ padding: '12px' }}>
            <h3>Elementos Visiveis</h3>

            <div className="checkbox-group">
              <label className="checkbox-item">
                <input type="checkbox" checked={template.showBranch} onChange={() => toggleOption('showBranch')} />
                <span>Filial</span>
              </label>
            </div>

            <div className="checkbox-group">
              <label className="checkbox-item">
                <input type="checkbox" checked={template.showOrderNumber} onChange={() => toggleOption('showOrderNumber')} />
                <span>Numero do Pedido</span>
              </label>
            </div>

            <div className="checkbox-group">
              <label className="checkbox-item">
                <input type="checkbox" checked={template.showTime} onChange={() => toggleOption('showTime')} />
                <span>Horario de Entrega</span>
              </label>
            </div>

            <div className="checkbox-group">
              <label className="checkbox-item">
                <input type="checkbox" checked={template.showCustomer} onChange={() => toggleOption('showCustomer')} />
                <span>Nome do Cliente</span>
              </label>
            </div>

            <div className="checkbox-group">
              <label className="checkbox-item">
                <input type="checkbox" checked={template.showLocator} onChange={() => toggleOption('showLocator')} />
                <span>Localizador</span>
              </label>
            </div>

            <div className="checkbox-group">
              <label className="checkbox-item">
                <input type="checkbox" checked={template.showAddress} onChange={() => toggleOption('showAddress')} />
                <span>Endereco</span>
              </label>
            </div>

            <div className="checkbox-group">
              <label className="checkbox-item">
                <input type="checkbox" checked={template.showDelivery} onChange={() => toggleOption('showDelivery')} />
                <span>Info de Entrega</span>
              </label>
            </div>

            <div className="checkbox-group">
              <label className="checkbox-item">
                <input type="checkbox" checked={template.showItems} onChange={() => toggleOption('showItems')} />
                <span>Itens do Pedido</span>
              </label>
            </div>

            <div className="checkbox-group">
              <label className="checkbox-item">
                <input type="checkbox" checked={template.showPayment} onChange={() => toggleOption('showPayment')} />
                <span>Informacoes de Pagamento</span>
              </label>
            </div>

            <div className="checkbox-group">
              <label className="checkbox-item">
                <input type="checkbox" checked={template.highlightKeywords} onChange={() => toggleOption('highlightKeywords')} />
                <span>Destaque de Palavras-Chave</span>
              </label>
            </div>
          </div>
        </div>

        <div className="template-preview" style={{ flex: 1 }}>
          <div className="preview-thermal">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div
                className="printer-icon"
                title="Imprimir"
                onClick={handlePrint}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handlePrint()}
                style={{
                  width: 40,
                  height: 40,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#f5f5f5',
                  borderRadius: 6,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  cursor: 'pointer'
                }}
              >
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M6 9V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v5"
                    stroke="#333"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <rect x="6" y="13" width="12" height="6" rx="1" stroke="#333" strokeWidth="1.5" fill="none" />
                  <path d="M6 13h12" stroke="#333" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M9 16h6" stroke="#333" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <div className="preview-title">Previa da Comanda Termica</div>
            </div>

            <div
              className="preview-content"
              style={{ padding: '16px', background: '#fff', border: '1px solid #eee', boxSizing: 'border-box', borderRadius: 6 }}
              dangerouslySetInnerHTML={{ __html: preview }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}


