import { buildHighlighter, escapeHtml } from '../../shared/utils/highlight.js';

export const DEFAULT_CATALOG = [
  { name: 'Carne', price: 4.49 },
  { name: 'Frango', price: 5.49 },
  { name: 'Frango com Catupiry Original', price: 5.99 },
  { name: 'Frango com Cheddar', price: 5.49 },
  { name: 'Frango com Requeijão', price: 5.49 },
  { name: 'Calabresa', price: 5.49 },
  { name: 'Calabresa com Catupiry Original', price: 5.99 },
  { name: 'Calabresa com Cheddar', price: 5.49 },
  { name: 'Calabresa com Requeijão', price: 5.49 },
  { name: 'Bacon', price: 5.49 },
  { name: 'Bacon com Catupiry Original', price: 5.99 },
  { name: 'Bacon com Cheddar', price: 5.49 },
  { name: 'Bacon com Requeijão', price: 5.49 },
  { name: 'Brócolis com Bacon', price: 5.49 },
  { name: 'Mussarela', price: 5.49 },
  { name: '4 Queijos', price: 5.49 },
  { name: 'Alho e Óleo', price: 5.49 },
  { name: 'Atum', price: 5.49 },
  { name: 'Palmito', price: 5.49 },
  { name: 'Pizza', price: 5.49 },
  { name: 'Pizza 35cm (8 Fatias)', price: 49.99, catalogName: 'Pizzas e Combos' },
  { name: 'Pizza 40cm (10 Fatias)', price: 59.99, catalogName: 'Pizzas e Combos' },
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
  { name: 'Combo 20 Esfihas de Carne + Coca 2L', price: 82.99 },
  { name: 'Combo 2 Pizzas 35cm', price: 89.99, catalogName: 'Pizzas e Combos' },
  { name: 'Combo 3 Pizzas 35cm', price: 129.99, catalogName: 'Pizzas e Combos' }
];

export const DEFAULT_PRINT_TEMPLATE = {
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

export const toCurrency = (line) => {
  const cleaned = String(line || '').replace(/[^\d,-]/g, '').replace(',', '.');
  const value = parseFloat(cleaned || '0');
  const abs = Math.abs(value).toFixed(2).replace('.', ',');
  return value < 0 ? `-R$ ${abs}` : `R$ ${abs}`;
};

export const toNumber = (line) => {
  if (!line) return 0;
  const cleaned = String(line).replace(/[^\d,-]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
};

export const normalizeText = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bc\/\b/g, 'com')
    .replace(/\s+/g, ' ')
    .trim();

export const parseCatalogEntries = (rawCatalogs) => {
  if (!Array.isArray(rawCatalogs)) return DEFAULT_CATALOG;
  const entries = [];
  rawCatalogs.forEach((catalog) => {
    const catalogName = catalog?.name || '';
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
          entries.push({ name: namePart.trim(), price, catalogName });
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
      merged.set(key, { ...entry, catalogName: entry.catalogName || '' });
    }
  });
  return Array.from(merged.values());
};

