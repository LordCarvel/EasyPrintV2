export const DEFAULT_RATE_CONFIGS = [
  { id: 'taxa-normal', name: 'Taxa normal', value: 0 },
  { id: 'taxa-arrancada', name: 'Taxa de arrancada', value: 0 },
  { id: 'picarras-1', name: 'Picarras 1', value: 0 },
  { id: 'picarras-2', name: 'Picarras 2', value: 0 },
  { id: 'picarras-3', name: 'Picarras 3', value: 0 }
];

export const DEFAULT_HUB_CONFIG = {
  enabled: false,
  baseUrl: 'http://127.0.0.1:8080',
  projectId: '',
  appId: 'finally-storage',
  pollIntervalSeconds: 20,
  defaultRateId: DEFAULT_RATE_CONFIGS[0].id
};

export const DEFAULT_REPORT_CONFIG = {
  showSummaryCards: false,
  showCourierTable: true,
  showIncomingOrdersTable: false,
  showManualCashDetails: true,
  showEasyPrintBreakdown: true
};

export const parseNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  const normalized = String(value ?? '')
    .replace(/\s+/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatCurrency = (value) =>
  parseNumber(value).toFixed(2).replace('.', ',');

export const getOperationalDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const createId = (prefix = 'id') =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;

export const normalizePaymentMethod = (value = '') => {
  const normalized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  if (!normalized) return '';
  if (normalized === 'cash' || normalized === 'dinheiro') return 'dinheiro';
  if (normalized === 'card' || normalized === 'cartao') return 'cartao';
  if (normalized === 'online') return 'online';

  return normalized;
};

export const normalizeRateConfigs = (rateConfigs = []) => {
  const source = Array.isArray(rateConfigs) && rateConfigs.length
    ? rateConfigs
    : DEFAULT_RATE_CONFIGS;

  const normalizedRates = source.map((rate, index) => ({
    id: String(rate?.id || createId('rate')),
    name: rate?.name === undefined || rate?.name === null
      ? `Taxa ${index + 1}`
      : String(rate.name),
    value: parseNumber(rate?.value)
  }));

  if (!normalizedRates.some((rate) => rate.id === 'taxa-arrancada')) {
    const arrancadaRate = { ...DEFAULT_RATE_CONFIGS.find((rate) => rate.id === 'taxa-arrancada') };
    const normalRateIndex = normalizedRates.findIndex((rate) => rate.id === 'taxa-normal');

    if (normalRateIndex >= 0) {
      normalizedRates.splice(normalRateIndex + 1, 0, arrancadaRate);
    } else {
      normalizedRates.unshift(arrancadaRate);
    }
  }

  return normalizedRates;
};

export const createEmptyCourier = (rateConfigs = DEFAULT_RATE_CONFIGS, courier = {}) => {
  const rates = normalizeRateConfigs(rateConfigs);
  const countsByRate = {};

  rates.forEach((rate) => {
    countsByRate[rate.id] = String(courier?.countsByRate?.[rate.id] ?? '').trim();
  });

  return {
    id: String(courier?.id || createId('courier')),
    hubCourierId: String(courier?.hubCourierId || '').trim(),
    name: String(courier?.name || '').trim(),
    countsByRate,
    adjustmentSign: courier?.adjustmentSign === '-' ? '-' : '+',
    adjustmentValue: String(courier?.adjustmentValue ?? '').trim()
  };
};

export const normalizeCouriers = (couriers = [], rateConfigs = DEFAULT_RATE_CONFIGS) => {
  const source = Array.isArray(couriers) && couriers.length
    ? couriers
    : [createEmptyCourier(rateConfigs)];

  return source.map((courier) => createEmptyCourier(rateConfigs, courier));
};

export const normalizeIncomingOrders = (incomingOrders = []) =>
  (Array.isArray(incomingOrders) ? incomingOrders : [])
    .filter(Boolean)
    .map((order) => {
      const paymentMethod = normalizePaymentMethod(order?.paymentMethod);
      let cashAmount = parseNumber(order?.cashAmount ?? order?.dinheiroAmount);
      let cardAmount = parseNumber(order?.cardAmount ?? order?.cartaoAmount);
      let onlineAmount = parseNumber(order?.onlineAmount);
      const fallbackTotal = parseNumber(order?.totalAmount);

      if (!cashAmount && !cardAmount && !onlineAmount && fallbackTotal && paymentMethod) {
        if (paymentMethod === 'dinheiro') cashAmount = fallbackTotal;
        if (paymentMethod === 'cartao') cardAmount = fallbackTotal;
        if (paymentMethod === 'online') onlineAmount = fallbackTotal;
      }

      const splitTotal = cashAmount + cardAmount + onlineAmount;
      const unmappedAmount = Math.max(0, fallbackTotal - splitTotal);

      return {
        hubOrderId: String(order?.hubOrderId || '').trim(),
        sourceBranchId: String(order?.sourceBranchId || '').trim(),
        sourceBranchName: String(order?.sourceBranchName || '').trim(),
        paymentMethod,
        cashAmount,
        cardAmount,
        onlineAmount,
        unmappedAmount,
        totalAmount: splitTotal || fallbackTotal,
        operationalDate: String(order?.operationalDate || '').trim(),
        receivedAt: String(order?.receivedAt || '').trim()
      };
    });

export const normalizeHubConfig = (hubConfig = {}, rateConfigs = DEFAULT_RATE_CONFIGS) => {
  const rates = normalizeRateConfigs(rateConfigs);
  const defaultRateId = rates.some((rate) => rate.id === hubConfig?.defaultRateId)
    ? hubConfig.defaultRateId
    : rates[0]?.id || DEFAULT_HUB_CONFIG.defaultRateId;

  return {
    enabled: Boolean(hubConfig?.enabled),
    baseUrl: String(hubConfig?.baseUrl || DEFAULT_HUB_CONFIG.baseUrl).trim().replace(/\/+$/, ''),
    projectId: String(hubConfig?.projectId ?? '').trim(),
    appId: DEFAULT_HUB_CONFIG.appId,
    pollIntervalSeconds: Math.max(
      5,
      Math.round(parseNumber(hubConfig?.pollIntervalSeconds) || DEFAULT_HUB_CONFIG.pollIntervalSeconds)
    ),
    defaultRateId
  };
};

export const normalizeReportConfig = (reportConfig = {}) => ({
  showSummaryCards: reportConfig?.showSummaryCards ?? DEFAULT_REPORT_CONFIG.showSummaryCards,
  showCourierTable: reportConfig?.showCourierTable ?? DEFAULT_REPORT_CONFIG.showCourierTable,
  showIncomingOrdersTable: reportConfig?.showIncomingOrdersTable ?? DEFAULT_REPORT_CONFIG.showIncomingOrdersTable,
  showManualCashDetails: reportConfig?.showManualCashDetails ?? DEFAULT_REPORT_CONFIG.showManualCashDetails,
  showEasyPrintBreakdown: reportConfig?.showEasyPrintBreakdown ?? DEFAULT_REPORT_CONFIG.showEasyPrintBreakdown
});

export const normalizeAppState = (state = {}) => {
  const rateConfigs = normalizeRateConfigs(state.rateConfigs);

  return {
    rateConfigs,
    couriers: normalizeCouriers(state.couriers, rateConfigs),
    cash: {
      dinheiro: String(state?.cash?.dinheiro ?? '').trim(),
      cartao: String(state?.cash?.cartao ?? '').trim(),
      online: String(state?.cash?.online ?? '').trim()
    },
    incomingOrders: normalizeIncomingOrders(state.incomingOrders),
    hubConfig: normalizeHubConfig(state.hubConfig, rateConfigs),
    reportConfig: normalizeReportConfig(state.reportConfig),
    processedCommandIds: Array.isArray(state.processedCommandIds)
      ? state.processedCommandIds.map((value) => String(value)).filter(Boolean).slice(-300)
      : [],
    hubSync: {
      lastSyncAt: String(state?.hubSync?.lastSyncAt || ''),
      lastError: String(state?.hubSync?.lastError || ''),
      lastAppliedCommands: Array.isArray(state?.hubSync?.lastAppliedCommands)
        ? state.hubSync.lastAppliedCommands.slice(-8)
        : []
    }
  };
};

export const calculateCourierBaseTotal = (courier, rateConfigs = DEFAULT_RATE_CONFIGS) =>
  normalizeRateConfigs(rateConfigs).reduce((accumulator, rate) => {
    const deliveries = parseNumber(courier?.countsByRate?.[rate.id]);
    return accumulator + deliveries * rate.value;
  }, 0);

export const calculateCourierTotal = (courier, rateConfigs = DEFAULT_RATE_CONFIGS) => {
  const baseTotal = calculateCourierBaseTotal(courier, rateConfigs);
  const adjustmentValue = parseNumber(courier?.adjustmentValue);
  const signedAdjustment = courier?.adjustmentSign === '-' ? -adjustmentValue : adjustmentValue;
  return baseTotal + signedAdjustment;
};

export const calculateIncomingOrdersTotal = (incomingOrders = []) =>
  normalizeIncomingOrders(incomingOrders).reduce(
    (accumulator, order) => accumulator + parseNumber(order.totalAmount),
    0
  );

export const calculateIncomingPaymentTotals = (incomingOrders = []) =>
  normalizeIncomingOrders(incomingOrders).reduce(
    (accumulator, order) => ({
      dinheiro: accumulator.dinheiro + parseNumber(order.cashAmount),
      cartao: accumulator.cartao + parseNumber(order.cardAmount),
      online: accumulator.online + parseNumber(order.onlineAmount),
      unmapped: accumulator.unmapped + parseNumber(order.unmappedAmount),
      total: accumulator.total + parseNumber(order.totalAmount)
    }),
    {
      dinheiro: 0,
      cartao: 0,
      online: 0,
      unmapped: 0,
      total: 0
    }
  );

export const calculateCashTotal = (cash = {}, incomingOrders = []) =>
  parseNumber(cash.dinheiro)
  + parseNumber(cash.cartao)
  + parseNumber(cash.online)
  + calculateIncomingOrdersTotal(incomingOrders);

export const calculateTotals = (state) => {
  const normalizedState = normalizeAppState(state);
  const couriersTotal = normalizedState.couriers.reduce(
    (accumulator, courier) => accumulator + calculateCourierTotal(courier, normalizedState.rateConfigs),
    0
  );

  return {
    couriersTotal,
    incomingPaymentTotals: calculateIncomingPaymentTotals(normalizedState.incomingOrders),
    incomingOrdersTotal: calculateIncomingOrdersTotal(normalizedState.incomingOrders),
    cashTotal: calculateCashTotal(normalizedState.cash, normalizedState.incomingOrders)
  };
};
