import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import Footer from './components/footer/Footer';
import Header from './components/header/Header';
import RouteBar from './components/router/RouteBar';
import Controls from './components/controls/Controls';
import MotoboyContainer from './components/motoboy/MotoboyContainer';
import MotoboyCard from './components/motoboy/MotoboyCard';
import Leva from './components/leva/Leva';
import Pedido from './components/pedido/Pedido';
import AddMotoboyModal from './components/modals/AddMotoboy/AddMotoboyModal';
import AddLevaModal from './components/modals/AddLeva/AddLevaModal';
import EditPedidoModal from './components/modals/EditPedido/EditPedidoModal';
import HelpModal from './components/modals/Help/HelpModal';
import Tour from './components/tutorial/Tour';
import { useDeliveryBoard } from './hooks/useDeliveryBoard';
import { getWorkspaceId, setWorkspaceId, updateUrlWorkspace } from './utils/workspace';
import { useRoute } from './router/Router';
import { exportToJSON, importFromJSON } from './utils/fileOperations';
import { parsePedidos } from './utils/dataHelpers';
import { confirmAction, promptAction, showAppAlert } from '../../shared/ui/appDialog';
import {
  acknowledgeHubCommand,
  buildEntregaHubFields,
  buildWhatsappCommandUrl,
  findMatchingSharedOrder,
  flushDeliveryHubPendingEvents,
  getCachedHubCommands,
  getCachedSharedOrders,
  getDeliveryHubConfig,
  getOperationalDate,
  getPendingHubEvents,
  publishDeliveryRunDispatched,
  publishDeliveryRunReverted,
  saveDeliveryHubConfig,
  syncDeliveryHubState,
} from './utils/deliveryHub';

function formatShortTime(value) {
  if (!value) return '--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(value) {
  if (!value) return 'Ainda nao registrado';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR');
}

