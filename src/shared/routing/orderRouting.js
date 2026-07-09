export const ROUTING_STATE_KEY = 'easyPrintOrderRoutingState';
export const PENDING_PRINT_TEXT_KEY = 'easyPrintPendingPrintText';
export const PENDING_PRINT_AUTO_KEY = 'easyPrintPendingPrintAuto';
export const PENDING_PRINT_RESEND_KEY = 'easyPrintPendingPrintResend';

export const RULE_TYPES = {
  KEYWORD: 'keyword',
  STREET_NUMBER: 'street-number',
  SPLIT_AREA: 'split-area'
};

const DEFAULT_STORES = [
  {
    id: 'penha',
    name: 'Filial Penha',
    city: 'Penha / Balneario Picarras',
    serviceAreas: 'Armacao, Centro Penha, Nossa Senhora de Fatima, Picarras, Balneario Picarras',
    reviewAreas: 'Santa Lidia final',
    canReceive: true,
    enabledTarget: true,
    autoPrint: false
  },
  {
    id: 'gravata',
    name: 'Filial Gravata',
    city: 'Penha / Navegantes',
    serviceAreas: 'Gravata, Gravata Penha, Gravata Navegantes, Santa Lidia',
    reviewAreas: 'Santa Lidia, Meia Praia comeco',
    canReceive: true,
    enabledTarget: true,
    autoPrint: false
  },
  {
    id: 'sao-domingos',
    name: 'Filial Sao Domingos',
    city: 'Navegantes',
    serviceAreas: 'Sao Domingos, Pedreiras, Bairro Sao Paulo, Centro Navegantes, Centro de Navegantes, Meia Praia',
    reviewAreas: 'Meia Praia',
    canReceive: true,
    enabledTarget: true,
    autoPrint: false
  }
];

const DEFAULT_RULES = [
  {
    id: 'rule-penha-bairros',
    title: 'Bairros da Penha',
    type: RULE_TYPES.KEYWORD,
    targetStoreId: 'penha',
    terms: 'Armacao, Centro Penha, Nossa Senhora de Fatima, Picarras, Balneario Picarras',
    street: '',
    neighborhood: '',
    city: '',
    numberFrom: '',
    numberTo: '',
    priority: 50,
    requiresConfirmation: false,
    active: true,
    mapHint: ''
  },
  {
    id: 'rule-gravata-bairros',
    title: 'Bairros do Gravata',
    type: RULE_TYPES.KEYWORD,
    targetStoreId: 'gravata',
    terms: 'Gravata Penha, Gravata Navegantes, Gravata',
    street: '',
    neighborhood: '',
    city: '',
    numberFrom: '',
    numberTo: '',
    priority: 50,
    requiresConfirmation: false,
    active: true,
    mapHint: ''
  },
  {
    id: 'rule-sao-domingos-bairros',
    title: 'Bairros de Sao Domingos',
    type: RULE_TYPES.KEYWORD,
    targetStoreId: 'sao-domingos',
    terms: 'Sao Domingos, Pedreiras, Bairro Sao Paulo, Centro Navegantes, Centro de Navegantes',
    street: '',
    neighborhood: '',
    city: '',
    numberFrom: '',
    numberTo: '',
    priority: 50,
    requiresConfirmation: false,
    active: true,
    mapHint: ''
  },
  {
    id: 'rule-santa-lidia',
    title: 'Santa Lidia dividida',
    type: RULE_TYPES.SPLIT_AREA,
    targetStoreId: 'gravata',
    terms: 'Santa Lidia',
    street: '',
    neighborhood: '',
    city: '',
    numberFrom: '',
    numberTo: '',
    priority: 80,
    requiresConfirmation: true,
    active: true,
    mapHint: 'Maior parte fica com Gravata. Confirmar quando for final da regiao de Penha.'
  },
  {
    id: 'rule-meia-praia',
    title: 'Meia Praia dividida',
    type: RULE_TYPES.SPLIT_AREA,
    targetStoreId: 'sao-domingos',
    terms: 'Meia Praia',
    street: '',
    neighborhood: '',
    city: '',
    numberFrom: '',
    numberTo: '',
    priority: 80,
    requiresConfirmation: true,
    active: true,
    mapHint: 'Maior parte fica com Sao Domingos. Comeco da regiao pode ser Gravata.'
  }
];

const DEFAULT_STATE = {
  currentStoreId: 'penha',
  stores: DEFAULT_STORES,
  rules: DEFAULT_RULES,
  orders: []
};

export const getDefaultRoutingState = () => ({
  ...DEFAULT_STATE,
  stores: DEFAULT_STORES.map((store) => ({ ...store })),
  rules: DEFAULT_RULES.map((rule) => ({ ...rule })),
  orders: []
});

