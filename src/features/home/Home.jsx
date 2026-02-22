import { useEffect, useMemo, useRef, useState } from 'react';
import { Printer } from '../../shared/utils/Printer';
import { buildHighlighter, escapeHtml } from '../../shared/utils/highlight';
import './Home.css';
const DEFAULT_CATALOG = [
  { name: 'Carne', price: 4.49 },
  { name: 'Frango', price: 5.49 },
  { name: 'Frango com Catupiry Original', price: 6.99 },
  { name: 'Frango com Cheddar', price: 5.49 },
  { name: 'Frango com Requeijão', price: 5.49 },
  { name: 'Calabresa', price: 5.49 },
  { name: 'Calabresa com Catupiry Original', price: 6.99 },
  { name: 'Calabresa com Cheddar', price: 5.49 },
  { name: 'Calabresa com Requeijão', price: 5.49 },
  { name: 'Bacon', price: 5.49 },
  { name: 'Bacon com Catupiry Original', price: 6.99 },
  { name: 'Bacon com Cheddar', price: 5.49 },
  { name: 'Bacon com Requeijão', price: 5.49 },
  { name: 'Brócolis com Bacon', price: 5.49 },
  { name: 'Mussarela', price: 5.49 },
  { name: '4 Queijos', price: 5.49 },
  { name: 'Alho e Óleo', price: 5.49 },
  { name: 'Atum', price: 5.49 },
  { name: 'Palmito', price: 5.49 },
  { name: 'Pizza', price: 5.49 },
  { name: 'Brigadeiro', price: 6.49 },
  { name: 'Confetes', price: 6.49 },
  { name: 'Chocolate', price: 6.49 },
  { name: 'Chocolate Branco', price: 6.49 },
  { name: 'Nutella com Ninho', price: 6.49 },
  { name: 'Prestígio', price: 6.49 },
  { name: 'Ovomaltine', price: 6.49 },
  { name: 'Combo 10 Esfihas + Kuat 2L', price: 47.99 },
  { name: 'Combo 12 Esfihas Especiais', price: 46.99 },
  { name: 'Combo 15 Esfihas + Kuat 2L', price: 72.99 },
  { name: 'Combo 20 Esfihas + Kuat 2L', price: 84.99 },
  { name: 'Combo 20 Esfihas de Carne + Coca 2L', price: 82.99 }
];

const DEFAULT_PRINT_TEMPLATE = {
  showBranch: true,
  showOrderNumber: true,
  showTime: true,
  showCustomer: true,
  showLocator: true,
  showAddress: true,
  showDelivery: true,
  showItems: true,
  showPayment: true,
  highlightKeywords: true
};

