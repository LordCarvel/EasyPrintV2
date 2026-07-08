import { useCallback, useEffect, useRef } from 'react';
import { useLocalStorage } from './useLocalStorage';
import domain, { emptyStore } from '../core/domain';
import { reconcileEntregasWithSharedOrders } from '../utils/deliveryHub';
import { hydrateLocalSettingsFromStore, saveStoreSettingsPatch } from '../../../features/routing/storeSettingsClient';

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
  const profileHydratedRef = useRef(false);

  useEffect(() => {
    let canceled = false;

    void hydrateLocalSettingsFromStore()
      .then((settings) => {
        if (canceled) return;
        if (settings.deliveryBoardState && typeof settings.deliveryBoardState === 'object') {
          setStore(coerceStoreShape(settings.deliveryBoardState));
        }
      })
      .catch((error) => {
        console.warn('Usando entregas locais porque o perfil da loja nao carregou', error);
      })
      .finally(() => {
        if (!canceled) profileHydratedRef.current = true;
      });

    return () => {
      canceled = true;
    };
  }, [setStore]);

  useEffect(() => {
    if (!profileHydratedRef.current) return;

    void saveStoreSettingsPatch({
      deliveryBoardState: coerceStoreShape(store)
    }).catch((error) => {
      console.error('Falha ao salvar Delivery Board no perfil da loja', error);
    });
  }, [store]);

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
    const motoboy = domain.createMotoboy(nome);
    setStore((prev) => domain.addMotoboyToStore(prev || emptyStore, motoboy));
    return motoboy;
  }, [setStore]);

  const removeMotoboy = useCallback((motoboyId, options = { cascade: false }) => {
    setStore((prev) => domain.removeMotoboy(prev || emptyStore, motoboyId, options));
  }, [setStore]);

  const openViagem = useCallback((motoboyId, opts = {}) => {
    let created = null;
    setStore((prev) => {
      const current = prev || emptyStore;
      const exists = (current.motoboys || []).some((m) => m.id === motoboyId);
      if (!exists) throw new Error('Motoboy nao encontrado');
      created = domain.createViagem(motoboyId, opts);
      return domain.addViagemToStore(current, created);
    });
    return created;
  }, [setStore]);

  const closeViagem = useCallback((viagemId, opts = {}) => {
    setStore((prev) => {
      const current = prev || emptyStore;
      const viagens = (current.viagens || []).map((v) => (v.id === viagemId ? domain.closeViagem(v, opts) : v));
      return { ...current, viagens };
    });
  }, [setStore]);

  const reopenViagem = useCallback((viagemId) => {
    setStore((prev) => {
      const current = prev || emptyStore;
      const viagens = (current.viagens || []).map((v) => (v.id === viagemId ? domain.reopenViagem(v) : v));
      return { ...current, viagens };
    });
  }, [setStore]);

  const addEntrega = useCallback((viagemId, numeroPedido, opts = {}) => {
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
  }, [setStore]);

  const addEntregasBulk = useCallback((viagemId, pedidos = [], opts = {}) => {
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
  }, [setStore]);

  const addEntregasDetailed = useCallback((viagemId, items = []) => {
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
  }, [setStore]);

  const removeViagem = useCallback((viagemId, options = { cascade: true }) => {
    setStore((prev) => domain.removeViagemFromStore(prev || emptyStore, viagemId, options));
  }, [setStore]);

  const updateEntrega = useCallback((entregaId, changes = {}) => {
    setStore((prev) => {
      const current = prev || emptyStore;
      return { ...current, entregas: domain.updateEntrega(current.entregas || [], entregaId, changes) };
    });
  }, [setStore]);

  const updateViagem = useCallback((viagemId, changes = {}) => {
    setStore((prev) => {
      const current = prev || emptyStore;
      return { ...current, viagens: domain.updateViagem(current.viagens || [], viagemId, changes) };
    });
  }, [setStore]);

  const moveEntrega = useCallback((entregaId, targetViagemId) => {
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
  }, [setStore]);

  const setEntregaEntregue = useCallback((entregaId) => {
    setStore((prev) => {
      const current = prev || emptyStore;
      return { ...current, entregas: domain.updateEntregaStatus(current.entregas || [], entregaId, 'entregue') };
    });
  }, [setStore]);

  const removeEntrega = useCallback((entregaId) => {
    setStore((prev) => domain.removeEntregaFromStore(prev || emptyStore, entregaId));
  }, [setStore]);

  const findEntregas = useCallback((numeroPedido) => {
    return domain.findEntregasByNumero(store?.entregas || [], numeroPedido);
  }, [store?.entregas]);

  const clearStore = useCallback(() => setStore({ ...emptyStore }), [setStore]);

  const replaceStore = useCallback((incomingStore) => {
    setStore(() => coerceStoreShape(incomingStore));
  }, [setStore]);

  const reconcileHubOrders = useCallback((sharedOrders = []) => {
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
  };
}

export default useDeliveryBoard;
