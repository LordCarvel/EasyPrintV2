export const PAYMENT_KEYWORDS = [
  { word: 'dinheiro', cash: 3 },
  { word: 'troco', cash: 1 },
  { word: 'cobrar na entrega', cash: 2 },
  { word: 'levar troco', cash: 2 },
  { word: 'valor para levar de troco', cash: 2 },
  { word: 'pagar em especie', cash: 2 },
  { word: 'pagar em espécie', cash: 2 },
  { word: 'carteira digital', online: 3 },
  { word: 'pago via ifood', online: 3 },
  { word: 'ifood ja recebeu', online: 3 },
  { word: 'ifood já recebeu', online: 3 },
  { word: 'nao precisa cobrar', online: 3 },
  { word: 'não precisa cobrar', online: 3 },
  { word: 'pago via digital', online: 2 },
  { word: 'pago online', online: 2 },
  { word: 'pago no app', online: 2 },
  { word: 'pagamento confirmado', online: 1 },
  { word: 'autorizado no app', online: 1 },
  { word: 'pix', online: 1 },
  { word: 'cartao', card: 2 },
  { word: 'cartão', card: 2 },
  { word: 'credito', card: 2 },
  { word: 'crédito', card: 2 },
  { word: 'debito', card: 2 },
  { word: 'débito', card: 2 },
  { word: 'maquininha', card: 2 },
  { word: 'passar o cartao', card: 2 },
  { word: 'passar o cartão', card: 2 },
  { word: 'pagar no cartao', card: 2 },
  { word: 'pagar no cartão', card: 2 },
  { word: 'mastercard', card: 1, online: 1 },
  { word: 'visa', card: 1, online: 1 },
  { word: 'elo', card: 1, online: 1 },
  { word: 'hiper', card: 1, online: 1 },
  { word: 'hipercard', card: 1, online: 1 },
  { word: 'amex', card: 1, online: 1 },
  { word: 'vale refeicao', card: 1 },
  { word: 'vale refeição', card: 1 },
  { word: 'vr', card: 1 },
  { word: 'va', card: 1 },
  { word: 'vale alimentacao', card: 1 },
  { word: 'vale alimentação', card: 1 }
];

export const normalizePaymentText = (value = '') =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export const moneyToNumber = (value = '') => {
  const cleaned = String(value || '').replace(/[^\d,-]/g, '').replace(',', '.');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatCurrency = (value = 0) =>
  `R$ ${(Number(value) || 0).toFixed(2).replace('.', ',')}`;

const isMoneyLine = (line = '') => /-?\s*r\$\s*\d/i.test(line);

const findMoney = (lines = []) => {
  const line = lines.find(isMoneyLine) || '';
  return {
    raw: line,
    value: Math.abs(moneyToNumber(line))
  };
};

export const getPaymentMethodFromText = (value = '') => {
  const text = normalizePaymentText(value);
  const scores = { online: 0, cartao: 0, dinheiro: 0 };

  PAYMENT_KEYWORDS.forEach(({ word, online = 0, card = 0, cash = 0 }) => {
    if (!text.includes(normalizePaymentText(word))) return;
    scores.online += online;
    scores.cartao += card;
    scores.dinheiro += cash;
  });

  if (scores.dinheiro >= 3) return 'dinheiro';

  const max = Math.max(scores.online, scores.cartao, scores.dinheiro);
  if (max === scores.cartao) return 'cartao';
  if (max === scores.dinheiro) return 'dinheiro';
  return 'online';
};

const readLabelMoneyPairs = (lines = [], startIndex = 0) => {
  const pairs = [];

  for (let index = Math.max(0, startIndex); index < lines.length; index += 1) {
    const line = lines[index] || '';
    const next = lines[index + 1] || '';

    if (isMoneyLine(next)) {
      pairs.push({
        label: line,
        valueText: next,
        value: Math.abs(moneyToNumber(next))
      });
      index += 1;
      continue;
    }

    if (isMoneyLine(line)) {
      pairs.push({
        label: '',
        valueText: line,
        value: Math.abs(moneyToNumber(line))
      });
    }
  }

  return pairs;
};

export const parseIfoodFinancial = (rawText = '') => {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((line) => String(line || '').replace(/\s+/g, ' ').trim())
    .filter((line) => line && !/^[\u2022\u25CF]+$/.test(line));
  const normalizedLines = lines.map(normalizePaymentText);
  const itemsIndex = normalizedLines.findIndex((line) => line.startsWith('itens no pedido'));
  const searchStart = itemsIndex >= 0 ? itemsIndex + 1 : 0;
  const paymentIndex = normalizedLines.findIndex(
    (line, index) =>
      index >= searchStart &&
      (line.startsWith('pago via') || line.startsWith('cobrar do cliente'))
  );
  const pairs = readLabelMoneyPairs(lines, searchStart);
  const subtotal = pairs.find((pair) => normalizePaymentText(pair.label).includes('subtotal')) || null;
  const deliveryFee = pairs.find((pair) => normalizePaymentText(pair.label).includes('taxa de entrega')) || null;
  const serviceFee = pairs.find((pair) => normalizePaymentText(pair.label).includes('taxa de servi')) || null;
  const paymentLines = paymentIndex >= 0 ? lines.slice(paymentIndex, paymentIndex + 6) : [];
  const paymentMoney = findMoney(paymentLines);
  const methodText = paymentLines.join(' ');
  const paymentMethod = getPaymentMethodFromText(methodText || lines.slice(searchStart).join(' '));
  const subtotalValue = subtotal?.value || 0;
  const paymentValue = paymentMoney.value || 0;
  const deductionValue = paymentMethod === 'online'
    ? Math.max(subtotalValue, paymentValue)
    : paymentValue || subtotalValue;

  return {
    deductionValue,
    totalValue: deductionValue,
    subtotalValue,
    paymentValue,
    deliveryFeeValue: deliveryFee?.value || 0,
    serviceFeeValue: serviceFee?.value || 0,
    paymentMethod,
    paymentLabel: paymentLines[0] || '',
    paymentDescription: paymentLines.slice(1).filter(Boolean).join(' | '),
    hasFinancialData: deductionValue > 0 || subtotalValue > 0 || paymentValue > 0
  };
};
