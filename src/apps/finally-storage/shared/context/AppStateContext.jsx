import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { syncHubCommands } from '../integration/deliveryHub';
import { loadAppState, loadPreviewImage, saveAppState, savePreviewImage } from '../storage/appStorage';
import {
  DEFAULT_REPORT_CONFIG,
  createEmptyCourier,
  createId,
  normalizeAppState
} from '../utils/calculations';
import {
  hydrateLocalSettingsFromStore,
  saveStoreSettingsPatch
} from '../../../../features/routing/storeSettingsClient';

const AppStateContext = createContext(null);

export function AppStateProvider({ children }) {
  const [appState, setAppState] = useState(() => normalizeAppState(loadAppState() || {}));
  const [previewImage, setPreviewImage] = useState(() => loadPreviewImage());
  const [lastSavedAt, setLastSavedAt] = useState('');
  const [isHubSyncing, setIsHubSyncing] = useState(false);
  const syncInFlightRef = useRef(false);
  const stateRef = useRef(appState);
  const profileHydratedRef = useRef(false);
  const saveTimerRef = useRef(null);

  useEffect(() => {
    let canceled = false;

    void hydrateLocalSettingsFromStore()
      .then((settings) => {
        if (canceled) return;

        if (settings.finallyStorageState && typeof settings.finallyStorageState === 'object') {
          setAppState(normalizeAppState(settings.finallyStorageState));
        }
      })
      .catch((error) => {
        console.warn('Usando fechamento local porque o perfil da loja nao carregou', error);
      })
      .finally(() => {
        if (!canceled) profileHydratedRef.current = true;
      });

    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    stateRef.current = appState;
    saveAppState(appState);
    setLastSavedAt(new Date().toISOString());

    if (!profileHydratedRef.current) return undefined;

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      void saveStoreSettingsPatch({ finallyStorageState: appState }).catch((error) => {
        console.error('Falha ao salvar Finally Storage no perfil da loja', error);
      });
    }, 300);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [appState]);

  useEffect(() => {
    savePreviewImage(previewImage);
  }, [previewImage]);

  const updateState = (updater) => {
    setAppState((previousState) =>
      normalizeAppState(typeof updater === 'function' ? updater(previousState) : updater)
    );
  };

  const addCourier = () => {
    updateState((previousState) => ({
      ...previousState,
      couriers: [...previousState.couriers, createEmptyCourier(previousState.rateConfigs)]
    }));
  };

  const updateCourier = (courierId, updates) => {
    updateState((previousState) => ({
      ...previousState,
      couriers: previousState.couriers.map((courier) =>
        courier.id === courierId
          ? {
            ...courier,
            ...updates,
            countsByRate: {
              ...courier.countsByRate,
              ...(updates.countsByRate || {})
            }
          }
          : courier
      )
    }));
  };

  const removeCourier = (courierId) => {
    updateState((previousState) => {
      const nextCouriers = previousState.couriers.filter((courier) => courier.id !== courierId);
      return {
        ...previousState,
        couriers: nextCouriers.length ? nextCouriers : [createEmptyCourier(previousState.rateConfigs)]
      };
    });
  };

  const addRateConfig = () => {
    updateState((previousState) => ({
      ...previousState,
      rateConfigs: [
        ...previousState.rateConfigs,
        {
          id: createId('rate'),
          name: `Nova taxa ${previousState.rateConfigs.length + 1}`,
          value: 0
        }
      ]
    }));
  };

  const updateRateConfig = (rateId, updates) => {
    updateState((previousState) => ({
      ...previousState,
      rateConfigs: previousState.rateConfigs.map((rate) =>
        rate.id === rateId ? { ...rate, ...updates } : rate
      )
    }));
  };

  const removeRateConfig = (rateId) => {
    updateState((previousState) => {
      if (previousState.rateConfigs.length === 1) {
        return previousState;
      }

      return {
        ...previousState,
        rateConfigs: previousState.rateConfigs.filter((rate) => rate.id !== rateId)
      };
    });
  };

  const setCashField = (field, value) => {
    updateState((previousState) => ({
      ...previousState,
      cash: {
        ...previousState.cash,
        [field]: value
      }
    }));
  };

  const setHubConfigField = (field, value) => {
    updateState((previousState) => ({
      ...previousState,
      hubConfig: {
        ...previousState.hubConfig,
        [field]: value
      }
    }));
  };

  const setReportConfigField = (field, value) => {
    updateState((previousState) => ({
      ...previousState,
      reportConfig: {
        ...previousState.reportConfig,
        [field]: value
      }
    }));
  };

  const resetReportConfig = () => {
    updateState((previousState) => ({
      ...previousState,
      reportConfig: { ...DEFAULT_REPORT_CONFIG }
    }));
  };

  const clearIncomingOrders = () => {
    updateState((previousState) => ({
      ...previousState,
      incomingOrders: []
    }));
  };

  const clearDayData = () => {
    setPreviewImage({
      dataUrl: '',
      generatedAt: ''
    });

    updateState((previousState) => ({
      ...previousState,
      couriers: [createEmptyCourier(previousState.rateConfigs)],
      cash: {
        dinheiro: '',
        cartao: '',
        online: ''
      },
      incomingOrders: []
    }));
  };

  const synchronizeHub = async () => {
    if (syncInFlightRef.current) return;

    syncInFlightRef.current = true;
    setIsHubSyncing(true);

    try {
      const nextState = await syncHubCommands(stateRef.current);
      updateState(nextState);
    } finally {
      syncInFlightRef.current = false;
      setIsHubSyncing(false);
    }
  };

  useEffect(() => {
    if (!appState.hubConfig.enabled || !appState.hubConfig.projectId) return undefined;

    const timer = window.setInterval(() => {
      void synchronizeHub();
    }, appState.hubConfig.pollIntervalSeconds * 1000);

    return () => window.clearInterval(timer);
  }, [
    appState.hubConfig.enabled,
    appState.hubConfig.projectId,
    appState.hubConfig.pollIntervalSeconds
  ]);

  useEffect(() => {
    if (appState.hubConfig.enabled && appState.hubConfig.projectId) {
      void synchronizeHub();
    }

    const handleOnline = () => {
      void synchronizeHub();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  return (
    <AppStateContext.Provider
      value={{
        appState,
        previewImage,
        lastSavedAt,
        isHubSyncing,
        actions: {
          addCourier,
          updateCourier,
          removeCourier,
          addRateConfig,
          updateRateConfig,
          removeRateConfig,
          setCashField,
          setHubConfigField,
          setReportConfigField,
          resetReportConfig,
          clearIncomingOrders,
          clearDayData,
          setPreviewImage,
          synchronizeHub
        }
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppStateContext);

  if (!context) {
    throw new Error('useAppState must be used inside AppStateProvider');
  }

  return context;
}
