import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalStorage } from './useLocalStorage';
import domain, { emptyStore } from '../core/domain';
import { reconcileEntregasWithSharedOrders } from '../utils/deliveryHub';
import { hydrateLocalSettingsFromStore, saveStoreSettingsPatch } from '../../../features/routing/storeSettingsClient';

const SAVE_LOCK_MS = 1000;
const SAVE_LOCK_MESSAGE = 'Aguarde salvar no banco antes de fazer outra acao.';

function coerceStoreShape(candidate) {
  if (!candidate || typeof candidate !== 'object') return { ...emptyStore };
  return {
    motoboys: Array.isArray(candidate.motoboys) ? candidate.motoboys : [],
    viagens: Array.isArray(candidate.viagens) ? candidate.viagens : [],
    entregas: Array.isArray(candidate.entregas) ? candidate.entregas : [],
  };
}

function migrateLegacyMotoboys(raw) {
  if (!Array.isArray(raw)) return null;
  const motoboys = [];
  const viagens = [];
  const entregas = [];
  const now = new Date().toISOString();

  raw.forEach((m) => {
    const novoMotoboy = domain.createMotoboy(m?.nome || 'Motoboy');
    motoboys.push(novoMotoboy);

    (m?.levas || []).forEach((leva) => {
      const viagem = domain.createViagem(novoMotoboy.id, { dataHoraSaida: now });
      viagens.push(viagem);
      (leva || []).forEach((pedido) => {
        const entrega = domain.createEntrega(viagem.id, pedido);
        entregas.push(entrega);
      });
    });
  });

  return { motoboys, viagens, entregas };
}