export const normalizeText = (value = '') =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s,-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const splitTerms = (value = '') =>
  String(value || '')
    .split(/[,;\n]/)
    .map((term) => term.trim())
    .filter(Boolean);

export const createRoutingId = (prefix = 'item') =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const asArray = (value) => (Array.isArray(value) ? value : []);

const normalizeStore = (store = {}, index = 0) => ({
  id: String(store.id || createRoutingId('store')).trim(),
  name: String(store.name ?? `Loja ${index + 1}`).trim(),
  city: String(store.city || '').trim(),
  serviceAreas: String(store.serviceAreas || DEFAULT_STORES.find((item) => item.id === store.id)?.serviceAreas || '').trim(),
  reviewAreas: String(store.reviewAreas || DEFAULT_STORES.find((item) => item.id === store.id)?.reviewAreas || '').trim(),
  canReceive: store.canReceive !== false,
  enabledTarget: store.enabledTarget !== false,
  autoPrint: Boolean(store.autoPrint)
});

export const normalizeRule = (rule = {}) => ({
  id: String(rule.id || createRoutingId('rule')).trim(),
  title: String(rule.title || 'Nova regra').trim(),
  type: Object.values(RULE_TYPES).includes(rule.type) ? rule.type : RULE_TYPES.KEYWORD,
  targetStoreId: String(rule.targetStoreId || '').trim(),
  terms: String(rule.terms || '').trim(),
  street: String(rule.street || '').trim(),
  neighborhood: String(rule.neighborhood || '').trim(),
  city: String(rule.city || '').trim(),
  numberFrom: rule.numberFrom === 0 ? 0 : String(rule.numberFrom || '').trim(),
  numberTo: rule.numberTo === 0 ? 0 : String(rule.numberTo || '').trim(),
  priority: Number.isFinite(Number(rule.priority)) ? Number(rule.priority) : 50,
  requiresConfirmation: Boolean(rule.requiresConfirmation),
  active: rule.active !== false,
  mapHint: String(rule.mapHint || '').trim()
});

export const normalizeRoutingState = (value = {}) => {
  const fallback = getDefaultRoutingState();
  const stores = asArray(value.stores).map(normalizeStore).filter((store) => store.id);
  const validStores = stores.length ? stores : fallback.stores;
  const storeIds = new Set(validStores.map((store) => store.id));
  const hasRulesInput = Array.isArray(value.rules);
  const rules = asArray(value.rules)
    .map(normalizeRule)
    .filter((rule) => rule.id && rule.targetStoreId && storeIds.has(rule.targetStoreId));
  const orders = asArray(value.orders).filter((order) => order && typeof order === 'object');
  const currentStoreId = storeIds.has(value.currentStoreId) ? value.currentStoreId : validStores[0]?.id || '';

  return {
    currentStoreId,
    stores: validStores,
    rules: hasRulesInput ? rules : fallback.rules,
    orders
  };
};

export const loadRoutingState = () => {
  if (typeof window === 'undefined') return getDefaultRoutingState();

  try {
    const raw = window.localStorage.getItem(ROUTING_STATE_KEY);
    return raw ? normalizeRoutingState(JSON.parse(raw)) : getDefaultRoutingState();
  } catch (error) {
    console.error('Falha ao carregar roteamento de pedidos', error);
    return getDefaultRoutingState();
  }
};

export const saveRoutingState = (state) => {
  const normalized = normalizeRoutingState(state);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(ROUTING_STATE_KEY, JSON.stringify(normalized));
  }

  return normalized;
};

const cleanOrderLine = (line = '') =>
  String(line)
    .replace(/●/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getLineAfter = (lines, index) => {
  if (index < 0) return '';

  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];
    const normalized = normalizeText(line);

    if (!line) continue;
    if (normalized.includes('entrega propria')) return '';
    if (normalized.includes('confirmacao de entrega')) return '';
    if (normalized.includes('envie o link')) return '';
    if (normalized.includes('copiar link')) return '';
    if (normalized.includes('compartilhar')) return '';
    if (normalized.includes('itens no pedido')) return '';

    return line;
  }

  return '';
};

const findAddressLineIndex = (lines) =>
  lines.findIndex((line) => {
    const normalized = normalizeText(line);
    const hasStreetPrefix = /^(r|rua|av|avenida|alameda|travessa|tv|estrada|rodovia|praca)\b/.test(normalized);
    const hasNumber = /,\s*\d+/.test(line);
    const hasAddressSeparator = /\s-\s/.test(line);
    const hasCep = /\b\d{5}-?\d{3}\b/.test(line);
    return (hasStreetPrefix && hasNumber) || (hasNumber && hasAddressSeparator) || (hasAddressSeparator && hasCep);
  });