function normalizePedidoToken(value) {
  return String(value ?? '').trim().replace(/^#/, '');
}

function hasHubBinding(entrega) {
  return Boolean(
    entrega?.externalOrigin
    || entrega?.hubOrderId
    || entrega?.sourceApp
    || entrega?.sourceBranchId
    || entrega?.sourceBranchName
    || entrega?.sourceStoreName
  );
}

function buildHubPublishFeedback(result, entregasDaViagem = []) {
  if (!result) {
    return null;
  }

  const hubLinkedOrdersCount = entregasDaViagem.filter((entrega) => hasHubBinding(entrega)).length;
  const refreshHint = result.refreshError
    ? ` Ultima tentativa de atualizar pedidos do hub: ${result.refreshError}`
    : '';

  if (result.status === 'published') {
    return {
      tone: 'success',
      message: `Roda publicada no hub com ${result.matchedOrdersCount || 0} pedido(s).`,
      createdAt: new Date().toISOString(),
    };
  }

  if (result.status === 'queued') {
    const reason = result.reason === 'offline'
      ? 'Sem conexao com a internet.'
      : (result.error?.message || 'Falha ao publicar evento no hub.');

    return {
      tone: 'warning',
      message: `Viagem fechada localmente, mas o envio ao hub ficou na fila local. ${reason}${refreshHint}`,
      createdAt: new Date().toISOString(),
    };
  }

  if (result.status === 'skipped' && result.reason === 'no_hub_orders') {
    return {
      tone: 'warning',
      message: hubLinkedOrdersCount > 0
        ? `Viagem fechada localmente, mas o delivery-board nao conseguiu montar o despacho com os pedidos do hub desta roda.${refreshHint}`
        : `Viagem fechada localmente, mas nenhum pedido desta roda estava vinculado ao hub.${refreshHint}`,
      createdAt: new Date().toISOString(),
    };
  }

  return {
    tone: 'warning',
    message: `A publicacao da roda no hub nao foi concluida.${refreshHint}`,
    createdAt: new Date().toISOString(),
  };
}

function App() {
  const {
    motoboys,
    viagens,
    entregas,
    addMotoboy,
    removeMotoboy,
    openViagem,
    closeViagem,
    reopenViagem,
    removeViagem,
    addEntrega,
    addEntregasBulk,
    addEntregasDetailed,
    moveEntrega,
    updateEntrega,
    updateViagem,
    setEntregaEntregue,
    removeEntrega,
    findEntregas,
    clearStore,
    replaceStore,
    reconcileHubOrders,
    store,
  } = useDeliveryBoard();

  const [addMotoboyModalOpen, setAddMotoboyModalOpen] = useState(false);
  const [addLevaModalOpen, setAddLevaModalOpen] = useState(false);
  const [editPedidoModalOpen, setEditPedidoModalOpen] = useState(false);

  const [currentMotoboyId, setCurrentMotoboyId] = useState(null);
  const [currentEntregaId, setCurrentEntregaId] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIds, setHighlightedIds] = useState(new Set());
  const [hubConfig, setHubConfig] = useState(() => ({
    ...getDeliveryHubConfig(),
    enabled: false,
    projectId: ''
  }));
  const [hubSharedOrders, setHubSharedOrders] = useState([]);
  const [hubPendingCommands, setHubPendingCommands] = useState([]);
  const [hubLastSyncAt, setHubLastSyncAt] = useState('');
  const [hubLastError, setHubLastError] = useState('');
  const [isHubSyncing, setIsHubSyncing] = useState(false);
  const [hubPendingEvents, setHubPendingEvents] = useState([]);
  const [pendingHubEventsCount, setPendingHubEventsCount] = useState(0);
  const [hubPublishFeedback, setHubPublishFeedback] = useState(null);
  const hubSyncInFlightRef = useRef(false);

  const workspaceId = getWorkspaceId();
  const route = useRoute();
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpDismissed, setHelpDismissed] = useState(() => window.localStorage.getItem('helpDismissed') === '1');
  const [tourOpen, setTourOpen] = useState(false);
  const DEMO_NAME = 'Demo (exemplo)';

  const refreshPendingHubEvents = useCallback(() => {
    setHubPendingEvents([]);
    setPendingHubEventsCount(0);
  }, []);

  const syncHub = useCallback(async (overrideConfig) => {
    const currentConfig = overrideConfig || hubConfig;

    if (hubSyncInFlightRef.current) {
      refreshPendingHubEvents();
      return;
    }

    if (!currentConfig.enabled || !String(currentConfig.projectId || '').trim()) {
      setHubLastError('');
      setHubSharedOrders(getCachedSharedOrders());
      setHubPendingCommands(getCachedHubCommands());
      refreshPendingHubEvents();
      return;
    }

    hubSyncInFlightRef.current = true;
    setIsHubSyncing(true);

    try {
      await flushDeliveryHubPendingEvents(currentConfig);
      const snapshot = await syncDeliveryHubState(currentConfig);
      setHubSharedOrders(snapshot.sharedOrders || []);
      setHubPendingCommands(
        (snapshot.commands || []).filter((command) => command.command === 'create_whatsapp_dispatch_message')
      );
      setHubLastSyncAt(new Date().toISOString());
      setHubLastError(snapshot.errorMessage || '');
    } catch (error) {
      setHubLastError(error?.message || 'Falha ao sincronizar com o Hub');
    } finally {
      refreshPendingHubEvents();
      hubSyncInFlightRef.current = false;
      setIsHubSyncing(false);
    }
  }, [hubConfig, refreshPendingHubEvents]);

  useEffect(() => {
    setWorkspaceId(workspaceId);
  }, [workspaceId]);

  useEffect(() => {
    if (!route) return;

    if (route.name === 'workspace' && route.params?.workspaceId) {
      const workspace = route.params.workspaceId;
      setWorkspaceId(workspace);
      updateUrlWorkspace(workspace);
    }
  }, [route]);

  useEffect(() => {
    if (!helpDismissed) {
      setHelpOpen(true);
    }
  }, [helpDismissed]);

  useEffect(() => {
    reconcileHubOrders(hubSharedOrders);
  }, [entregas, hubSharedOrders, reconcileHubOrders]);

  useEffect(() => {
    if (!hubConfig.enabled || !String(hubConfig.projectId || '').trim()) {
      return undefined;
    }

    void syncHub(hubConfig);

    const timer = window.setInterval(() => {
      void syncHub(hubConfig);
    }, Number(hubConfig.pollIntervalSeconds || 20) * 1000);

    return () => window.clearInterval(timer);
  }, [hubConfig, syncHub]);

  useEffect(() => {
    const handleOnline = () => {
      void syncHub(hubConfig);
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [hubConfig, syncHub]);

  const ensureDemoMotoboy = useCallback(() => {
    let demo = motoboys.find((motoboy) => motoboy.nome === DEMO_NAME);
    if (!demo) demo = addMotoboy(DEMO_NAME);
    return demo;
  }, [motoboys, addMotoboy]);

  const ensureDemoViagem = useCallback(() => {
    const demo = ensureDemoMotoboy();
    let viagem = viagens.find((currentViagem) => currentViagem.motoboyId === demo.id);
    if (!viagem) viagem = openViagem(demo.id);
    if (viagem.status !== 'aberta') {
      reopenViagem(viagem.id);
      viagem = { ...viagem, status: 'aberta', dataHoraVolta: null };
    }
    return { demo, viagem };
  }, [ensureDemoMotoboy, viagens, openViagem, reopenViagem]);

  const ensureDemoEntrega = useCallback(() => {
    const { demo, viagem } = ensureDemoViagem();
    let entrega = entregas.find((currentEntrega) => currentEntrega.viagemId === viagem.id);
    if (!entrega) {
      const created = addEntregasBulk(viagem.id, ['101', '102', '103']);
      entrega = created[0];
    }
    return { demo, viagem, entrega };
  }, [ensureDemoViagem, entregas, addEntregasBulk]);

  const tourSteps = useMemo(() => ([
    {
      selector: '#searchInput',
      title: 'Buscar pedidos',
      description: 'Digite o numero do pedido para destacar todas as entregas com esse numero.',
    },
    {
      selector: '#addMotoboyBtn',
      title: 'Botao: adicionar motoboy',
      description: 'Use + Motoboy para registrar um entregador.',
    },
    {
      selector: '#motoboyName',
      title: 'Modal: novo motoboy',
      description: 'Preencha o nome e salve para criar o motoboy de exemplo.',
    },
    {
      selector: '.add-leva-btn',
      title: 'Botao: abrir viagem',
      description: 'No card do motoboy, clique em + Viagem para abrir uma rota.',
    },
    {
      selector: '#pedidosInput',
      title: 'Modal: abrir viagem',
      description: 'Adicione pedidos separados por linha ou virgula e salve.',
    },
    {
      selector: '[data-tour="add-entrega-input"]',
      title: 'Adicionar entregas',
      description: 'Digite pedidos separados por linha ou virgula para incluir varios de uma vez.',
    },
    {
      selector: '[data-tour="pedido-item"]',
      title: 'Editar entrega',
      description: 'Clique na entrega para mover, mudar status ou reabrir.',
    },
    {
      selector: '#helpBtn',
      title: 'Ajuda e tutorial',
      description: 'Reabra este tutorial ou o guia rapido sempre que precisar.',
    },
  ]), []);

  const handleTourStep = useCallback((stepIndex) => {
    try {
      if (stepIndex === 0 || stepIndex === 1) {
        setAddMotoboyModalOpen(false);
        setAddLevaModalOpen(false);
        setEditPedidoModalOpen(false);
      }
      if (stepIndex === 2) {
        const demo = ensureDemoMotoboy();
        setCurrentMotoboyId(demo.id);
        setAddMotoboyModalOpen(true);
      }
      if (stepIndex === 3) {
        const { demo } = ensureDemoViagem();
        setCurrentMotoboyId(demo.id);
        setAddMotoboyModalOpen(false);
        setEditPedidoModalOpen(false);
        setAddLevaModalOpen(false);
      }
      if (stepIndex === 4) {
        const { demo } = ensureDemoViagem();
        setCurrentMotoboyId(demo.id);
        setAddMotoboyModalOpen(false);
        setEditPedidoModalOpen(false);
        setAddLevaModalOpen(true);
      }
      if (stepIndex === 5) {
        const { demo } = ensureDemoViagem();
        setCurrentMotoboyId(demo.id);
        setAddLevaModalOpen(false);
      }
      if (stepIndex === 6) {
        const { entrega } = ensureDemoEntrega();
        setCurrentEntregaId(entrega.id);
        setEditPedidoModalOpen(true);
      }
      if (stepIndex === 7) {
        setHelpOpen(true);
      }
    } catch (error) {
      console.error('Erro ao preparar passo do tutorial', error);
    }
  }, [ensureDemoEntrega, ensureDemoMotoboy, ensureDemoViagem]);

  const viagemById = useMemo(() => new Map(viagens.map((viagem) => [viagem.id, viagem])), [viagens]);

  const motoboyEntregaStats = useMemo(() => {
    const stats = new Map();
    motoboys.forEach((motoboy) => stats.set(motoboy.id, { total: 0, entregues: 0 }));

    entregas.forEach((entrega) => {
      const viagem = viagemById.get(entrega.viagemId);
      if (!viagem) return;

      const motoboyId = viagem.motoboyId;
      if (!stats.has(motoboyId)) stats.set(motoboyId, { total: 0, entregues: 0 });
      const entry = stats.get(motoboyId);
      entry.total += 1;
      if (entrega.statusEntrega === 'entregue') entry.entregues += 1;
    });

    return stats;
  }, [motoboys, entregas, viagemById]);

  const viagensByMotoboy = useMemo(() => {
    const map = new Map();
    motoboys.forEach((motoboy) => map.set(motoboy.id, []));
    viagens.forEach((viagem) => {
      if (!map.has(viagem.motoboyId)) map.set(viagem.motoboyId, []);
      map.get(viagem.motoboyId).push(viagem);
    });
    map.forEach((list) => list.sort((a, b) => new Date(b.dataHoraSaida) - new Date(a.dataHoraSaida)));
    return map;
  }, [motoboys, viagens]);

  const entregasByViagem = useMemo(() => {
    const map = new Map();
    viagens.forEach((viagem) => map.set(viagem.id, []));
    entregas.forEach((entrega) => {
      const list = map.get(entrega.viagemId) || [];
      list.push(entrega);
      map.set(entrega.viagemId, list);
    });
    return map;
  }, [viagens, entregas]);

  const viagemOptions = useMemo(() => viagens.map((viagem) => {
    const motoboyName = motoboys.find((motoboy) => motoboy.id === viagem.motoboyId)?.nome || 'Motoboy';
    return { value: viagem.id, label: `${motoboyName} - ${formatShortTime(viagem.dataHoraSaida)} (${viagem.status})` };
  }), [viagens, motoboys]);

  const currentEntrega = useMemo(
    () => entregas.find((entrega) => entrega.id === currentEntregaId) || null,
    [entregas, currentEntregaId]
  );

  const hubSyncState = useMemo(() => ({
    isSyncing: isHubSyncing,
    lastSyncAt: hubLastSyncAt,
    lastError: hubLastError,
    sharedOrders: hubSharedOrders,
    pendingCommands: hubPendingCommands,
    pendingEvents: hubPendingEvents,
    pendingEventsCount: pendingHubEventsCount,
    publishFeedback: hubPublishFeedback,
  }), [
    hubLastError,
    hubLastSyncAt,
    hubPendingCommands,
    hubPendingEvents,
    hubPublishFeedback,
    hubSharedOrders,
    isHubSyncing,
    pendingHubEventsCount,
  ]);

  const buildHubOptsForPedido = useCallback((pedido) => {
    return {};
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setHighlightedIds(new Set());
      return;
    }

    const matches = findEntregas(searchQuery.trim());
    setHighlightedIds(new Set(matches.map((item) => item.id)));
  }, [searchQuery, findEntregas]);

  const filterContext = useMemo(() => {
    if (!searchQuery.trim() || highlightedIds.size === 0) return null;

    const viagemIds = new Set();
    const motoboyIds = new Set();

    highlightedIds.forEach((entregaId) => {
      const entrega = entregas.find((item) => item.id === entregaId);
      if (!entrega) return;

      viagemIds.add(entrega.viagemId);
      const viagem = viagemById.get(entrega.viagemId);
      if (viagem) motoboyIds.add(viagem.motoboyId);
    });

    return { viagemIds, motoboyIds };
  }, [searchQuery, highlightedIds, entregas, viagemById]);

  const handleAddMotoboy = ({ motoboyName }) => {
    try {
      addMotoboy(motoboyName);
      setAddMotoboyModalOpen(false);
    } catch (error) {
      void showAppAlert(error.message || 'Erro ao adicionar motoboy');
    }
  };

  const checkCancelados = async (pedidosList = []) => {
    const normalized = pedidosList.map(normalizePedidoToken);
    const cancelados = entregas.filter(
      (entrega) => normalized.includes(normalizePedidoToken(entrega.numeroPedido)) && entrega.statusEntrega === 'cancelado'
    );

    if (!cancelados.length) return true;

    const lista = cancelados.map((entrega) => `#${normalizePedidoToken(entrega.numeroPedido)}`).join(', ');
    return confirmAction(`Pedidos ${lista} estao marcados como cancelados. Deseja continuar?`, {
      title: 'Pedidos cancelados',
      confirmLabel: 'Continuar',
    });
  };

  const addPedidosToViagem = async (viagemId, pedidosList = []) => {
    if (!pedidosList.length) return;
    if (!(await checkCancelados(pedidosList))) return;

    try {
      const items = pedidosList
        .map((pedido) => normalizePedidoToken(pedido))
        .filter(Boolean)
        .map((numeroPedido) => ({
          numeroPedido,
          opts: buildHubOptsForPedido(numeroPedido),
        }));

      if (!items.length) return;

      if (items.length === 1) {
        addEntrega(viagemId, items[0].numeroPedido, items[0].opts);
      } else {
        addEntregasDetailed(viagemId, items);
      }
    } catch (error) {
      void showAppAlert(error.message || 'Erro ao adicionar entrega');
    }
  };

  const handleAddLeva = async ({ pedidos = [] }) => {
    if (!currentMotoboyId) {
      void showAppAlert('Selecione um motoboy antes de abrir uma viagem');
      return;
    }

    if (!pedidos.length) {
      void showAppAlert('Informe ao menos um pedido');
      return;
    }

    if (!(await checkCancelados(pedidos))) return;

    try {
      const motoboyExiste = motoboys.find((motoboy) => motoboy.id === currentMotoboyId);
      if (!motoboyExiste) throw new Error('Motoboy nao encontrado');

      const viagem = openViagem(currentMotoboyId);
      if (!viagem?.id) throw new Error('Falha ao criar viagem');

      await addPedidosToViagem(viagem.id, pedidos);
      setAddLevaModalOpen(false);
      setCurrentMotoboyId(null);
    } catch (error) {
      void showAppAlert(error.message || 'Erro ao criar viagem');
    }
  };

  const handleAddEntregaToViagem = (viagemId, value) => {
    const pedidos = Array.isArray(value) ? value : parsePedidos(String(value || ''));
    void addPedidosToViagem(viagemId, pedidos);
  };

  const handleDeleteViagem = async (viagemId) => {
    if (!(await confirmAction('Excluir esta viagem e suas entregas?'))) return;
    removeViagem(viagemId, { cascade: true });
  };

  const handleCloseViagem = async (viagemId) => {
    closeViagem(viagemId);
  };

  const handleReopenViagem = async (viagemId) => {
    reopenViagem(viagemId);
  };

  const handleDeleteMotoboy = async (motoboyId) => {
    if (!(await confirmAction('Excluir este motoboy e todas as suas viagens?'))) return;
    removeMotoboy(motoboyId, { cascade: true });
  };

  const handleEditEntrega = (data) => {
    if (!currentEntregaId) return;

    if (data.action === 'delete') {
      removeEntrega(currentEntregaId);
      setEditPedidoModalOpen(false);
      setCurrentEntregaId(null);
      return;
    }

    const entregaAlvo = entregas.find((entrega) => entrega.id === currentEntregaId);
    if (!entregaAlvo) return;

    try {
      if (data.targetViagemId && data.targetViagemId !== entregaAlvo.viagemId) {
        moveEntrega(currentEntregaId, data.targetViagemId);
      }

      const updates = {};

      if (data.numeroPedido && normalizePedidoToken(data.numeroPedido) !== normalizePedidoToken(entregaAlvo.numeroPedido)) {
        updates.numeroPedido = normalizePedidoToken(data.numeroPedido);
        Object.assign(updates, buildHubOptsForPedido(data.numeroPedido));
      }

      if (data.statusEntrega === 'entregue') {
        setEntregaEntregue(currentEntregaId);
      } else if (data.statusEntrega && data.statusEntrega !== entregaAlvo.statusEntrega) {
        updates.statusEntrega = data.statusEntrega;
      }

      if (Object.keys(updates).length) {
        updateEntrega(currentEntregaId, updates);
      }

      setEditPedidoModalOpen(false);
      setCurrentEntregaId(null);
    } catch (error) {
      void showAppAlert(error.message || 'Erro ao editar entrega');
    }
  };

  const handleReopenEntrega = (entregaId) => {
    if (!entregaId) return;
    updateEntrega(entregaId, { statusEntrega: 'pendente' });
  };

  const handleSearch = (value) => {
    setSearchQuery(value);
  };

  const handleClearAll = async () => {
    if (!(await confirmAction('Apagar todos os dados deste workspace?'))) return;
    clearStore();
    localStorage.removeItem('deliveryBoardV2');
    localStorage.removeItem('motoboys');
    setSearchQuery('');
    setHighlightedIds(new Set());
  };

  const handleSetWorkspace = (newWorkspace) => {
    if (!newWorkspace.trim()) return;
    setWorkspaceId(newWorkspace);
    updateUrlWorkspace(newWorkspace);
  };

  const handleExport = () => {
    exportToJSON(store, workspaceId);
  };

  const handleImport = async (file) => {
    const result = await importFromJSON(file);
    if (result.success) {
      replaceStore(result.data);
      setHighlightedIds(new Set());
      setSearchQuery('');
      void showAppAlert('Importacao concluida');
    } else {
      void showAppAlert(`Falha ao importar: ${result.error}`, { tone: 'danger' });
    }
  };

  const handleSaveHubConfig = (value) => {
    const saved = saveDeliveryHubConfig(value);
    setHubConfig(saved);
    refreshPendingHubEvents();

    if (saved.enabled && String(saved.projectId || '').trim()) {
      void syncHub(saved);
    } else {
      setHubLastError('');
    }
  };

  const handleAcknowledgeHubCommand = async (command) => {
    if (!command?.id) return;

    try {
      await acknowledgeHubCommand(hubConfig, command.id);
      setHubPendingCommands((prev) => prev.filter((item) => item.id !== command.id));
      setHubLastError('');
    } catch (error) {
      setHubLastError(error?.message || 'Falha ao confirmar comando');
    }
  };

  const handleCopyHubCommand = async (command) => {
    const text = String(command?.payload?.messageText || '').trim();

    if (!text) {
      void showAppAlert('Esse comando nao trouxe mensagem para copiar.');
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        await promptAction('Copie a mensagem abaixo:', text);
      }
      await handleAcknowledgeHubCommand(command);
    } catch {
      await promptAction('Copie a mensagem abaixo:', text);
    }
  };

  const handleOpenWhatsappCommand = async (command) => {
    const url = buildWhatsappCommandUrl(command);

    if (!url) {
      void showAppAlert('Esse comando nao possui numero configurado no Hub.');
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
    await handleAcknowledgeHubCommand(command);
  };

  const hasSearch = Boolean(searchQuery.trim());
  const hasResults = highlightedIds.size > 0;
  const shouldFilter = hasSearch && hasResults && filterContext;

  const motoboysToRender = useMemo(() => {
    if (!shouldFilter || !filterContext) return motoboys;
    return motoboys.filter((motoboy) => filterContext.motoboyIds.has(motoboy.id));
  }, [motoboys, shouldFilter, filterContext]);

  const renderMotoboys = () => {
    if (!motoboysToRender.length) {
      return (
        <p style={{ textAlign: 'center', color: 'gray', padding: '1rem' }}>
          {hasSearch && !hasResults ? 'Nenhuma entrega encontrada para esta busca.' : 'Nenhum motoboy registrado.'}
        </p>
      );
    }

    return motoboysToRender.map((motoboy) => {
      const viagensDoMotoboy = viagensByMotoboy.get(motoboy.id) || [];
      const viagensParaRender = shouldFilter && filterContext
        ? viagensDoMotoboy.filter((viagem) => filterContext.viagemIds.has(viagem.id))
        : viagensDoMotoboy;

      if (shouldFilter && filterContext && viagensParaRender.length === 0) {
        return null;
      }

      return (
        <MotoboyCard
          key={motoboy.id}
          motoboy={motoboy}
          stats={motoboyEntregaStats.get(motoboy.id)}
          onAddViagem={() => {
            setCurrentMotoboyId(motoboy.id);
            setAddLevaModalOpen(true);
          }}
          onDeleteMotoboy={() => handleDeleteMotoboy(motoboy.id)}
        >
          {viagensParaRender.length === 0 && (
            <p style={{ color: '#777', fontSize: '0.9rem' }}>Nenhuma viagem registrada.</p>
          )}

          {viagensParaRender.map((viagem) => {
            const entregasDaViagem = entregasByViagem.get(viagem.id) || [];
            const entregasParaRender = shouldFilter && filterContext
              ? entregasDaViagem.filter((entrega) => highlightedIds.has(entrega.id))
              : entregasDaViagem;

            return (
              <Leva
                key={viagem.id}
                viagem={viagem}
                onAddEntrega={(numeroPedido) => handleAddEntregaToViagem(viagem.id, numeroPedido)}
                onAddEntregas={(lista) => handleAddEntregaToViagem(viagem.id, lista)}
                onClose={() => {
                  void handleCloseViagem(viagem.id);
                }}
                onReopen={() => {
                  void handleReopenViagem(viagem.id);
                }}
                onDelete={() => handleDeleteViagem(viagem.id)}
              >
                {entregasParaRender.map((entrega) => (
                  <Pedido
                    key={entrega.id}
                    numeroPedido={entrega.numeroPedido}
                    statusEntrega={entrega.statusEntrega}
                    highlighted={highlightedIds.has(entrega.id)}
                    externalOrigin={Boolean(entrega.externalOrigin)}
                    originLabel={entrega.sourceBranchName || entrega.sourceStoreName || ''}
                    onClick={() => {
                      setCurrentEntregaId(entrega.id);
                      setEditPedidoModalOpen(true);
                    }}
                    onReopen={() => handleReopenEntrega(entrega.id)}
                  />
                ))}

                {entregasParaRender.length === 0 && (
                  <p style={{ color: '#777', fontSize: '0.85rem', padding: '0.3rem 0' }}>
                    Nenhuma entrega nesta viagem.
                  </p>
                )}
              </Leva>
            );
          })}
        </MotoboyCard>
      );
    });
  };

  return (
    <div className="body">
      <Header />
      <main className="main-content">
        <RouteBar />
        <Controls
          searchValue={searchQuery}
          onSearch={handleSearch}
          onAddMotoboy={() => setAddMotoboyModalOpen(true)}
          onClearAll={handleClearAll}
          onSetWorkspace={handleSetWorkspace}
          onExport={handleExport}
          onImport={handleImport}
          activeFilter={hasSearch}
          onOpenHelp={() => setHelpOpen(true)}
          onStartTour={() => {
            setTourOpen(true);
          }}
      />
        <MotoboyContainer>
          {renderMotoboys()}
        </MotoboyContainer>
      </main>
      <Footer />

      <AddMotoboyModal
        isOpen={addMotoboyModalOpen}
        onClose={() => setAddMotoboyModalOpen(false)}
        onSubmit={handleAddMotoboy}
      />
      <AddLevaModal
        key={`${addLevaModalOpen ? 'open' : 'closed'}:${currentMotoboyId || 'none'}`}
        isOpen={addLevaModalOpen}
        onClose={() => setAddLevaModalOpen(false)}
        onSubmit={handleAddLeva}
        title="Abrir viagem"
        canceladosLookup={(pedidosList) => entregas
          .filter((entrega) =>
            pedidosList.map(normalizePedidoToken).includes(normalizePedidoToken(entrega.numeroPedido))
            && entrega.statusEntrega === 'cancelado')
          .map((entrega) => normalizePedidoToken(entrega.numeroPedido))}
      />
      <EditPedidoModal
        isOpen={editPedidoModalOpen}
        onClose={() => setEditPedidoModalOpen(false)}
        onSubmit={handleEditEntrega}
        entrega={currentEntrega}
        viagemOptions={viagemOptions}
      />
      <HelpModal
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
        onDontShow={() => {
          window.localStorage.setItem('helpDismissed', '1');
          setHelpDismissed(true);
          setHelpOpen(false);
        }}
      />
      <Tour
        key={tourOpen ? 'tour-open' : 'tour-closed'}
        isOpen={tourOpen}
        steps={tourSteps}
        onClose={() => {
          setTourOpen(false);
          setAddMotoboyModalOpen(false);
          setAddLevaModalOpen(false);
          setEditPedidoModalOpen(false);
        }}
        onStepChange={handleTourStep}
      />
    </div>
  );
}

export default App;
