import { createReceiptPrintEngine } from '../home/receiptPrintEngine';
import { hydrateLocalSettingsFromStore, saveStoreSettingsPatch } from './storeSettingsClient';
import { Printer } from '../../shared/utils/Printer';
import { showAppAlert } from '../../shared/ui/appDialog';

export const isResentOrder = (order = {}) => Boolean(order.isResend || order.status === 'reenviado');

const readLocalJson = (key, fallback) => {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || 'null');
    return value ?? fallback;
  } catch {
    return fallback;
  }
};

const loadPrintSettingsSnapshot = async () => {
  try {
    return await hydrateLocalSettingsFromStore();
  } catch (error) {
    console.warn('Usando configuracoes locais para impressao de pedido roteado', error);
    return {
      keywords: readLocalJson('keywords', []),
      catalogs: readLocalJson('catalogs', []),
      printTemplate: readLocalJson('template', {}),
      cashOrders: readLocalJson('cashOrders', []),
      cashProcessed: readLocalJson('cashProcessed', [])
    };
  }
};

const persistPrintedCashOrder = async ({ orderNumber, customerName, totalValue, paymentMethod }, options = {}) => {
  const normalizedOrderNumber = String(orderNumber || '').trim();
  if (!normalizedOrderNumber) return null;

  if (options.skipCash) {
    void showAppAlert(`Atencao: o pedido #${normalizedOrderNumber} foi reenviado e nao sera lancado novamente no caixa.`);
    return {
      alreadyProcessed: true,
      skippedCash: true
    };
  }

  const storedOrders = readLocalJson('cashOrders', []);
  const storedProcessed = readLocalJson('cashProcessed', []);
  const safeOrders = Array.isArray(storedOrders) ? storedOrders : [];
  const safeProcessed = Array.isArray(storedProcessed) ? storedProcessed : [];
  const existingEntry = safeOrders.find((order) =>
    String(order?.orderNumber || order?.id || '').trim() === normalizedOrderNumber
  );
  const alreadyProcessed = safeProcessed.includes(normalizedOrderNumber) || Boolean(existingEntry);

  const newEntry = {
    id: normalizedOrderNumber,
    orderNumber: normalizedOrderNumber,
    customer: customerName,
    total: totalValue,
    paymentMethod,
    timestamp: new Date().toLocaleTimeString('pt-BR'),
    date: new Date().toLocaleDateString('pt-BR'),
    isReprint: alreadyProcessed
  };

  if (alreadyProcessed) {
    const updatedProcessed = safeProcessed.includes(normalizedOrderNumber)
      ? safeProcessed
      : [...safeProcessed, normalizedOrderNumber];

    if (updatedProcessed !== safeProcessed) {
      window.localStorage.setItem('cashProcessed', JSON.stringify(updatedProcessed));
      void saveStoreSettingsPatch({
        cashOrders: safeOrders,
        cashProcessed: updatedProcessed
      }).catch((error) => {
        console.error('Falha ao salvar caixa no perfil da loja', error);
      });
    }

    void showAppAlert(`Atencao: o pedido #${normalizedOrderNumber} ja estava no caixa e nao foi lancado novamente.`);
    return {
      alreadyProcessed: true,
      entry: existingEntry || newEntry
    };
  }

  const updatedOrders = [...safeOrders, newEntry];
  const updatedProcessed = [...safeProcessed, normalizedOrderNumber];

  window.localStorage.setItem('cashOrders', JSON.stringify(updatedOrders));
  window.localStorage.setItem('cashProcessed', JSON.stringify(updatedProcessed));
  void saveStoreSettingsPatch({
    cashOrders: updatedOrders,
    cashProcessed: updatedProcessed
  }).catch((error) => {
    console.error('Falha ao salvar caixa no perfil da loja', error);
  });
  window.dispatchEvent(
    new CustomEvent('registerOrder', {
      detail: newEntry
    })
  );

  return {
    alreadyProcessed,
    entry: newEntry
  };
};

export async function printRoutedOrderText(rawText, options = {}) {
  const content = String(rawText || '').trim();
  if (!content) {
    throw new Error('Esse pedido nao tem texto bruto salvo para imprimir.');
  }

  const settings = await loadPrintSettingsSnapshot();
  const printEngine = createReceiptPrintEngine({
    keywords: settings.keywords,
    catalogs: settings.catalogs,
    template: settings.printTemplate
  });
  const job = printEngine.buildPrintJob(content);

  Printer.printPreview(job.html);
  const cashResult = await persistPrintedCashOrder(job.cash, {
    skipCash: Boolean(options.skipCash)
  });

  return {
    ...job,
    cashResult
  };
}