const parseAddress = (rawLine = '', complement = '') => {
  const cepMatch = rawLine.match(/\b\d{5}-?\d{3}\b/);
  const cep = cepMatch?.[0] || '';
  const lineWithoutCep = cleanOrderLine(rawLine.replace(/\b\d{5}-?\d{3}\b/g, ''));
  const parts = lineWithoutCep.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  const streetPart = parts[0] || lineWithoutCep;
  const streetMatch = streetPart.match(/^(.+?),\s*([0-9]+[A-Za-zºª-]*)/);
  const street = streetMatch ? streetMatch[1].trim() : streetPart.trim();
  const numberText = streetMatch ? streetMatch[2].trim() : '';
  const number = Number.parseInt(numberText.replace(/\D/g, ''), 10);
  const neighborhood = parts[1] || '';
  const city = parts.slice(2).join(' - ');

  return {
    raw: rawLine,
    street,
    numberText,
    number: Number.isFinite(number) ? number : null,
    neighborhood,
    city,
    cep,
    complement: complement || '',
    display: [streetPart, neighborhood, city].filter(Boolean).join(' - ')
  };
};

export const parseIfoodOrder = (raw = '') => {
  const lines = String(raw || '')
    .split(/\r?\n/)
    .map(cleanOrderLine)
    .filter((line) => line && !/^[\u2022\u25CF]+$/.test(line));

  const lowerLines = lines.map(normalizeText);
  const addressLineIndex = findAddressLineIndex(lines);
  const addressLine = addressLineIndex >= 0 ? lines[addressLineIndex] : '';
  const complement = getLineAfter(lines, addressLineIndex);
  const locatorLine = lines.find((line) => /localizador/i.test(line)) || '';
  const contactLine = lines.find((line) => /\bid:/i.test(line)) || '';
  const etaLine = lines.find((line) => /entrega prevista/i.test(line)) || '';
  const statusLine = lines.find((line) => /pedido em preparo|pedido pronto|saiu para entrega/i.test(line)) || '';
  const orderPositionLine = lines.find((line) => /\d+[ºo]\s*pedido/i.test(line)) || '';
  const itemsIndex = lowerLines.findIndex((line) => line.startsWith('itens no pedido'));

  return {
    raw,
    lines,
    orderNumber: lines[0] || '',
    customer: lines[1] || '',
    brand: lines[2] || '',
    store: lines[3] || '',
    locator: locatorLine.replace(/.*localizador\s*/i, '').trim(),
    contactId: contactLine.split(/id:/i)[1]?.trim() || '',
    eta: etaLine.replace(/.*prevista:?\s*/i, '').trim(),
    status: statusLine,
    orderPosition: orderPositionLine,
    address: parseAddress(addressLine, complement),
    hasItems: itemsIndex >= 0,
    dedupeKey: buildOrderDedupeKey({
      orderNumber: lines[0] || '',
      locator: locatorLine.replace(/.*localizador\s*/i, '').trim(),
      raw
    })
  };
};

export const buildOrderDedupeKey = ({ orderNumber = '', locator = '', raw = '' }) => {
  const explicit = [orderNumber, locator].map((part) => String(part || '').trim()).filter(Boolean).join(':');
  if (explicit) return normalizeText(explicit);

  let hash = 0;
  const source = String(raw || '');
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0;
  }
  return `raw:${Math.abs(hash)}`;
};

const numberInRange = (value, from, to) => {
  if (!Number.isFinite(value)) return false;
  const min = Number.parseInt(String(from || '').replace(/\D/g, ''), 10);
  const max = Number.parseInt(String(to || '').replace(/\D/g, ''), 10);
  const hasMin = Number.isFinite(min);
  const hasMax = Number.isFinite(max);

  if (hasMin && value < min) return false;
  if (hasMax && value > max) return false;
  return hasMin || hasMax;
};

const matchStreetNumberRule = (rule, order) => {
  const address = order.address || {};
  const streetNeedle = normalizeText(rule.street);
  const cityNeedle = normalizeText(rule.city);
  const neighborhoodNeedle = normalizeText(rule.neighborhood);
  const streetText = normalizeText(address.street);
  const cityText = normalizeText(address.city);
  const neighborhoodText = normalizeText(address.neighborhood);

  if (streetNeedle && !streetText.includes(streetNeedle) && !streetNeedle.includes(streetText)) return null;
  if (cityNeedle && !cityText.includes(cityNeedle)) return null;
  if (neighborhoodNeedle && !neighborhoodText.includes(neighborhoodNeedle)) return null;
  if (!numberInRange(address.number, rule.numberFrom, rule.numberTo)) return null;

  return {
    matchedTerms: [rule.street, `${rule.numberFrom || 'inicio'}-${rule.numberTo || 'fim'}`].filter(Boolean),
    baseScore: 110
  };
};

