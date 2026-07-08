import {
  createEmptyCourier,
  normalizePaymentMethod,
  normalizeAppState,
  parseNumber
} from '../utils/calculations';

const RECENT_LOG_LIMIT = 8;
const PROCESSED_COMMANDS_LIMIT = 300;

const normalizeText = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const buildCommandsUrl = (config) =>
  `${config.baseUrl}/projects/${encodeURIComponent(config.projectId)}/integration/commands`;

const buildCommandAckUrl = (config, commandId) =>
  `${config.baseUrl}/projects/${encodeURIComponent(config.projectId)}/integration/commands/${encodeURIComponent(commandId)}/ack`;

const appendHubLog = (state, message) => ({
  ...state,
  hubSync: {
    ...state.hubSync,
    lastAppliedCommands: [
      ...(state.hubSync.lastAppliedCommands || []),
      {
        message,
        createdAt: new Date().toISOString()
      }
    ].slice(-RECENT_LOG_LIMIT)
  }
});

const markProcessed = (state, commandId) => ({
  ...state,
  processedCommandIds: [
    ...state.processedCommandIds.filter((id) => id !== String(commandId)),
    String(commandId)
  ].slice(-PROCESSED_COMMANDS_LIMIT)
});

const updateHubStatus = (state, updates = {}) => ({
  ...state,
  hubSync: {
    ...state.hubSync,
    ...updates
  }
});

const fetchPendingCommands = async (config) => {
  const response = await fetch(buildCommandsUrl(config), {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Falha ao buscar comandos do hub (${response.status})`);
  }

  return response.json();
};

const acknowledgeCommand = async (config, commandId) => {
  const response = await fetch(buildCommandAckUrl(config, commandId), {
    method: 'POST'
  });

  if (!response.ok) {
    throw new Error(`Falha ao confirmar comando ${commandId} (${response.status})`);
  }
};

const applyIncomingOrderToCash = (state, command) => {
  const payload = command?.payload || {};
  const hubOrderId = String(payload.hubOrderId || '').trim();

  if (!hubOrderId) {
    return appendHubLog(state, 'Comando apply_incoming_order_to_cash ignorado sem hubOrderId.');
  }

  const alreadyExists = state.incomingOrders.some((order) => order.hubOrderId === hubOrderId);
  if (alreadyExists) {
    return appendHubLog(state, `Pedido ${hubOrderId} ja estava no caixa local.`);
  }

  const paymentMethod = normalizePaymentMethod(payload.paymentMethod);
  let cashAmount = parseNumber(payload.cashAmount ?? payload.dinheiroAmount);
  let cardAmount = parseNumber(payload.cardAmount ?? payload.cartaoAmount);
  let onlineAmount = parseNumber(payload.onlineAmount);
  const totalAmount = parseNumber(payload.totalAmount);

  if (!cashAmount && !cardAmount && !onlineAmount && totalAmount && paymentMethod) {
    if (paymentMethod === 'dinheiro') cashAmount = totalAmount;
    if (paymentMethod === 'cartao') cardAmount = totalAmount;
    if (paymentMethod === 'online') onlineAmount = totalAmount;
  }

  return appendHubLog(
    {
      ...state,
      incomingOrders: [
        ...state.incomingOrders,
        {
          hubOrderId,
          sourceBranchId: String(payload.sourceBranchId || '').trim(),
          sourceBranchName: String(payload.sourceBranchName || '').trim(),
          paymentMethod,
          cashAmount,
          cardAmount,
          onlineAmount,
          totalAmount,
          operationalDate: String(payload.operationalDate || '').trim(),
          receivedAt: new Date().toISOString()
        }
      ]
    },
    `Pedido ${hubOrderId} adicionado ao caixa a partir do EasyPrint via hub.`
  );
};

const applyCourierDispatchedOrders = (state, command) => {
  const payload = command?.payload || {};
  const courierId = String(payload.courierId || '').trim();
  const courierName = String(payload.courierName || '').trim();
  const incrementBy = Math.max(0, Math.round(parseNumber(payload.incrementBy) || 0));
  const defaultRateId = state.hubConfig.defaultRateId || state.rateConfigs[0]?.id;

  if (!incrementBy || !defaultRateId) {
    return appendHubLog(state, 'Comando increment_courier_dispatched_orders ignorado sem taxa padrao ou incremento.');
  }

  const couriers = [...state.couriers];
  const targetIndex = couriers.findIndex((courier) =>
    (courierId && courier.hubCourierId === courierId)
    || (courierName && normalizeText(courier.name) === normalizeText(courierName))
  );

  const targetCourier = targetIndex >= 0
    ? {
      ...couriers[targetIndex],
      countsByRate: { ...couriers[targetIndex].countsByRate }
    }
    : createEmptyCourier(state.rateConfigs, {
      name: courierName,
      hubCourierId: courierId
    });

  const currentCount = parseNumber(targetCourier.countsByRate[defaultRateId]);
  targetCourier.hubCourierId = courierId || targetCourier.hubCourierId;
  targetCourier.name = courierName || targetCourier.name;
  targetCourier.countsByRate[defaultRateId] = String(currentCount + incrementBy);

  if (targetIndex >= 0) {
    couriers[targetIndex] = targetCourier;
  } else {
    couriers.push(targetCourier);
  }

  const rateLabel = state.rateConfigs.find((rate) => rate.id === defaultRateId)?.name || 'taxa padrao';

  return appendHubLog(
    {
      ...state,
      couriers
    },
    `${incrementBy} entrega(s) do hub aplicada(s) para ${courierName || courierId || 'motoboy'} em ${rateLabel}.`
  );
};

const applyCommandLocally = (state, command) => {
  if (command?.command === 'apply_incoming_order_to_cash') {
    return applyIncomingOrderToCash(state, command);
  }

  if (command?.command === 'increment_courier_dispatched_orders') {
    return applyCourierDispatchedOrders(state, command);
  }

  return appendHubLog(state, `Comando ${command?.command || 'desconhecido'} ignorado.`);
};

export const syncHubCommands = async (inputState) => {
  let state = normalizeAppState(inputState);
  const config = state.hubConfig;

  if (!config.enabled || !config.projectId || !config.baseUrl) {
    return updateHubStatus(state, {
      lastError: '',
      lastSyncAt: state.hubSync.lastSyncAt
    });
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return updateHubStatus(state, {
      lastError: 'Sem conexao para sincronizar com o Delivery Hub.'
    });
  }

  try {
    const commands = await fetchPendingCommands(config);

    for (const command of commands) {
      const commandId = String(command?.id || '').trim();
      if (!commandId) continue;

      if (state.processedCommandIds.includes(commandId)) {
        try {
          await acknowledgeCommand(config, commandId);
          state = appendHubLog(state, `Comando ${command.command} confirmado sem reaplicar.`);
        } catch (error) {
          state = updateHubStatus(state, {
            lastError: error instanceof Error ? error.message : String(error)
          });
        }
        continue;
      }

      state = applyCommandLocally(state, command);
      state = markProcessed(state, commandId);

      try {
        await acknowledgeCommand(config, commandId);
      } catch (error) {
        state = updateHubStatus(state, {
          lastError: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return updateHubStatus(state, {
      lastError: '',
      lastSyncAt: new Date().toISOString()
    });
  } catch (error) {
    return updateHubStatus(state, {
      lastError: error instanceof Error ? error.message : 'Falha ao sincronizar com o Delivery Hub.'
    });
  }
};