export function Home() {
  const [text, setText] = useState('');
  const [keywordsConfig, setKeywordsConfig] = useState([]);
  const [enableHighlight, setEnableHighlight] = useState(true);
  const [template, setTemplate] = useState(DEFAULT_PRINT_TEMPLATE);
  const [catalogEntries, setCatalogEntries] = useState(DEFAULT_CATALOG);
  const highlightText = useMemo(() => {
    const highlighter = buildHighlighter(keywordsConfig);
    if (!enableHighlight) {
      return (value = '') => escapeHtml(value ?? '');
    }
    return highlighter;
  }, [keywordsConfig, enableHighlight]);
  const textareaRef = useRef(null);

  const bullet = '<span style="margin: 0 6px;">&#8226;</span>';
  const PAYMENT_KEYWORDS = [
    { word: 'dinheiro', cash: 3 },
    { word: 'troco', cash: 1 },
    { word: 'cobrar na entrega', cash: 2 },
    { word: 'levar troco', cash: 2 },
    { word: 'valor para levar de troco', cash: 2 },
    { word: 'pagar em espécie', cash: 2 },
    { word: 'pagar em especie', cash: 2 },

    { word: 'carteira digital', online: 3 },
    { word: 'pago via ifood', online: 3 },
    { word: 'ifood já recebeu', online: 3 },
    { word: 'ifood ja recebeu', online: 3 },
    { word: 'não precisa cobrar', online: 3 },
    { word: 'nao precisa cobrar', online: 3 },
    { word: 'pago via digital', online: 2 },
    { word: 'pago online', online: 2 },
    { word: 'pago no app', online: 2 },
    { word: 'pagamento confirmado', online: 1 },
    { word: 'autorizado no app', online: 1 },
    { word: 'pagamento antecipado', online: 1 },
    { word: 'wallet', online: 1 },
    { word: 'carteira', online: 1 },
    { word: 'pix', online: 1 },

    { word: 'cartão', card: 2 },
    { word: 'cartao', card: 2 },
    { word: 'crédito', card: 2 },
    { word: 'credito', card: 2 },
    { word: 'débito', card: 2 },
    { word: 'debito', card: 2 },
    { word: 'maquininha', card: 2 },
    { word: 'passar o cartão', card: 2 },
    { word: 'pagar no cartão', card: 2 },
    { word: 'mastercard', card: 1, online: 1 },
    { word: 'visa', card: 1, online: 1 },
    { word: 'elo', card: 1, online: 1 },
    { word: 'hiper', card: 1, online: 1 },
    { word: 'hipercard', card: 1, online: 1 },
    { word: 'amex', card: 1, online: 1 },
    { word: 'vale refeição', card: 1 },
    { word: 'vale refeicao', card: 1 },
    { word: 'vr', card: 1 },
    { word: 'va', card: 1 },
    { word: 'vale alimentação', card: 1 },
    { word: 'vale alimentacao', card: 1 }
  ];

  const toCurrency = (line) => {
    const cleaned = line.replace(/[^\d,-]/g, '').replace(',', '.');
    const value = parseFloat(cleaned || '0');
    const abs = Math.abs(value).toFixed(2).replace('.', ',');
    return value < 0 ? `-R$ ${abs}` : `R$ ${abs}`;
  };

  const toNumber = (line) => {
    if (!line) return 0;
    const cleaned = line.replace(/[^\d,-]/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return Number.isFinite(num) ? num : 0;
  };

  const normalizeText = (value = '') =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  const parseCatalogEntries = (rawCatalogs) => {
    if (!Array.isArray(rawCatalogs)) return DEFAULT_CATALOG;
    const entries = [];
    rawCatalogs.forEach((catalog) => {
      const content = catalog?.content || '';
      content
        .split(';')
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((pair) => {
          const [namePart, pricePart] = pair.split(':');
          if (!namePart || !pricePart) return;
          const price = toNumber(pricePart);
          if (price > 0) {
            entries.push({ name: namePart.trim(), price });
          }
        });
    });
    if (!entries.length) return DEFAULT_CATALOG;
    const merged = new Map();
    entries.forEach((entry) => {
      merged.set(normalizeText(entry.name), entry);
    });
    DEFAULT_CATALOG.forEach((entry) => {
      const key = normalizeText(entry.name);
      if (!merged.has(key)) {
        merged.set(key, entry);
      }
    });
    return Array.from(merged.values());
  };

  const findCatalogEntry = (itemName) => {
    const normItem = normalizeText(itemName);
    if (!normItem) return null;
    let best = null;
    let bestScore = -1;
    let bestLen = -Infinity;
    const source = catalogEntries.length ? catalogEntries : DEFAULT_CATALOG;
    source.forEach((entry) => {
      const normEntry = normalizeText(entry.name);
      if (!normEntry) return;
      let score = 0;
      let tieLen = 0;
      if (normItem === normEntry) {
        score = 3;
        tieLen = normEntry.length;
      } else if (normItem.includes(normEntry)) {
        score = 2;
        tieLen = normEntry.length;
      } else if (normEntry.includes(normItem)) {
        score = 1;
        tieLen = -normEntry.length;
      } else {
        return;
      }

      if (score > bestScore || (score === bestScore && tieLen > bestLen)) {
        best = entry;
        bestScore = score;
        bestLen = tieLen;
      }
    });
    return best;
  };

  const findUnitPrice = (itemName) => {
    const entry = findCatalogEntry(itemName);
    return entry ? entry.price : null;
  };

  const extractQtyFromName = (name = '') => {
    const match = name.match(/(\d+)\s*(?:esfihas?|esfiha|un|unidades?)/i);
    if (match) return match[1];
    const comboMatch = name.match(/combo\s*(?:de\s*)?(\d+)\s*(?:esfihas?|esfiha|un|unidades?)/i);
    if (comboMatch) return comboMatch[1];
    return '';
  };

  const inferQtyFromPrice = (itemName = '', priceLine = '') => {
    const priceValue = toNumber(priceLine);
    const unitPrice = findUnitPrice(itemName);
    if (unitPrice && priceValue > 0) {
      const raw = priceValue / unitPrice;
      const rounded = Math.round(raw);
      const closeEnough = rounded > 0 && Math.abs(raw - rounded) <= 0.2;
      if (closeEnough) return String(rounded);
    }
    return '';
  };

  const inferQty = (item) => {
    if (item.qty) return item.qty;

    const name = item.name || '';
    const isCombo = /combo/i.test(name);
    if (isCombo) return inferQtyFromPrice(name, item.price) || '1';

    const nameQty = extractQtyFromName(name);
    if (nameQty) return nameQty;

    const qtyByPrice = inferQtyFromPrice(name, item.price);
    if (qtyByPrice) return qtyByPrice;

    return '';
  };

  const getDisplayQty = (item = {}) => {
    const fallbackQty = item.qty || item.inferredQty || '';
    if (!fallbackQty) return '';

    const normName = normalizeText(item.name || '');
    if (!normName.includes('combo')) return fallbackQty;

    // For combos, prefer the number inferred by price (qtd de combos) instead of the combo size in the name.
    const qtyByPrice = inferQtyFromPrice(item.name || '', item.price || '');
    if (qtyByPrice) return qtyByPrice;

    if (item.explicitQty) {
      const comboQtyFromName = extractQtyFromName(item.name || '');
      if (comboQtyFromName && item.explicitQty === comboQtyFromName) return '1';
      return item.explicitQty;
    }

    return fallbackQty || '1';
  };

  const shouldShowQty = (item, items = [], index = -1, orderMeta = {}) => {
    const qty = getDisplayQty(item);
    if (!qty) return false;
    const name = item.name || '';
    const normName = normalizeText(name);
    const isStandalonePizza = (normalized = '') =>
      normalized.includes('pizza') && !/(esfih|esfiha)/.test(normalized);
    const isEsfiha = (normalized = '') => /(esfih|esfiha)/.test(normalized);
    const isMainPizza = (normalized = '') =>
      /(pizza\s*\d+\s*cm|fatia|fatias|borda|broto|media|m[eé]dia|grande|familia|fam[ií]lia)/.test(normalized);
    const isFlavorLikeItem = (candidate) => {
      if (!candidate) return false;
      const candidateNorm = normalizeText(candidate.name || '');
      const candidatePrice = toNumber(candidate.price || '');
      if (!candidateNorm || candidatePrice <= 0) return false;
      if (candidateNorm.includes('combo')) return false;
      if (isMainPizza(candidateNorm)) return false;
      return candidatePrice <= 12;
    };
    const isPizzaInEsfihaContext = () => {
      if (!normName.includes('pizza')) return false;
      const storeNorm = normalizeText(`${orderMeta.brand || ''} ${orderMeta.store || ''}`);
      const marcaEhEsfiha = isEsfiha(storeNorm);
      const vizinhoPareceEsfiha = [items[index - 1], items[index + 1]].some((it) => isFlavorLikeItem(it));
      const pedidoPareceEsfiha = items.filter((it) => isFlavorLikeItem(it)).length >= 4;
      const pizzaParecePrincipal = isMainPizza(normName);
      if (marcaEhEsfiha) return true;
      if (!pizzaParecePrincipal && vizinhoPareceEsfiha) return true;
      if (!pizzaParecePrincipal && pedidoPareceEsfiha) return true;
      return false;
    };
    if (normName.includes('combo')) return true;
    if (isEsfiha(normName)) return true;
    if (isStandalonePizza(normName)) return isPizzaInEsfihaContext();

    const entry = findCatalogEntry(name);
    if (!entry) return isPizzaInEsfihaContext();
    const entryNorm = normalizeText(entry.name || '');
    if (entryNorm.includes('combo')) return true;
    if (isStandalonePizza(entryNorm) && !isEsfiha(normName)) return isPizzaInEsfihaContext();
    return true;
  };

  const paymentMethodFromPayment = (payment = {}) => {
    const text = `${payment.title || ''} ${payment.description || ''} ${payment.footer || ''}`.toLowerCase();
    let scores = { online: 0, card: 0, cash: 0 };

    PAYMENT_KEYWORDS.forEach(({ word, online = 0, card = 0, cash = 0 }) => {
      if (text.includes(word)) {
        scores.online += online;
        scores.card += card;
        scores.cash += cash;
      }
    });
    if (scores.cash >= 3) return 'dinheiro';
    const max = Math.max(scores.online, scores.card, scores.cash);
    if (max === scores.online) return 'online';
    if (max === scores.card) return 'cartao';
    return 'dinheiro';
  };

  const render = (value) => highlightText(value ?? '');

  const parseOrderText = (raw) => {
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !/^[\u2022\u25CF]+$/.test(l));

    const lowerLines = lines.map((l) => l.toLowerCase());
    const findLine = (predicate) => {
      const idx = lowerLines.findIndex(predicate);
      return idx >= 0 ? lines[idx] : '';
    };

    const number = lines[0] || '';
    const customer = lines[1] || '';
    const brand = lines[2] || '';
    const store = lines[3] || '';

    const placedAt = findLine((l) => l.includes('feito'))?.replace(/.*às?\s*/i, '') || '';
    const locator =
      findLine((l) => l.includes('localizador'))?.replace(/.*localizador\s*/i, '').trim() || '';
    const channel = '';
    const eta = findLine((l) => l.includes('entrega prevista'))
      ?.replace(/.*prevista:?\s*/i, '')
      .trim() || '';
    const orderPosition = findLine((l) => l.includes('pedido'));
    const contactLine = findLine((l) => l.includes('id:'));
    const status = findLine((l) => l.includes('prepar') || l.includes('pronto') || l.includes('saiu'));
    const elapsed = findLine((l) => l.startsWith('há ') || l.startsWith('ha '));

    let contactPhone = '';
    let contactId = '';
    if (contactLine) {
      const parts = contactLine.split(/id:/i);
      contactPhone = parts[0].trim();
      contactId = parts[1]?.trim() || '';
    }
    const addressStartIdx = lowerLines.findIndex(
      (l) => l.startsWith('r.') || l.startsWith('rua') || l.includes(' - ')
    );
    const address = { street: '', complement: '' };
    if (addressStartIdx >= 0) {
      address.street = lines[addressStartIdx].replace(/[\u2022\u25CF]/g, ' • ');
      const next = lines[addressStartIdx + 1] || '';
      if (next && !/entrega/.test(lowerLines[addressStartIdx + 1] || '')) {
        address.complement = next.replace(/[\u2022\u25CF]/g, ' • ');
      }
    }
    const deliveryType =
      findLine((l) => l.startsWith('entrega ') && !l.includes('prevista')) ||
      findLine((l) => l.includes('retira')) ||
      '';
    const deliveryStatus = findLine(
      (l) =>
        (l.includes('pendente') || l.includes('confirm') || l.includes('entregue') || l.includes('saiu')) &&
        !l.includes('prevista')
    );
    const itemsStart = lowerLines.findIndex((l) => l.startsWith('itens no pedido'));
    const totalsKeywords = ['taxa de entrega', 'taxa de servi', 'subtotal', 'incentivos', 'valores cobrados'];
    let items = [];
    let incentives = [];
    let payment = null;
    let cashReceive = '';
    let cashChange = '';

    if (itemsStart >= 0) {
      const afterItems = lines.slice(itemsStart + 1);
      const afterLower = lowerLines.slice(itemsStart + 1);

      let i = 0;
      let pendingQty = '';
      const isPrice = (line) => /-?\s*R\$\s*\d/.test(line);
      const isTotals = (low) => totalsKeywords.some((k) => low.startsWith(k));

      const splitNamePriceQty = (line) => {
        const priceMatch = line.match(/(-?\s*R\$\s*\d[\d.,]*)/i);
        const price = priceMatch ? priceMatch[1].trim() : '';
        const namePart = priceMatch ? line.replace(priceMatch[1], '').trim() : line.trim();
        const leadingQtyMatch = namePart.match(/^x\s*(\d+)\b/i);
        const trailingQtyMatch = namePart.match(/\bx\s*(\d+)\s*$/i);
        const qty = leadingQtyMatch?.[1] || trailingQtyMatch?.[1] || '';
        let cleanName = namePart;
        if (leadingQtyMatch) cleanName = cleanName.replace(/^x\s*\d+\b/i, '').trim();
        if (trailingQtyMatch) cleanName = cleanName.replace(/\bx\s*\d+\s*$/i, '').trim();
        return { name: cleanName, price, qty };
      };

      while (i < afterItems.length) {
        const line = afterItems[i];
        const low = afterLower[i];
        if (isTotals(low)) break;
        if (low.includes('substituir itens')) {
          i += 1;
          continue;
        }

        const isQtyOnly = /^\d+$/.test(line);
        if (isQtyOnly) {
          pendingQty = line;
          i += 1;
          continue;
        }
        const { name, price, qty } = splitNamePriceQty(line);
        let finalQty = qty || pendingQty || '';

        if (price) {
          items.push({ name, price, qty: finalQty, isPriceOnly: false });
          pendingQty = '';
          i += 1;
          continue;
        }
        let mergedName = name;
        let mergedQty = finalQty;
        let cursor = i + 1;
        let resolved = false;

        while (cursor < afterItems.length) {
          const candidate = afterItems[cursor];
          const candidateLow = afterLower[cursor];
          if (isTotals(candidateLow) || candidateLow.includes('substituir itens')) break;
          if (/^\d+$/.test(candidate)) break;

          if (isPrice(candidate)) {
            items.push({ name: mergedName, price: candidate, qty: mergedQty, isPriceOnly: false });
            pendingQty = '';
            i = cursor + 1;
            resolved = true;
            break;
          }

          const parsedCandidate = splitNamePriceQty(candidate);
          if (parsedCandidate.price) {
            const nextName = [mergedName, parsedCandidate.name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
            items.push({ name: nextName, price: parsedCandidate.price, qty: mergedQty || parsedCandidate.qty, isPriceOnly: false });
            pendingQty = '';
            i = cursor + 1;
            resolved = true;
            break;
          }

          if (parsedCandidate.qty && !mergedQty) mergedQty = parsedCandidate.qty;
          mergedName = [mergedName, parsedCandidate.name || candidate].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
          cursor += 1;
        }

        if (resolved) continue;

        items.push({ name: mergedName, price: '', qty: mergedQty || '' });
        pendingQty = '';
        i = cursor;
      }
      let totalsIdx = i;
      while (totalsIdx < afterItems.length) {
        const line = afterItems[totalsIdx];
        const low = afterLower[totalsIdx];
        if (low.startsWith('pago via') || low.startsWith('cobrar do cliente')) {
          break;
        }
        if (low.startsWith('incentivos')) break;

        const next = afterItems[totalsIdx + 1];
        if (isPrice(next)) {
          incentives.push({ label: line, value: next });
          totalsIdx += 2;
        } else if (isPrice(line)) {
          incentives.push({ label: '', value: line });
          totalsIdx += 1;
        } else {
          totalsIdx += 1;
        }
      }
      for (let j = totalsIdx; j < afterItems.length; j += 1) {
        const line = afterItems[j];
        const next = afterItems[j + 1];
        if (isPrice(next)) {
          incentives.push({ label: line, value: next });
          j += 1;
        } else if (line.toLowerCase().startsWith('pago via') || line.toLowerCase().startsWith('cobrar do cliente')) {
          const title = line;
          const description = afterItems[j + 1] || '';
          const valueLine = afterItems[j + 2] || '';
          const footer = afterItems[j + 3] || '';
          payment = { title, description, value: valueLine, footer };
          for (let k = j + 1; k < afterItems.length; k += 1) {
            const lowk = afterLower[k];
            if (lowk.startsWith('valor a receber em dinheiro')) cashReceive = afterItems[k];
            if (lowk.startsWith('valor para levar de troco')) cashChange = afterItems[k];
          }
          break;
        }
      }
    }
    items = items.map((item) => {
      const explicitQty = item.qty || '';
      const inferredQty = explicitQty ? '' : inferQty(item);
      return { ...item, explicitQty, inferredQty, qty: explicitQty || inferredQty };
    });

    return {
      number,
      customer,
      brand,
      store,
      placedAt,
      locator,
      channel,
      eta,
      orderPosition,
      contactPhone,
      contactId,
      status,
      elapsed,
      address,
      deliveryType,
      deliveryStatus,
      items,
      totals: incentives,
      payment,
      cashReceive,
      cashChange
    };
  };

  const buildHtml = (order) => {
    const currency = (line) => (/-?\s*R\$\s*\d/.test(line) ? toCurrency(line) : line);

    let html =
      '<div class="receipt-root" style="font-family: Arial, sans-serif; font-size: 12px; font-weight: 700; color: #000; max-width: 240px; line-height: 1.55;">';
    if (template.showBranch && order.brand) {
      html += `<div style="text-align:center; font-size:12px; margin-top:2px; font-weight:700;">${render(
        order.brand
      )}</div>`;
    }
    if (template.showBranch && order.store) {
      html += `<div style="text-align:center; font-size:12px; margin-top:0px; font-weight:700;">${render(order.store)}</div>`;
    }
    if (template.showCustomer && order.customer) {
      html += `<div style="text-align:center; font-size:14px; margin-top:2px; font-weight:700;">${render(
        order.customer
      )}</div>`;
    }

    const timeBits = [];
    if (template.showTime && order.placedAt) timeBits.push(render(`Feito às ${order.placedAt}`));
    if (template.showTime && order.eta) timeBits.push(render(`Entrega prevista: ${order.eta}`));
    if (timeBits.length) {
      html += `<div style="text-align:center; font-size:11px; margin-top:6px;">${timeBits.join(
        ` ${bullet} `
      )}</div>`;
    }
    if (template.showLocator && order.locator) {
      html += `<div style="text-align:center; font-size:15px; font-weight:800; margin-top:4px;">${render(
        `Localizador ${order.locator}`
      )}</div>`;
    }
    if (order.orderPosition) {
      html += `<div style="text-align:center; font-size:11px; margin-top:2px;">${render(
        order.orderPosition
      )}</div>`;
    }
    if (order.contactPhone) {
      const contactLine = `${order.contactPhone}${order.contactId ? ` ID: ${order.contactId}` : ''}`;
      html += `<div style="text-align:center; font-size:11px; margin-top:2px;">${render(contactLine)}</div>`;
    }
    if (order.status) {
      html += `<div style="text-align:center; font-size:11px; margin-top:4px; font-weight:700;">${render(
        order.status
      )}</div>`;
    }
    if (order.elapsed) {
      html += `<div style="text-align:center; font-size:11px; font-weight:700; color:#000;">${render(
        order.elapsed
      )}</div>`;
    }
    if (template.showOrderNumber && order.number) {
      html += `<div style="text-align:center; font-weight:700; font-size:22px; letter-spacing:1px; margin-top:6px;">${render(
        order.number
      )}</div>`;
    }
    html += `<div style="margin:8px 0; border-bottom:1px dashed #000;"></div>`;
    const addressRows = [];
    if (template.showAddress && order.address.street) addressRows.push(order.address.street);
    if (template.showAddress && order.address.complement) addressRows.push(order.address.complement);
    if (template.showDelivery && order.deliveryType) addressRows.push(order.deliveryType);
    if (template.showDelivery && order.deliveryStatus) addressRows.push(order.deliveryStatus);

    if (addressRows.length) {
      html += '<div style="margin-bottom:10px; font-size:11px; line-height:1.5;">';
      addressRows.forEach((row) => {
        html += `<div>${render(row)}</div>`;
      });
      html += '</div>';
    }
    html += `<div style="margin:10px 0; border-bottom:1px dashed #000;"></div>`;
    if (template.showItems && order.items.length) {
      html +=
        '<div style="font-size:12px; line-height:1.55; border-bottom:1px dashed #000; padding-bottom:10px;">';
      html += '<div style="font-weight:700; text-transform:uppercase; letter-spacing:0.3px;">Itens no pedido</div>';
      html += '<div style="font-size:11px; color:#111; font-weight:700;">Substituir itens</div>';

      order.items.forEach((item, index) => {
        html += `<div style="display:flex; justify-content:space-between; align-items:flex-start; column-gap:8px; margin-top:6px;">`;
        const qty = getDisplayQty(item);
        const label = shouldShowQty(item, order.items, index, order) ? `x${qty} ${item.name}` : item.name;
        html += `<span style="flex:1; word-break:break-word; font-weight:700;">${render(label)}</span>`;
        html += `<span style="white-space:nowrap; font-weight:700;">${render(currency(item.price || ''))}</span>`;
        html += `</div>`;
      });

      html += '</div>';
    }
    if (template.showItems) {
      const subtotalEntry = order.totals.find((inc) =>
        (inc.label || '').toLowerCase().includes('subtotal')
      );
      const totalValue = subtotalEntry ? currency(subtotalEntry.value || '') : '';

      if (totalValue) {
        html += `<div style="display:flex; justify-content:space-between; font-size:13px; font-weight:700; margin-top:6px;">`;
        html += `<span>Total</span><span>${render(totalValue)}</span>`;
        html += `</div>`;
      }

      if (order.totals.length) {
        order.totals.forEach((inc) => {
          html += `<div style="display:flex; justify-content:space-between; font-size:11px; font-weight:700;">`;
          html += `<span>${render(inc.label || '')}</span><span>${render(currency(inc.value || ''))}</span>`;
          html += '</div>';
        });
      }
    }
    if (template.showPayment && order.payment) {
      const method = paymentMethodFromPayment(order.payment);
      const palette = {
        dinheiro: { bg: '#f2f2f2', text: '#000000', accent: '#000000' },
        cartao: { bg: '#f2f2f2', text: '#000000', accent: '#000000' },
        online: { bg: '#f2f2f2', text: '#000000', accent: '#000000' }
      }[method];

      html += `<div style="margin-top:10px;">`;
      html += `<div style="text-align:center; border:2px solid #000; padding:12px; font-size:12px; background:${palette.bg}; color:${palette.text}; border-radius:6px; font-weight:700;">`;
      html += `<div style="display:inline-block; padding:4px 10px; border-radius:6px; background:#000; color:white; font-weight:700; font-size:11px; letter-spacing:0.3px; margin-bottom:8px;">${method.toUpperCase()}</div>`;
      html += `<div style="font-weight:700; margin-bottom:4px;">${render(order.payment.title)}</div>`;
      html += `<div style="font-size:11px; margin:4px 0; color:${palette.text}; font-weight:700;">${render(order.payment.description)}</div>`;
      html += `<div style="font-weight:700; color:${palette.accent}; margin:10px 0 6px; font-size:15px;">${render(
        currency(order.payment.value)
      )}</div>`;
      if (order.cashReceive && method === 'dinheiro') {
        html += `<div style="font-size:12px; font-weight:700; margin:4px 0;">${render(order.cashReceive)}</div>`;
      }
      if (order.cashChange && method === 'dinheiro') {
        html += `<div style="font-size:12px; font-weight:700; color:#b00020; margin:4px 0;">${render(
          order.cashChange
        )}</div>`;
      }
      html += `<div style="font-size:11px; color:${palette.text}; font-weight:700;">${render(order.payment.footer || '')}</div>`;
      html += '</div>';
      html += '</div>';
    }

    html += '</div>';
    return html;
  };

  const printText = (value) => {
    const content = (value ?? text).trim();
    if (!content) return;
    const parsed = parseOrderText(content);
    const html = buildHtml(parsed);
    Printer.printPreview(html);
    const subtotalEntry = parsed.totals.find((inc) =>
      (inc.label || '').toLowerCase().includes('subtotal')
    );
    const totalValueNum = subtotalEntry ? Math.abs(toNumber(subtotalEntry.value)) : 0;
    const paymentValueNum = parsed.payment ? Math.abs(toNumber(parsed.payment.value)) : 0;
    const method = paymentMethodFromPayment(parsed.payment || {});

    let amount;
    if (method === 'online') {
      amount = Math.max(totalValueNum, paymentValueNum);
    } else {
      amount = paymentValueNum || totalValueNum;
    }

    if (parsed.number) {
      persistCashOrder({
        orderNumber: parsed.number,
        customerName: parsed.customer,
        totalValue: amount,
        paymentMethod: method
      });
    }
  };

  const persistCashOrder = ({ orderNumber, customerName, totalValue, paymentMethod }) => {
    const storedOrders = JSON.parse(localStorage.getItem('cashOrders') || '[]');
    const storedProcessed = JSON.parse(localStorage.getItem('cashProcessed') || '[]');
    const alreadyProcessed = storedProcessed.includes(orderNumber);

    const newEntry = {
      id: orderNumber,
      orderNumber,
      customer: customerName,
      total: totalValue,
      paymentMethod,
      timestamp: new Date().toLocaleTimeString('pt-BR'),
      date: new Date().toLocaleDateString('pt-BR'),
      isReprint: alreadyProcessed
    };

    const updatedOrders = [...storedOrders, newEntry];
    const updatedProcessed = alreadyProcessed ? storedProcessed : [...storedProcessed, orderNumber];

    localStorage.setItem('cashOrders', JSON.stringify(updatedOrders));
    localStorage.setItem('cashProcessed', JSON.stringify(updatedProcessed));
    window.dispatchEvent(
      new CustomEvent('registerOrder', {
        detail: newEntry
      })
    );
  };

  const handlePaste = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) {
        setText(clip);
        printText(clip);
      }
    } catch (err) {
      console.error('Não foi possível colar automaticamente', err);
      alert('Não foi possível acessar sua área de transferência. Cole manualmente (Ctrl+V).');
    }
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem('keywords');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setKeywordsConfig(parsed);
        }
      }
      const savedTemplate = localStorage.getItem('template');
      if (savedTemplate) {
        const parsedTemplate = JSON.parse(savedTemplate);
        setTemplate({ ...DEFAULT_PRINT_TEMPLATE, ...parsedTemplate });
        if (typeof parsedTemplate.highlightKeywords === 'boolean') {
          setEnableHighlight(parsedTemplate.highlightKeywords);
        } else {
          setEnableHighlight(DEFAULT_PRINT_TEMPLATE.highlightKeywords);
        }
      } else {
        setTemplate(DEFAULT_PRINT_TEMPLATE);
        setEnableHighlight(DEFAULT_PRINT_TEMPLATE.highlightKeywords);
      }
      const savedCatalogs = localStorage.getItem('catalogs');
      if (savedCatalogs) {
        const parsedCatalogs = JSON.parse(savedCatalogs);
        setCatalogEntries(parseCatalogEntries(parsedCatalogs));
      } else {
        setCatalogEntries(DEFAULT_CATALOG);
      }
    } catch (e) {
      setKeywordsConfig([]);
      setCatalogEntries(DEFAULT_CATALOG);
      setTemplate(DEFAULT_PRINT_TEMPLATE);
      setEnableHighlight(DEFAULT_PRINT_TEMPLATE.highlightKeywords);
    }
  }, []);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === 'keywords' && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue);
          if (Array.isArray(parsed)) {
            setKeywordsConfig(parsed);
          }
        } catch (e) {
        }
      }
      if (event.key === 'template') {
        if (event.newValue) {
          try {
            const parsedTemplate = JSON.parse(event.newValue);
            setTemplate({ ...DEFAULT_PRINT_TEMPLATE, ...parsedTemplate });
            if (typeof parsedTemplate.highlightKeywords === 'boolean') {
              setEnableHighlight(parsedTemplate.highlightKeywords);
            } else {
              setEnableHighlight(DEFAULT_PRINT_TEMPLATE.highlightKeywords);
            }
          } catch (e) {
          }
        } else {
          setTemplate(DEFAULT_PRINT_TEMPLATE);
          setEnableHighlight(DEFAULT_PRINT_TEMPLATE.highlightKeywords);
        }
      }
      if (event.key === 'catalogs') {
        if (event.newValue) {
          try {
            const parsedCatalogs = JSON.parse(event.newValue);
            setCatalogEntries(parseCatalogEntries(parsedCatalogs));
          } catch (e) {
          }
        } else {
          setCatalogEntries(DEFAULT_CATALOG);
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="home-card">
      <h2>Impressão Fácil</h2>
      <textarea
        ref={textareaRef}
        id="orderText"
        placeholder="Cole um pedido aqui..."
        value={text}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            printText();
          }
        }}
        onChange={(e) => setText(e.target.value)}
      />
      <button id="pasteBtn" onClick={handlePaste}>Colar</button>
    </div>
  );
}