const matchTermRule = (rule, searchText) => {
  const terms = splitTerms(rule.terms);
  const matchedTerms = terms.filter((term) => {
    const normalizedTerm = normalizeText(term);
    return normalizedTerm && searchText.includes(normalizedTerm);
  });

  if (!matchedTerms.length) return null;

  return {
    matchedTerms,
    baseScore: rule.type === RULE_TYPES.SPLIT_AREA ? 90 : 60
  };
};

const matchStoreProfile = (store, searchText) => {
  const serviceMatches = splitTerms(store.serviceAreas).filter((term) => {
    const normalizedTerm = normalizeText(term);
    return normalizedTerm && searchText.includes(normalizedTerm);
  });
  const reviewMatches = splitTerms(store.reviewAreas).filter((term) => {
    const normalizedTerm = normalizeText(term);
    return normalizedTerm && searchText.includes(normalizedTerm);
  });

  if (!serviceMatches.length && !reviewMatches.length) return null;

  const longestTerm = [...serviceMatches, ...reviewMatches].reduce(
    (length, term) => Math.max(length, normalizeText(term).length),
    0
  );
  const hasServiceMatch = serviceMatches.length > 0;
  const score = (hasServiceMatch ? 95 : 72) + longestTerm + (reviewMatches.length ? 4 : 0);

  return {
    store,
    rule: {
      id: `profile:${store.id}`,
      title: `Perfil de ${store.name || 'loja sem nome'}`,
      type: 'profile',
      mapHint: reviewMatches.length
        ? 'Area marcada no perfil para conferir antes de enviar.'
        : ''
    },
    matchedTerms: [...serviceMatches, ...reviewMatches],
    score,
    needsConfirmation: reviewMatches.length > 0
  };
};

export const matchOrderToStore = (order, state) => {
  const normalizedState = normalizeRoutingState(state);
  const stores = normalizedState.stores.filter((store) => store.canReceive && store.enabledTarget);
  const storesById = new Map(stores.map((store) => [store.id, store]));
  const address = order?.address || {};
  const searchText = normalizeText([
    address.display,
    address.raw,
    address.street,
    address.neighborhood,
    address.city,
    address.cep,
    address.complement
  ].filter(Boolean).join(' '));

  if (!searchText) {
    return {
      store: null,
      rule: null,
      candidates: [],
      confidence: 0,
      needsConfirmation: true,
      reason: 'Endereco nao identificado'
    };
  }

  const profileCandidates = stores
    .map((store) => matchStoreProfile(store, searchText))
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);

  if (profileCandidates.length) {
    const best = profileCandidates[0];
    const confidence = Math.max(45, Math.min(98, Math.round(best.score / 1.35)));

    return {
      store: best.store,
      rule: best.rule,
      candidates: profileCandidates,
      confidence,
      needsConfirmation: best.needsConfirmation,
      reason: best.needsConfirmation
        ? 'Area do perfil marcada para confirmar'
        : `Encontrado no perfil de ${best.store.name || 'loja sem nome'}`
    };
  }

  const candidates = normalizedState.rules
    .filter((rule) => rule.active && storesById.has(rule.targetStoreId))
    .map((rule) => {
      const match = rule.type === RULE_TYPES.STREET_NUMBER
        ? matchStreetNumberRule(rule, order)
        : matchTermRule(rule, searchText);

      if (!match) return null;

      const store = storesById.get(rule.targetStoreId);
      const score = match.baseScore + Number(rule.priority || 0) + (match.matchedTerms.length * 4);

      return {
        store,
        rule,
        matchedTerms: match.matchedTerms,
        score,
        needsConfirmation: rule.requiresConfirmation || rule.type === RULE_TYPES.SPLIT_AREA
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);

  const best = candidates[0] || null;

  if (!best) {
    return {
      store: null,
      rule: null,
      candidates,
      confidence: 0,
      needsConfirmation: true,
      reason: 'Nenhuma regra encontrou este endereco'
    };
  }

  const confidence = Math.max(35, Math.min(98, Math.round(best.score / 2)));

  return {
    store: best.store,
    rule: best.rule,
    candidates,
    confidence,
    needsConfirmation: best.needsConfirmation,
    reason: best.needsConfirmation
      ? 'Regiao marcada para confirmacao'
      : `Regra encontrada: ${best.rule.title}`
  };
};

export const buildQueueOrder = ({ order, routeResult, targetStoreId, sourceStoreId }) => ({
  id: createRoutingId('order'),
  dedupeKey: order.dedupeKey,
  orderNumber: order.orderNumber,
  customer: order.customer,
  address: order.address,
  locator: order.locator,
  sourceStoreId,
  targetStoreId,
  routeRuleId: routeResult?.rule?.id || '',
  routeReason: routeResult?.reason || '',
  rawText: order.raw,
  status: 'recebido',
  createdAt: new Date().toISOString(),
  printedAt: '',
  history: [
    {
      at: new Date().toISOString(),
      label: 'Pedido enviado para a fila'
    }
  ]
});
