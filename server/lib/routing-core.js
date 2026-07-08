import { parseIfoodFinancial } from '../../shared/routing/ifoodFinancial.js';

export const ORDER_STATUS = {
  SENT: 'enviado',
  VIEWED: 'visto',
  PRINTED: 'impresso',
  PRINT_ERROR: 'erro_impressao',
  CANCELED: 'cancelado',
  RESENT: 'reenviado'
};

export const normalizeText = (value = '') =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const splitAreas = (value = []) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '').trim()).filter(Boolean);
  }

  return String(value || '')
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const cleanLine = (line = '') =>
  String(line)
    .replace(/●/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isNoiseLine = (line = '') => {
  const normalized = normalizeText(line);
  return (
    !normalized ||
    normalized === 'copiar link' ||
    normalized === 'compartilhar' ||
    normalized === 'saiba mais' ||
    normalized.includes('envie o link pro entregador')
  );
};

const findAddressLineIndex = (lines) =>
  lines.findIndex((line) => {
    const normalized = normalizeText(line);
    const startsAsAddress = /^(r|rua|av|avenida|alameda|travessa|tv|estrada|rodovia|praca)\b/.test(normalized);
    const hasNumber = /,\s*\d+/.test(line);
    const hasSeparator = /\s-\s/.test(line);
    const hasCep = /\b\d{5}-?\d{3}\b/.test(line);
    return (startsAsAddress && hasNumber) || (hasNumber && hasSeparator) || (hasSeparator && hasCep);
  });

const getComplementAfterAddress = (lines, addressIndex) => {
  if (addressIndex < 0) return '';

  for (let index = addressIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const normalized = normalizeText(line);

    if (!line) continue;
    if (normalized.includes('entrega propria')) return '';
    if (normalized.includes('confirmacao de entrega')) return '';
    if (normalized.includes('itens no pedido')) return '';
    if (isNoiseLine(line)) continue;

    return line;
  }

  return '';
};

const parseAddress = (rawLine = '', complement = '') => {
  const cepMatch = rawLine.match(/\b\d{5}-?\d{3}\b/);
  const cep = cepMatch?.[0] || '';
  const withoutCep = cleanLine(rawLine.replace(/\b\d{5}-?\d{3}\b/g, ''));
  const parts = withoutCep.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  const streetPart = parts[0] || withoutCep;
  const streetMatch = streetPart.match(/^(.+?),\s*([0-9]+[A-Za-zºª-]*)/);
  const street = streetMatch ? streetMatch[1].trim() : streetPart.trim();
  const numberText = streetMatch ? streetMatch[2].trim() : '';

  return {
    raw: rawLine,
    street,
    number: numberText,
    neighborhood: parts[1] || '',
    city: parts.slice(2).join(' - '),
    cep,
    complement,
    display: [streetPart, parts[1], parts.slice(2).join(' - ')].filter(Boolean).join(' - ')
  };
};

const isStopItemLine = (line = '') => {
  const normalized = normalizeText(line);
  return (
    normalized.startsWith('taxa de entrega') ||
    normalized.startsWith('taxa de servico') ||
    normalized.startsWith('subtotal') ||
    normalized.startsWith('incentivos') ||
    normalized.startsWith('pago via') ||
    normalized.startsWith('cobrar do cliente')
  );
};

const isPriceLine = (line = '') => /-?\s*r\$\s*\d/i.test(line);

const parseItems = (lines) => {
  const lowerLines = lines.map(normalizeText);
  const start = lowerLines.findIndex((line) => line.startsWith('itens no pedido'));
  if (start < 0) return [];

  const items = [];
  let current = null;

  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const normalized = lowerLines[index];

    if (!line || normalized.includes('substituir itens')) continue;
    if (isStopItemLine(line)) break;

    if (/^\d+$/.test(line) && current && !current.quantity) {
      current.quantity = line;
      continue;
    }

    if (isPriceLine(line)) {
      if (current && !current.price) {
        current.price = line;
      }
      continue;
    }

    if (current?.name) {
      items.push(current);
    }

    current = {
      name: line,
      quantity: '',
      price: ''
    };
  }

  if (current?.name) {
    items.push(current);
  }

  return items;
};