// Hook that provides state and actions for Motoboys, Viagens and Entregas.
// Persists a single store object { motoboys, viagens, entregas } in localStorage under given key.
export function useDeliveryBoard(storageKey = 'deliveryBoardV2') {
  const [store, setStore] = useLocalStorage(storageKey, emptyStore);
  const [isActionLocked, setIsActionLocked] = useState(true);
  const [saveError, setSaveError] = useState('');
  const profileHydratedRef = useRef(false);
  const isActionLockedRef = useRef(true);
  const persistInFlightRef = useRef(false);
  const queuedStoreRef = useRef(null);
  const lockActivationTimerRef = useRef(null);
  const unlockTimerRef = useRef(null);
  const lockStartedAtRef = useRef(Date.now());
  const latestPersistedJsonRef = useRef('');

  const setActionLock = useCallback((locked) => {
    isActionLockedRef.current = locked;
    setIsActionLocked(locked);
  }, []);

  const beginSaveLock = useCallback(() => {
    if (unlockTimerRef.current) {
      window.clearTimeout(unlockTimerRef.current);
      unlockTimerRef.current = null;
    }

    lockStartedAtRef.current = Date.now();

    if (!lockActivationTimerRef.current) {
      lockActivationTimerRef.current = window.setTimeout(() => {
        lockActivationTimerRef.current = null;
        setActionLock(true);
      }, 0);
    }
  }, [setActionLock]);

  const releaseSaveLockWhenReady = useCallback(() => {
    const elapsed = Date.now() - lockStartedAtRef.current;
    const waitMs = Math.max(0, SAVE_LOCK_MS - elapsed);

    if (unlockTimerRef.current) {
      window.clearTimeout(unlockTimerRef.current);
    }

    unlockTimerRef.current = window.setTimeout(() => {
      if (!persistInFlightRef.current && !queuedStoreRef.current) {
        setActionLock(false);
      }
    }, waitMs);
  }, [setActionLock]);

  const assertCanMutate = useCallback(() => {
    if (!profileHydratedRef.current || isActionLockedRef.current) {
      throw new Error(SAVE_LOCK_MESSAGE);
    }

    beginSaveLock();
  }, [beginSaveLock]);

  const flushSaveQueue = useCallback(async () => {
    if (persistInFlightRef.current) return;

    persistInFlightRef.current = true;

    try {
      while (queuedStoreRef.current) {
        const nextStore = coerceStoreShape(queuedStoreRef.current);
        queuedStoreRef.current = null;
        await saveStoreSettingsPatch({ deliveryBoardState: nextStore });
        latestPersistedJsonRef.current = JSON.stringify(nextStore);
        setSaveError('');
      }
    } catch (error) {
      const message = error?.message || 'Falha ao salvar Delivery Board no perfil da loja.';
      setSaveError(message);
      console.error('Falha ao salvar Delivery Board no perfil da loja', error);
    } finally {
      persistInFlightRef.current = false;

      if (queuedStoreRef.current) {
        void flushSaveQueue();
      } else {
        releaseSaveLockWhenReady();
      }
    }
  }, [releaseSaveLockWhenReady]);

  useEffect(() => {
    let canceled = false;

    void hydrateLocalSettingsFromStore()
      .then((settings) => {
        if (canceled) return;
        if (settings.deliveryBoardState && typeof settings.deliveryBoardState === 'object') {
          const nextStore = coerceStoreShape(settings.deliveryBoardState);
          latestPersistedJsonRef.current = JSON.stringify(nextStore);
          setStore(nextStore);
        }
      })
      .catch((error) => {
        console.warn('Usando entregas locais porque o perfil da loja nao carregou', error);
      })
      .finally(() => {
        if (!canceled) {
          profileHydratedRef.current = true;
          setActionLock(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [setActionLock, setStore]);

  useEffect(() => {
    if (!profileHydratedRef.current) return;
    const nextStore = coerceStoreShape(store);
    const nextJson = JSON.stringify(nextStore);
    if (nextJson === latestPersistedJsonRef.current) return;

    beginSaveLock();
    queuedStoreRef.current = nextStore;
    void flushSaveQueue();
  }, [beginSaveLock, flushSaveQueue, store]);

  useEffect(() => {
    return () => {
      if (lockActivationTimerRef.current) {
        window.clearTimeout(lockActivationTimerRef.current);
      }
      if (unlockTimerRef.current) {
        window.clearTimeout(unlockTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const hasData = (store?.motoboys?.length || store?.viagens?.length || store?.entregas?.length);
    if (hasData) return;

    try {
      const legacyRaw = window.localStorage.getItem('motoboys');
      if (!legacyRaw) return;
      const parsed = JSON.parse(legacyRaw);
      const migrated = migrateLegacyMotoboys(parsed);
      if (migrated) {
        setStore(migrated);
        window.localStorage.removeItem('motoboys');
      }
    } catch (err) {
      console.error('Erro ao migrar dados legados', err);
    }
  }, [setStore, store]);

  const addMotoboy = useCallback((nome) => {
    assertCanMutate();
    const motoboy = domain.createMotoboy(nome);
    setStore((prev) => domain.addMotoboyToStore(prev || emptyStore, motoboy));
    return motoboy;
  }, [assertCanMutate, setStore]);

  const removeMotoboy = useCallback((motoboyId, options = { cascade: false }) => {
    assertCanMutate();
    setStore((prev) => domain.removeMotoboy(prev || emptyStore, motoboyId, options));
  }, [assertCanMutate, setStore]);

  const openViagem = useCallback((motoboyId, opts = {}) => {
    assertCanMutate();
    let created = null;
    setStore((prev) => {
      const current = prev || emptyStore;
      const exists = (current.motoboys || []).some((m) => m.id === motoboyId);
      if (!exists) throw new Error('Motoboy nao encontrado');
      created = domain.createViagem(motoboyId, opts);
      return domain.addViagemToStore(current, created);
    });
    return created;
  }, [assertCanMutate, setStore]);

  const closeViagem = useCallback((viagemId, opts = {}) => {
    assertCanMutate();
    setStore((prev) => {
      const current = prev || emptyStore;
      const viagens = (current.viagens || []).map((v) => (v.id === viagemId ? domain.closeViagem(v, opts) : v));
      return { ...current, viagens };
    });
  }, [assertCanMutate, setStore]);

  const reopenViagem = useCallback((viagemId) => {
    assertCanMutate();
    setStore((prev) => {
      const current = prev || emptyStore;
      const viagens = (current.viagens || []).map((v) => (v.id === viagemId ? domain.reopenViagem(v) : v));
      return { ...current, viagens };
    });
  }, [assertCanMutate, setStore]);

  const addEntrega = useCallback((viagemId, numeroPedido, opts = {}) => {
    assertCanMutate();
    let created = null;
    setStore((prev) => {
      const current = prev || emptyStore;
      const viagem = (current.viagens || []).find((v) => v.id === viagemId);
      if (!viagem) throw new Error('Viagem nao encontrada');
      if (viagem.status !== 'aberta') throw new Error('Nao eh possivel adicionar entrega a uma viagem fechada');
      created = domain.createEntrega(viagemId, numeroPedido, opts);
      return domain.addEntregaToStore(current, created);
    });
    return created;
  }, [assertCanMutate, setStore]);

  const addEntregasBulk = useCallback((viagemId, pedidos = [], opts = {}) => {
    assertCanMutate();
    const created = [];
    setStore((prev) => {
      const current = prev || emptyStore;
      const viagem = (current.viagens || []).find((v) => v.id === viagemId);
      if (!viagem) throw new Error('Viagem nao encontrada');
      if (viagem.status !== 'aberta') throw new Error('Nao eh possivel adicionar entrega a uma viagem fechada');
      let updatedStore = { ...current };
      pedidos.forEach((numeroPedido) => {
        const entrega = domain.createEntrega(viagemId, numeroPedido, opts);
        created.push(entrega);
        updatedStore = domain.addEntregaToStore(updatedStore, entrega);
      });
      return updatedStore;
    });
    return created;
  }, [assertCanMutate, setStore]);

  const addEntregasDetailed = useCallback((viagemId, items = []) => {
    assertCanMutate();
    const created = [];
    setStore((prev) => {
      const current = prev || emptyStore;
      const viagem = (current.viagens || []).find((v) => v.id === viagemId);
      if (!viagem) throw new Error('Viagem nao encontrada');
      if (viagem.status !== 'aberta') throw new Error('Nao eh possivel adicionar entrega a uma viagem fechada');

      let updatedStore = { ...current };
      items.forEach((item) => {
        if (!item?.numeroPedido) return;
        const entrega = domain.createEntrega(viagemId, item.numeroPedido, item.opts || {});
        created.push(entrega);
        updatedStore = domain.addEntregaToStore(updatedStore, entrega);
      });

      return updatedStore;
    });
    return created;
  }, [assertCanMutate, setStore]);

  const removeViagem = useCallback((viagemId, options = { cascade: true }) => {
    assertCanMutate();
    setStore((prev) => domain.removeViagemFromStore(prev || emptyStore, viagemId, options));
  }, [assertCanMutate, setStore]);

  const updateEntrega = useCallback((entregaId, changes = {}) => {
    assertCanMutate();
    setStore((prev) => {
      const current = prev || emptyStore;
      return { ...current, entregas: domain.updateEntrega(current.entregas || [], entregaId, changes) };
    });
  }, [assertCanMutate, setStore]);

  const updateViagem = useCallback((viagemId, changes = {}) => {
    assertCanMutate();
    setStore((prev) => {
      const current = prev || emptyStore;
      return { ...current, viagens: domain.updateViagem(current.viagens || [], viagemId, changes) };
    });
  }, [assertCanMutate, setStore]);

  const moveEntrega = useCallback((entregaId, targetViagemId) => {
    assertCanMutate();
    setStore((prev) => {
      const current = prev || emptyStore;
      const viagemDestino = (current.viagens || []).find((v) => v.id === targetViagemId);
      if (!viagemDestino) throw new Error('Viagem destino nao encontrada');
      if (viagemDestino.status !== 'aberta') throw new Error('Nao eh possivel mover entrega para viagem fechada');
      return {
        ...current,
        entregas: domain.updateEntrega(current.entregas || [], entregaId, { viagemId: targetViagemId }),
      };
    });
  }, [assertCanMutate, setStore]);

  const setEntregaEntregue = useCallback((entregaId) => {
    assertCanMutate();
    setStore((prev) => {
      const current = prev || emptyStore;
      return { ...current, entregas: domain.updateEntregaStatus(current.entregas || [], entregaId, 'entregue') };
    });
  }, [assertCanMutate, setStore]);

  const removeEntrega = useCallback((entregaId) => {
    assertCanMutate();
    setStore((prev) => domain.removeEntregaFromStore(prev || emptyStore, entregaId));
  }, [assertCanMutate, setStore]);

  const findEntregas = useCallback((numeroPedido) => {
    return domain.findEntregasByNumero(store?.entregas || [], numeroPedido);
  }, [store?.entregas]);

  const clearStore = useCallback(() => {
    assertCanMutate();
    setStore({ ...emptyStore });
  }, [assertCanMutate, setStore]);

  const replaceStore = useCallback((incomingStore) => {
    assertCanMutate();
    setStore(() => coerceStoreShape(incomingStore));
  }, [assertCanMutate, setStore]);

  const reconcileHubOrders = useCallback((sharedOrders = []) => {
    if (isActionLockedRef.current) return;
    setStore((prev) => {
      const current = prev || emptyStore;
      const nextEntregas = reconcileEntregasWithSharedOrders(current.entregas || [], sharedOrders);

      if (nextEntregas === current.entregas) {
        return current;
      }

      return {
        ...current,
        entregas: nextEntregas,
      };
    });
  }, [setStore]);

  const getMotoboys = store?.motoboys || [];
  const getViagens = store?.viagens || [];
  const getEntregas = store?.entregas || [];

  return {
    // data
    motoboys: getMotoboys,
    viagens: getViagens,
    entregas: getEntregas,

    // actions
    addMotoboy,
    removeMotoboy,
    openViagem,
    closeViagem,
    reopenViagem,
    addEntrega,
    addEntregasBulk,
    addEntregasDetailed,
    removeViagem,
    updateEntrega,
    updateViagem,
    moveEntrega,
    setEntregaEntregue,
    removeEntrega,
    findEntregas,
    clearStore,
    replaceStore,
    reconcileHubOrders,

    // raw store access (if needed)
    store,
    setStore,
    isActionLocked,
    saveError,
  };
}

export default useDeliveryBoard;