export function createReceiptPrintEngine(options = {}) {
  const template = {
    ...DEFAULT_PRINT_TEMPLATE,
    ...(options.template && typeof options.template === 'object' ? options.template : {})
  };
  const keywordsConfig = Array.isArray(options.keywords) ? options.keywords : [];
  const catalogEntries = Array.isArray(options.catalogEntries)
    ? options.catalogEntries
    : parseCatalogEntries(options.catalogs);
  const highlighter = buildHighlighter(keywordsConfig);
  const render = (value) =>
    template.highlightKeywords ? highlighter(value ?? '') : escapeHtml(value ?? '');
  const bullet = '<span style="margin: 0 6px;">&#8226;</span>';

  const findCatalogEntry = (itemName) => {
    const normItem = normalizeText(itemName);
    if (!normItem) return null;
    const source = catalogEntries.length ? catalogEntries : DEFAULT_CATALOG;
    const isComboItem = normItem.includes('combo');

    const pickBest = (preferCombosOnly = false) => {
      let best = null;
      let bestScore = -1;
      let bestLen = -Infinity;

      source.forEach((entry) => {
        const normEntry = normalizeText(entry.name);
        if (!normEntry) return;
        if (preferCombosOnly && !normEntry.includes('combo')) return;

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

    if (isComboItem) {
      const comboMatch = pickBest(true);
      if (comboMatch) return comboMatch;
    }

    return pickBest(false);
  };

  const getCatalogNameScore = (itemName = '', catalogName = '') => {
    const normItem = normalizeText(itemName);
    const normCatalog = normalizeText(catalogName);
    if (!normItem || !normCatalog) return 0;
    if (normItem === normCatalog) return 4;
    if (normItem.includes(normCatalog) || normCatalog.includes(normItem)) return 3;

    const itemTokens = new Set(normItem.split(/\s+/).filter((token) => token.length > 2));
    const catalogTokens = normCatalog.split(/\s+/).filter((token) => token.length > 2);
    const matched = catalogTokens.filter((token) => itemTokens.has(token)).length;
    return matched ? Math.min(2, matched) : 0;
  };

  const isPizzaOrComboName = (name = '') => {
    const norm = normalizeText(name);
    return norm.includes('pizza') || norm.includes('combo');
  };

  const isPizzaComboCatalogName = (catalogName = '') => {
    const norm = normalizeText(catalogName);
    return norm.includes('pizza') || norm.includes('combo');
  };

  const getPizzaComboCandidates = (itemName = '') => {
    const source = catalogEntries.length ? catalogEntries : DEFAULT_CATALOG;
    const normItem = normalizeText(itemName);
    const isComboItem = normItem.includes('combo');
    const isPizzaItem = normItem.includes('pizza');

    const topicCandidates = source.filter((entry) => isPizzaComboCatalogName(entry.catalogName || ''));
    const nameCandidates = source.filter((entry) => isPizzaOrComboName(entry.name || ''));
    const baseCandidates = topicCandidates.length
      ? topicCandidates
      : nameCandidates.length
        ? nameCandidates
        : source;

    if (isComboItem) {
      const comboOnly = baseCandidates.filter((entry) =>
        normalizeText(entry.name || '').includes('combo')
      );
      return comboOnly.length ? comboOnly : baseCandidates;
    }

    if (isPizzaItem) {
      const pizzaOnly = baseCandidates.filter((entry) => {
        const entryNorm = normalizeText(entry.name || '');
        return entryNorm.includes('pizza') && !entryNorm.includes('combo');
      });
      return pizzaOnly.length ? pizzaOnly : baseCandidates;
    }

    return baseCandidates;
  };

  const inferQtyFromCandidateEntries = (itemName = '', priceLine = '', candidates = []) => {
    const priceValue = toNumber(priceLine);
    if (!(priceValue > 0) || !Array.isArray(candidates) || !candidates.length) return null;

    const normItem = normalizeText(itemName);
    let best = null;

    candidates.forEach((entry) => {
      const unitPrice = Number(entry?.price || 0);
      if (!(unitPrice > 0)) return;

      const raw = priceValue / unitPrice;
      const rounded = Math.round(raw);
      const delta = Math.abs(raw - rounded);
      if (rounded <= 0 || delta > 0.2) return;

      const entryNorm = normalizeText(entry.name || '');
      if (!entryNorm) return;

      let score = 0;
      if (normItem === entryNorm) {
        score = 4;
      } else if (normItem.includes(entryNorm) || entryNorm.includes(normItem)) {
        score = 3;
      } else {
        score = getCatalogNameScore(normItem, entryNorm);
        if (normItem.includes('combo') && entryNorm.includes('combo')) score += 2;
        if (normItem.includes('pizza') && entryNorm.includes('pizza')) score += 2;
      }

      if (score <= 0) return;

      const candidate = {
        qty: String(rounded),
        entry,
        score,
        delta,
        len: entryNorm.length
      };

      if (
        !best ||
        candidate.score > best.score ||
        (candidate.score === best.score && candidate.delta < best.delta) ||
        (candidate.score === best.score && candidate.delta === best.delta && candidate.len > best.len)
      ) {
        best = candidate;
      }
    });

    return best;
  };

  const isCatalogLikeItem = (itemName = '') => {
    const normItem = normalizeText(itemName);
    if (!normItem) return false;
    const source = catalogEntries.length ? catalogEntries : DEFAULT_CATALOG;
    return source.some((entry) => {
      const normEntry = normalizeText(entry.name || '');
      if (!normEntry) return false;
      return normItem === normEntry || normItem.includes(normEntry) || normEntry.includes(normItem);
    });
  };

  const findUnitPrice = (itemName) => {
    const entry = findCatalogEntry(itemName);
    return entry ? entry.price : null;
  };

  const extractQtyFromName = (name = '') => {
    const match = name.match(/(\d+)\s*(?:esfihas?|esfiha|pizzas?|pizza|fatias?|un|unidades?)/i);
    if (match) return match[1];
    const comboMatch = name.match(
      /combo\s*(?:de\s*)?(\d+)\s*(?:esfihas?|esfiha|pizzas?|pizza|fatias?|un|unidades?)/i
    );
    if (comboMatch) return comboMatch[1];
    return '';
  };

  const inferQtyFromPrice = (itemName = '', priceLine = '') => {
    if (isPizzaOrComboName(itemName)) {
      const candidates = getPizzaComboCandidates(itemName);
      const inferredFromTopic = inferQtyFromCandidateEntries(itemName, priceLine, candidates);
      if (inferredFromTopic?.qty) return inferredFromTopic.qty;
    }

    const priceValue = toNumber(priceLine);
    const unitPrice = findUnitPrice(itemName);
    if (unitPrice && priceValue > 0) {
      const raw = priceValue / unitPrice;
      const rounded = Math.round(raw);
      const closeEnough = rounded > 0 && Math.abs(raw - rounded) <= 0.2;
      if (closeEnough) return String(rounded);
    }

    const source = catalogEntries.length ? catalogEntries : DEFAULT_CATALOG;
    const inferredFromCatalog = inferQtyFromCandidateEntries(itemName, priceLine, source);
    if (inferredFromCatalog?.qty) return inferredFromCatalog.qty;

    return '';
  };

  const inferQty = (item) => {
    if (item.qty) return item.qty;

    const name = item.name || '';
    const normName = normalizeText(name);
    const isCombo = /combo/i.test(name);
    if (isCombo) return inferQtyFromPrice(name, item.price) || '1';

    if (normName.includes('pizza')) {
      return inferQtyFromPrice(name, item.price);
    }

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

    const comboCandidates = getPizzaComboCandidates(item.name || '');
    const comboInference = inferQtyFromCandidateEntries(item.name || '', item.price || '', comboCandidates);
    const qtyByPrice = comboInference?.qty || inferQtyFromPrice(item.name || '', item.price || '');
    if (qtyByPrice) return qtyByPrice;

    if (item.explicitQty) {
      const comboQtyFromName = extractQtyFromName(item.name || '');
      const comboQtyFromCatalog = extractQtyFromName(
        comboInference?.entry?.name || findCatalogEntry(item.name || '')?.name || ''
      );
      if (comboQtyFromName && item.explicitQty === comboQtyFromName) return '1';
      if (comboQtyFromCatalog && item.explicitQty === comboQtyFromCatalog) return '1';
      return item.explicitQty;
    }

    return fallbackQty || '1';
  };

  const shouldShowQty = (item, items = [], index = -1, orderMeta = {}) => {
    const qty = getDisplayQty(item);
    if (!qty) return false;
    const qtyNumber = Number(qty);
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
    if (normName.includes('pizza') && qtyNumber > 1) return true;
    if (isEsfiha(normName)) return true;
    if (item.explicitQty) return true;
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
    const scores = { online: 0, card: 0, cash: 0 };

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

  const parseOrderText = (raw) => {
    const lines = String(raw || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !/^[\u2022\u25CF]+$/.test(line));

    const lowerLines = lines.map((line) => line.toLowerCase());
    const findLine = (predicate) => {
      const idx = lowerLines.findIndex(predicate);
      return idx >= 0 ? lines[idx] : '';
    };

    const number = lines[0] || '';
    const customer = lines[1] || '';
    const brand = lines[2] || '';
    const store = lines[3] || '';
    const placedAt = findLine((line) => line.includes('feito'))?.replace(/.*às?\s*/i, '') || '';
    const locator = findLine((line) => line.includes('localizador'))?.replace(/.*localizador\s*/i, '').trim() || '';
    const eta = findLine((line) => line.includes('entrega prevista'))?.replace(/.*prevista:?\s*/i, '').trim() || '';
    const orderPosition = findLine((line) => line.includes('pedido'));
    const contactLine = findLine((line) => line.includes('id:'));
    const status = findLine((line) => line.includes('prepar') || line.includes('pronto') || line.includes('saiu'));
    const elapsed = findLine((line) => line.startsWith('há ') || line.startsWith('ha '));
    let contactPhone = '';
    let contactId = '';

    if (contactLine) {
      const parts = contactLine.split(/id:/i);
      contactPhone = parts[0].trim();
      contactId = parts[1]?.trim() || '';
    }

    const itemsStart = lowerLines.findIndex((line) => line.startsWith('itens no pedido'));
    const isLikelyAddressLine = (line = '') => {
      const normalized = normalizeText(line).replace(/\s+/g, ' ').trim();
      if (!normalized) return false;
      if (/^(r\.?|rua|av\.?|avenida|al\.?|alameda|travessa|tv\.?|estrada|est\.?|rod\.?|rodovia|praca|largo)\b/.test(normalized)) {
        return true;
      }
      const hasNeighborhoodPattern = /\s-\s/.test(line);
      const hasAddressNumber = /,\s*\d+\b/.test(line) || /\bn[ºo]?\s*\d+\b/i.test(line);
      const hasZipCode = /\b\d{5}-?\d{3}\b/.test(line);
      return hasNeighborhoodPattern && (hasAddressNumber || hasZipCode);
    };
    const isAddressStopLine = (line = '') => {
      const normalized = normalizeText(line);
      if (!normalized) return true;
      return (
        normalized.startsWith('entrega ') ||
        normalized.startsWith('confirmacao') ||
        normalized.startsWith('pedido ') ||
        normalized.startsWith('feito') ||
        normalized.startsWith('localizador') ||
        normalized.startsWith('via ifood') ||
        normalized.startsWith('copiar link') ||
        normalized.startsWith('compartilhar') ||
        normalized.startsWith('saiba mais') ||
        normalized.startsWith('itens no pedido') ||
        normalized.startsWith('substituir itens') ||
        normalized.startsWith('ha ')
      );
    };

    const addressSearchLimit = itemsStart >= 0 ? itemsStart : lines.length;
    const addressStartIdx = lines.findIndex(
      (line, idx) => idx < addressSearchLimit && isLikelyAddressLine(line)
    );
    const address = { street: '', complement: '' };

    if (addressStartIdx >= 0) {
      address.street = lines[addressStartIdx].replace(/[\u2022\u25CF]/g, ' • ');
      const complementParts = [];
      for (let idx = addressStartIdx + 1; idx < addressSearchLimit; idx += 1) {
        const next = lines[idx] || '';
        if (!next || isAddressStopLine(next) || isLikelyAddressLine(next)) break;
        complementParts.push(next.replace(/[\u2022\u25CF]/g, ' • '));
        if (complementParts.length >= 2) break;
      }
      address.complement = complementParts.join(' • ');
    }

    const deliveryType =
      findLine((line) => line.startsWith('entrega ') && !line.includes('prevista')) ||
      findLine((line) => line.includes('retira')) ||
      '';
    const deliveryStatus = findLine(
      (line) =>
        (line.includes('pendente') || line.includes('confirm') || line.includes('entregue') || line.includes('saiu')) &&
        !line.includes('prevista')
    );
    const totalsKeywords = ['taxa de entrega', 'taxa de servi', 'subtotal', 'incentivos', 'valores cobrados'];
    let items = [];
    const incentives = [];
    let payment = null;
    let cashReceive = '';
    let cashChange = '';

    if (itemsStart >= 0) {
      const afterItems = lines.slice(itemsStart + 1);
      const afterLower = lowerLines.slice(itemsStart + 1);
      let i = 0;
      let pendingQty = '';
      const isPrice = (line) => /-?\s*R\$\s*\d/.test(line);
      const isTotals = (low) => totalsKeywords.some((keyword) => low.startsWith(keyword));

      const splitNamePriceQty = (line) => {
        const priceMatch = line.match(/(-?\s*R\$\s*\d[\d.,]*)/i);
        const price = priceMatch ? priceMatch[1].trim() : '';
        const namePart = priceMatch ? line.replace(priceMatch[1], '').trim() : line.trim();
        const leadingQtyMatch = namePart.match(/^x\s*(\d+)\b/i);
        const trailingQtyMatch = namePart.match(/\bx\s*(\d+)\s*$/i);
        const leadingPlainQtyCandidate = namePart.match(/^(\d+)\s+(.+)$/);
        const normalizedLeadingRemainder = normalizeText(leadingPlainQtyCandidate?.[2] || '');
        const leadingPlainQtyMatch =
          leadingPlainQtyCandidate &&
          Number(leadingPlainQtyCandidate[1]) > 0 &&
          Number(leadingPlainQtyCandidate[1]) <= 9 &&
          !/^(queijos?|sabores?)/.test(normalizedLeadingRemainder)
            ? leadingPlainQtyCandidate
            : null;
        const trailingPlainQtyCandidate = namePart.match(/^(.+?)\s+(\d+)\s*$/);
        const trailingPlainQtyMatch =
          trailingPlainQtyCandidate &&
          Number(trailingPlainQtyCandidate[2]) > 0 &&
          Number(trailingPlainQtyCandidate[2]) <= 9
            ? trailingPlainQtyCandidate
            : null;
        const qty =
          leadingQtyMatch?.[1] ||
          trailingQtyMatch?.[1] ||
          leadingPlainQtyMatch?.[1] ||
          trailingPlainQtyMatch?.[2] ||
          '';
        let cleanName = namePart;
        if (leadingQtyMatch) cleanName = cleanName.replace(/^x\s*\d+\b/i, '').trim();
        if (trailingQtyMatch) cleanName = cleanName.replace(/\bx\s*\d+\s*$/i, '').trim();
        if (leadingPlainQtyMatch) cleanName = leadingPlainQtyMatch[2].trim();
        if (trailingPlainQtyMatch) cleanName = trailingPlainQtyMatch[1].trim();
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

        if (/^\d+$/.test(line)) {
          pendingQty = line;
          i += 1;
          continue;
        }

        const { name, price, qty } = splitNamePriceQty(line);
        const finalQty = qty || pendingQty || '';

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
            items.push({
              name: nextName,
              price: parsedCandidate.price,
              qty: mergedQty || parsedCandidate.qty,
              isPriceOnly: false
            });
            pendingQty = '';
            i = cursor + 1;
            resolved = true;
            break;
          }

          if (!isCatalogLikeItem(mergedName) && isCatalogLikeItem(parsedCandidate.name || candidate)) {
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
        if (low.startsWith('pago via') || low.startsWith('cobrar do cliente')) break;
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
      channel: '',
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
    const currency = (line) => (/-?\s*R\$\s*\d/.test(String(line || '')) ? toCurrency(line) : line);
    let html =
      '<div class="receipt-root" style="font-family: Arial, sans-serif; font-size: 12px; font-weight: 700; color: #000; max-width: 240px; line-height: 1.55;">';

    if (template.showBranch && order.brand) {
      html += `<div style="text-align:center; font-size:12px; margin-top:2px; font-weight:700;">${render(order.brand)}</div>`;
    }
    if (template.showBranch && order.store) {
      html += `<div style="text-align:center; font-size:12px; margin-top:0px; font-weight:700;">${render(order.store)}</div>`;
    }
    if (template.showCustomer && order.customer) {
      html += `<div style="text-align:center; font-size:14px; margin-top:2px; font-weight:700;">${render(order.customer)}</div>`;
    }

    const timeBits = [];
    if (template.showTime && order.placedAt) timeBits.push(render(`Feito às ${order.placedAt}`));
    if (template.showTime && order.eta) timeBits.push(render(`Entrega prevista: ${order.eta}`));
    if (timeBits.length) {
      html += `<div style="text-align:center; font-size:11px; margin-top:6px;">${timeBits.join(` ${bullet} `)}</div>`;
    }
    if (template.showLocator && order.locator) {
      html += `<div style="text-align:center; font-size:15px; font-weight:800; margin-top:4px;">${render(`Localizador ${order.locator}`)}</div>`;
    }
    if (order.orderPosition) {
      html += `<div style="text-align:center; font-size:11px; margin-top:2px;">${render(order.orderPosition)}</div>`;
    }
    if (order.contactPhone) {
      const contactLine = `${order.contactPhone}${order.contactId ? ` ID: ${order.contactId}` : ''}`;
      html += `<div style="text-align:center; font-size:11px; margin-top:2px;">${render(contactLine)}</div>`;
    }
    if (order.status) {
      html += `<div style="text-align:center; font-size:11px; margin-top:4px; font-weight:700;">${render(order.status)}</div>`;
    }
    if (order.elapsed) {
      html += `<div style="text-align:center; font-size:11px; font-weight:700; color:#000;">${render(order.elapsed)}</div>`;
    }
    if (template.showOrderNumber && order.number) {
      html += `<div style="text-align:center; font-weight:700; font-size:22px; letter-spacing:1px; margin-top:6px;">${render(order.number)}</div>`;
    }

    html += '<div style="margin:8px 0; border-bottom:1px dashed #000;"></div>';
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

    html += '<div style="margin:10px 0; border-bottom:1px dashed #000;"></div>';
    if (template.showItems && order.items.length) {
      html += '<div style="font-size:12px; line-height:1.55; border-bottom:1px dashed #000; padding-bottom:10px;">';
      html += '<div style="font-weight:700; text-transform:uppercase; letter-spacing:0.3px;">Itens no pedido</div>';
      html += '<div style="font-size:11px; color:#111; font-weight:700;">Substituir itens</div>';

      order.items.forEach((item, index) => {
        const qty = getDisplayQty(item);
        const label = shouldShowQty(item, order.items, index, order) ? `x${qty} ${item.name}` : item.name;
        html += '<div style="display:flex; justify-content:space-between; align-items:flex-start; column-gap:8px; margin-top:6px;">';
        html += `<span style="flex:1; word-break:break-word; font-weight:700;">${render(label)}</span>`;
        html += `<span style="white-space:nowrap; font-weight:700;">${render(currency(item.price || ''))}</span>`;
        html += '</div>';
      });

      html += '</div>';
    }

    if (template.showItems) {
      const subtotalEntry = order.totals.find((inc) =>
        (inc.label || '').toLowerCase().includes('subtotal')
      );
      const totalValue = subtotalEntry ? currency(subtotalEntry.value || '') : '';

      if (totalValue) {
        html += '<div style="display:flex; justify-content:space-between; font-size:13px; font-weight:700; margin-top:6px;">';
        html += `<span>Total</span><span>${render(totalValue)}</span>`;
        html += '</div>';
      }

      if (order.totals.length) {
        order.totals.forEach((inc) => {
          html += '<div style="display:flex; justify-content:space-between; font-size:11px; font-weight:700;">';
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

      html += '<div style="margin-top:10px;">';
      html += `<div style="text-align:center; border:2px solid #000; padding:12px; font-size:12px; background:${palette.bg}; color:${palette.text}; border-radius:6px; font-weight:700;">`;
      html += `<div style="display:inline-block; padding:4px 10px; border-radius:6px; background:#000; color:white; font-weight:700; font-size:11px; letter-spacing:0.3px; margin-bottom:8px;">${method.toUpperCase()}</div>`;
      html += `<div style="font-weight:700; margin-bottom:4px;">${render(order.payment.title)}</div>`;
      html += `<div style="font-size:11px; margin:4px 0; color:${palette.text}; font-weight:700;">${render(order.payment.description)}</div>`;
      html += `<div style="font-weight:700; color:${palette.accent}; margin:10px 0 6px; font-size:15px;">${render(currency(order.payment.value))}</div>`;
      if (order.cashReceive && method === 'dinheiro') {
        html += `<div style="font-size:12px; font-weight:700; margin:4px 0;">${render(order.cashReceive)}</div>`;
      }
      if (order.cashChange && method === 'dinheiro') {
        html += `<div style="font-size:12px; font-weight:700; color:#b00020; margin:4px 0;">${render(order.cashChange)}</div>`;
      }
      html += `<div style="font-size:11px; color:${palette.text}; font-weight:700;">${render(order.payment.footer || '')}</div>`;
      html += '</div></div>';
    }

    html += '</div>';
    return html;
  };

  const buildPrintJob = (rawText) => {
    const parsed = parseOrderText(rawText);
    const html = buildHtml(parsed);
    const subtotalEntry = parsed.totals.find((inc) =>
      (inc.label || '').toLowerCase().includes('subtotal')
    );
    const totalValueNum = subtotalEntry ? Math.abs(toNumber(subtotalEntry.value)) : 0;
    const paymentValueNum = parsed.payment ? Math.abs(toNumber(parsed.payment.value)) : 0;
    const paymentMethod = paymentMethodFromPayment(parsed.payment || {});
    const totalValue = paymentMethod === 'online'
      ? Math.max(totalValueNum, paymentValueNum)
      : paymentValueNum || totalValueNum;

    return {
      parsed,
      html,
      cash: {
        orderNumber: parsed.number,
        customerName: parsed.customer,
        totalValue,
        paymentMethod
      }
    };
  };

  return {
    buildHtml,
    buildPrintJob,
    parseOrderText,
    paymentMethodFromPayment
  };
}