export const parseIfoodOrder = (rawText = '') => {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((line) => line && !/^[\u2022\u25CF]+$/.test(line) && !isNoiseLine(line));

  const lowerLines = lines.map(normalizeText);
  const addressIndex = findAddressLineIndex(lines);
  const addressLine = addressIndex >= 0 ? lines[addressIndex] : '';
  const locatorLine = lines.find((line) => /localizador/i.test(line)) || '';
  const etaLine = lines.find((line) => /entrega prevista/i.test(line)) || '';
  const statusLine = lines.find((line) => /pedido em preparo|pedido pronto|saiu para entrega/i.test(line)) || '';
  const contactLine = lines.find((line) => /\bid:/i.test(line)) || '';
  const placedLine = lines.find((line) => /feito\s*(as|às)/i.test(line)) || '';

  return {
    orderNumber: lines[0] || '',
    customerName: lines[1] || '',
    sourceBrand: lines[2] || '',
    sourceStoreName: lines[3] || lines[2] || '',
    placedAt: placedLine.replace(/.*(as|às)\s*/i, '').trim(),
    locator: locatorLine.replace(/.*localizador\s*/i, '').trim(),
    eta: etaLine.replace(/.*prevista:?\s*/i, '').trim(),
    statusText: statusLine,
    contactId: contactLine.split(/id:/i)[1]?.trim() || '',
    address: parseAddress(addressLine, getComplementAfterAddress(lines, addressIndex)),
    items: parseItems(lines),
    financial: parseIfoodFinancial(rawText),
    rawText
  };
};

const buildSearchText = (parsedData = {}) =>
  normalizeText([
    parsedData.address?.display,
    parsedData.address?.raw,
    parsedData.address?.street,
    parsedData.address?.neighborhood,
    parsedData.address?.city,
    parsedData.address?.cep,
    parsedData.address?.complement,
    parsedData.rawText
  ].filter(Boolean).join(' '));

const getAreaMatches = (areas, searchText) =>
  splitAreas(areas)
    .map((area) => ({ area, normalized: normalizeText(area) }))
    .filter(({ normalized }) => normalized && searchText.includes(normalized))
    .map(({ area, normalized }) => ({ area, length: normalized.length }));

export const routeOrder = (parsedData, stores = []) => {
  const activeStores = stores.filter((store) => store?.receivesOrders !== false);
  const searchText = buildSearchText(parsedData);

  if (!searchText) {
    return {
      suggestedStoreId: null,
      matchedArea: '',
      confidence: 'manual',
      requiresReview: false,
      reason: 'Endereco nao identificado. Escolha a loja manualmente.',
      candidates: []
    };
  }

  const candidates = activeStores
    .map((store) => {
      const serviceMatches = getAreaMatches(store.serviceAreas, searchText);
      const reviewMatches = getAreaMatches(store.reviewAreas, searchText);

      if (!serviceMatches.length && !reviewMatches.length) return null;

      const bestMatch = [...serviceMatches, ...reviewMatches]
        .sort((left, right) => right.length - left.length)[0];
      const requiresReview = reviewMatches.length > 0;
      const score = bestMatch.length + (serviceMatches.length ? 30 : 0) + (requiresReview ? 8 : 0);

      return {
        storeId: store.id,
        storeName: store.name,
        matchedArea: bestMatch.area,
        requiresReview,
        score
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);

  if (!candidates.length) {
    return {
      suggestedStoreId: null,
      matchedArea: '',
      confidence: 'manual',
      requiresReview: false,
      reason: 'Nenhuma area cadastrada encontrou esse endereco. Escolha a loja manualmente.',
      candidates
    };
  }

  const best = candidates[0];
  const second = candidates[1];

  if (second && Math.abs(best.score - second.score) <= 4) {
    return {
      suggestedStoreId: null,
      matchedArea: best.matchedArea,
      confidence: 'manual',
      requiresReview: true,
      reason: 'Mais de uma loja parece atender esse endereco. Confirme manualmente.',
      candidates
    };
  }

  return {
    suggestedStoreId: best.storeId,
    matchedArea: best.matchedArea,
    confidence: best.requiresReview ? 'medium' : 'high',
    requiresReview: best.requiresReview,
    reason: best.requiresReview
      ? 'Area cadastrada como conferencia manual.'
      : `Endereco encontrado no perfil de ${best.storeName}.`,
    candidates
  };
};
