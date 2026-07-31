import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './shared/ui/Icon';
import { StoreProfileProvider, useStoreProfile } from './shared/storeProfile/StoreProfileContext';
import { LOCAL_DATA_MODE, routingApi } from './features/routing/routingApi';
import { isResentOrder, printRoutedOrderText } from './features/routing/directOrderPrint';
import { showAppAlert } from './shared/ui/appDialog';
import './App.css';
import './shared/ui/appDialog.css';

const projects = [
  {
    id: 'easy-print',
    name: 'Easy Print',
    shortName: 'EP',
    description: 'Impressao e caixa',
    defaultHash: '#/',
    load: () => import('./EasyPrintApp.jsx'),
  },
  {
    id: 'delivery-board',
    name: 'Delivery Board',
    shortName: 'DB',
    description: 'Entregas e motoboys',
    defaultHash: '#/',
    load: () => import('./apps/delivery-board/EmbeddedApp.jsx'),
  },
  {
    id: 'finally-storage',
    name: 'Finally Storage',
    shortName: 'FS',
    description: 'Fechamento e taxas',
    defaultHash: '#/funcoes',
    load: () => import('./apps/finally-storage/EmbeddedApp.jsx'),
  },
];

const projectById = new Map(projects.map((project) => [project.id, project]));
const activeProjectKey = 'easyprintv2.activeProject';
const sidebarCollapsedKey = 'easyprintv2.sidebarCollapsed';

function getRequestedProjectId() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('project');
  const fromStorage = window.localStorage.getItem(activeProjectKey);

  if (projectById.has(fromUrl)) return fromUrl;
  if (projectById.has(fromStorage)) return fromStorage;
  return 'easy-print';
}

function getProjectHashKey(projectId) {
  return `easyprintv2.projectHash.${projectId}`;
}

function getInitialSidebarCollapsed() {
  return window.localStorage.getItem(sidebarCollapsedKey) === '1';
}

function getStoreInitials(store) {
  const source = String(store?.name || store?.username || 'Loja').trim();
  const words = source.split(/\s+/).filter(Boolean);
  const initials = words.length > 1
    ? `${words[0][0] || ''}${words[1][0] || ''}`
    : source.slice(0, 2);

  return initials.toUpperCase() || 'LJ';
}

const areaTextToInput = (value = []) => Array.isArray(value) ? value.join(', ') : String(value || '');
const RECEIVED_ORDER_POLL_INTERVAL_MS = 15000;
const RECEIVED_ORDER_TOAST_MS = 6500;
const AUTO_PRINT_JOB_DELAY_MS = 1200;

const getOrderNumber = (order = {}) =>
  String(order.orderNumber || order.parsedData?.orderNumber || order.parsedData?.locator || 'Pedido').trim();

const updateStatusLabels = {
  idle: 'Pronto',
  checking: 'Verificando',
  available: 'Disponivel',
  downloading: 'Baixando',
  downloaded: 'Pronta',
  installing: 'Instalando',
  'not-available': 'Atualizado',
  unsupported: 'Indisponivel',
  error: 'Erro',
};

const getUpdateStatusLabel = (status = 'idle') => updateStatusLabels[status] || 'Pronto';

const playReceivedOrderSound = () => {
  try {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;

    const audioContext = new AudioContextCtor();
    const now = audioContext.currentTime;
    const tones = [
      { frequency: 880, offset: 0 },
      { frequency: 660, offset: 0.22 }
    ];

    tones.forEach((tone) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const startAt = now + tone.offset;
      const stopAt = startAt + 0.16;

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(tone.frequency, startAt);
      gain.gain.setValueAtTime(0.001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.22, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, stopAt);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(startAt);
      oscillator.stop(stopAt);
    });

    window.setTimeout(() => {
      audioContext.close().catch(() => {});
    }, 800);
  } catch (error) {
    console.warn('Nao foi possivel tocar o aviso de pedido recebido', error);
  }
};

const delay = (ms) => new Promise((resolve) => {
  window.setTimeout(resolve, ms);
});

function ReceivedOrderMonitor() {
  const { store } = useStoreProfile();
  const [notice, setNotice] = useState(null);
  const seenOrderIdsRef = useRef(new Set());
  const queuedPrintIdsRef = useRef(new Set());
  const pollCursorRef = useRef('');
  const hydratedRef = useRef(false);
  const noticeTimerRef = useRef(null);

  useEffect(() => {
    seenOrderIdsRef.current = new Set();
    queuedPrintIdsRef.current = new Set();
    pollCursorRef.current = '';
    hydratedRef.current = false;
    setNotice(null);
  }, [store?.id]);

  useEffect(() => {
    if (!store?.id) return undefined;

    let stopped = false;

    const showNotice = (orders) => {
      const firstOrder = orders[0] || {};
      const orderNumber = getOrderNumber(firstOrder);
      const sourceName = firstOrder.sourceStoreName || 'Outra filial';
      const title = orders.length === 1 ? 'Pedido novo recebido' : `${orders.length} pedidos novos recebidos`;
      const detail = orders.length === 1
        ? `#${orderNumber} de ${sourceName}`
        : `Primeiro: #${orderNumber} de ${sourceName}`;

      setNotice({
        title,
        detail,
        autoPrint: Boolean(store.autoPrint)
      });

      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
      }

      noticeTimerRef.current = window.setTimeout(() => {
        setNotice(null);
      }, RECEIVED_ORDER_TOAST_MS);
    };

    const autoPrintReceivedOrders = async (orders) => {
      if (!store.autoPrint) return;

      const printableOrders = orders.filter((order) => (
        order?.id &&
        order.rawText &&
        order.status !== 'impresso' &&
        order.status !== 'cancelado' &&
        !queuedPrintIdsRef.current.has(order.id)
      ));

      if (!printableOrders.length) return;

      printableOrders.forEach((order) => queuedPrintIdsRef.current.add(order.id));
      const results = await Promise.allSettled(
        printableOrders.map((order) => routingApi.markPrinted(order.id, order.version))
      );
      const acceptedOrders = results
        .map((result, index) => {
          if (result.status === 'fulfilled') return printableOrders[index];
          queuedPrintIdsRef.current.delete(printableOrders[index].id);
          return null;
        })
        .filter(Boolean);

      if (!acceptedOrders.length) return;

      for (let index = 0; index < acceptedOrders.length; index += 1) {
        const order = acceptedOrders[index];
        try {
          await printRoutedOrderText(order.rawText, {
            skipCash: isResentOrder(order)
          });
        } catch (error) {
          console.error('Falha na impressao automatica do pedido recebido', error);
          void showAppAlert(error.message || 'Falha na impressao automatica do pedido recebido.', { tone: 'danger' });
        }

        if (index < acceptedOrders.length - 1) {
          await delay(AUTO_PRINT_JOB_DELAY_MS);
        }
      }
    };

    const pollReceivedOrders = async () => {
      try {
        const payload = await routingApi.listReceivedOrders({
          updatedAfter: pollCursorRef.current
        });
        if (stopped) return;
        pollCursorRef.current = payload.cursor || pollCursorRef.current;

        const orders = payload.orders || [];
        window.dispatchEvent(new CustomEvent('easyhubReceivedOrdersUpdated', {
          detail: { orders, incremental: Boolean(payload.incremental) }
        }));

        if (!hydratedRef.current) {
          orders.forEach((order) => {
            if (order?.id) seenOrderIdsRef.current.add(order.id);
          });
          hydratedRef.current = true;
          return;
        }

        const incomingOrders = orders.filter((order) => (
          order?.id &&
          !seenOrderIdsRef.current.has(order.id) &&
          order.status !== 'cancelado'
        ));

        incomingOrders.forEach((order) => seenOrderIdsRef.current.add(order.id));

        if (!incomingOrders.length) return;

        playReceivedOrderSound();
        showNotice(incomingOrders);
        await autoPrintReceivedOrders(incomingOrders);
      } catch (error) {
        console.warn('Falha ao monitorar pedidos recebidos', error);
      }
    };

    void pollReceivedOrders();
    const timer = window.setInterval(() => {
      void pollReceivedOrders();
    }, RECEIVED_ORDER_POLL_INTERVAL_MS);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, [store?.autoPrint, store?.id]);

  if (!notice) return null;

  return (
    <div className="received-order-toast" role="status" aria-live="polite">
      <strong>{notice.title}</strong>
      <span>{notice.detail}</span>
      <small>{notice.autoPrint ? 'Impressao automatica acionada.' : 'Abra a fila recebida para imprimir.'}</small>
    </div>
  );
}

function ProjectHub() {
  const activeProjectId = getRequestedProjectId();
  const activeProject = projectById.get(activeProjectId) || projects[0];
  const ActiveProject = useMemo(() => lazy(activeProject.load), [activeProject]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(getInitialSidebarCollapsed);
  const { store, reloadProfile, logout } = useStoreProfile();
  const [accountOpen, setAccountOpen] = useState(false);
  const [appInfo, setAppInfo] = useState({ version: '', isPackaged: false, updateSupported: false });
  const [updateStatus, setUpdateStatus] = useState({
    status: 'idle',
    appVersion: '',
    availableVersion: '',
    percent: 0,
    message: '',
    supported: false,
  });
  const [updateBusy, setUpdateBusy] = useState('');
  const [accountForm, setAccountForm] = useState({
    name: '',
    username: '',
    password: '',
    city: '',
    serviceAreas: '',
    reviewAreas: '',
    receivesOrders: true,
    autoPrint: false
  });
  const storeMeta = [
    store?.username ? `Usuario: ${store.username}` : '',
    store?.city || ''
  ].filter(Boolean).join(' | ') || 'Perfil geral da loja';

  useEffect(() => {
    setAccountForm({
      name: store?.name || '',
      username: store?.username || '',
      password: '',
      city: store?.city || '',
      serviceAreas: areaTextToInput(store?.serviceAreas),
      reviewAreas: areaTextToInput(store?.reviewAreas),
      receivesOrders: store?.receivesOrders !== false,
      autoPrint: Boolean(store?.autoPrint)
    });
  }, [store]);

  useEffect(() => {
    const desktop = window.easyHubDesktop;
    let canceled = false;
    let unsubscribe = () => {};

    if (!desktop?.updates) return unsubscribe;

    if (typeof desktop.getAppInfo === 'function') {
      desktop.getAppInfo()
        .then((info) => {
          if (!canceled && info) setAppInfo(info);
        })
        .catch((error) => {
          console.warn('Falha ao ler versao do app', error);
        });
    }

    desktop.updates.getStatus()
      .then((status) => {
        if (!canceled && status) setUpdateStatus(status);
      })
      .catch((error) => {
        console.warn('Falha ao ler status de atualizacao', error);
      });

    unsubscribe = desktop.updates.onStatus((status) => {
      if (!canceled && status) setUpdateStatus(status);
    });

    return () => {
      canceled = true;
      unsubscribe();
    };
  }, []);

  const handleProjectChange = (nextProjectId) => {
    if (nextProjectId === activeProject.id) return;

    const nextProject = projectById.get(nextProjectId);
    if (!nextProject) return;

    window.localStorage.setItem(activeProjectKey, nextProject.id);
    window.localStorage.setItem(getProjectHashKey(activeProject.id), window.location.hash || activeProject.defaultHash);

    const nextHash = window.localStorage.getItem(getProjectHashKey(nextProject.id)) || nextProject.defaultHash;
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('project', nextProject.id);
    nextUrl.hash = nextHash.replace(/^#/, '');

    window.location.assign(nextUrl.toString());
  };

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((currentValue) => {
      const nextValue = !currentValue;
      window.localStorage.setItem(sidebarCollapsedKey, nextValue ? '1' : '0');
      return nextValue;
    });
  };

  const handleSaveAccount = async (event) => {
    event.preventDefault();

    if (!accountForm.name.trim()) {
      void showAppAlert('Informe o nome da loja.');
      return;
    }

    try {
      await routingApi.saveMyStore(accountForm);
      await reloadProfile();
      setAccountOpen(false);
      void showAppAlert('Configuracoes da conta salvas.');
    } catch (error) {
      void showAppAlert(error.message || 'Falha ao salvar a conta.', { tone: 'danger' });
    }
  };

  const runUpdateAction = async (actionName) => {
    const updates = window.easyHubDesktop?.updates;
    const action = updates?.[actionName];

    if (typeof action !== 'function') {
      void showAppAlert('Atualizacoes automaticas estao disponiveis apenas no app instalado.', { tone: 'danger' });
      return;
    }

    setUpdateBusy(actionName);

    try {
      const nextStatus = await action();
      if (nextStatus) setUpdateStatus(nextStatus);
      if (actionName === 'check' && nextStatus?.status === 'not-available') {
        void showAppAlert('O app ja esta na versao mais recente.');
      }
    } catch (error) {
      void showAppAlert(error.message || 'Falha ao executar atualizacao.', { tone: 'danger' });
    } finally {
      setUpdateBusy('');
    }
  };

  const updateProgress = Math.round(Number(updateStatus.percent || 0));
  const updateSupported = Boolean(updateStatus.supported || appInfo.updateSupported);
  const updateCurrentVersion = appInfo.version || updateStatus.appVersion || '-';
  const canCheckUpdate = updateSupported && !updateBusy && updateStatus.status !== 'checking' && updateStatus.status !== 'downloading' && updateStatus.status !== 'installing';
  const canDownloadUpdate = updateSupported && !updateBusy && updateStatus.status === 'available';
  const canInstallUpdate = updateSupported && !updateBusy && updateStatus.status === 'downloaded';

  return (
    <div className={`project-hub ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <ReceivedOrderMonitor />
      <aside className="project-sidebar" aria-label="Projetos">
        <div className="project-sidebar-top">
          <button
            type="button"
            className="project-brand"
            title={`${store?.name || 'Loja'} - ${storeMeta}`}
            onClick={() => setAccountOpen(true)}
            aria-label="Abrir configuracoes da conta da loja"
          >
            <span className="project-brand-mark">{getStoreInitials(store)}</span>
            <div className="project-brand-copy">
              <strong>{store?.name || 'Loja'}</strong>
              <span>{storeMeta}</span>
            </div>
          </button>

          <button
            type="button"
            className="project-sidebar-toggle"
            onClick={handleToggleSidebar}
            title={isSidebarCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
            aria-label={isSidebarCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
            aria-expanded={!isSidebarCollapsed}
          >
            <Icon name="arrowLeft" size={16} />
          </button>
        </div>

        <nav className="project-nav">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              className={`project-nav-button ${project.id === activeProject.id ? 'active' : ''}`}
              onClick={() => handleProjectChange(project.id)}
              title={project.name}
              aria-current={project.id === activeProject.id ? 'page' : undefined}
            >
              <span className="project-nav-initial">{project.shortName}</span>
              <span className="project-nav-copy">
                <span>{project.name}</span>
                <small>{project.description}</small>
              </span>
            </button>
          ))}
        </nav>

        <div className="project-sidebar-footer">
          <span>Projeto ativo</span>
          <strong>{activeProject.name}</strong>
          <small>{LOCAL_DATA_MODE ? 'Dados salvos neste computador' : 'Perfil geral sincronizado'}</small>
          <button type="button" onClick={() => setAccountOpen(true)}>
            Atualizar app
          </button>
          <button type="button" onClick={logout}>
            Trocar loja
          </button>
        </div>
      </aside>

      <main className="project-stage">
        <Suspense
          fallback={(
            <div className="project-loading">
              <span>Carregando {activeProject.name}...</span>
            </div>
          )}
        >
          <ActiveProject />
        </Suspense>
      </main>

      {accountOpen ? (
        <div className="account-modal-backdrop" onClick={() => setAccountOpen(false)}>
          <form className="account-modal" onSubmit={handleSaveAccount} onClick={(event) => event.stopPropagation()}>
            <div className="account-modal-header">
              <div>
                <h2>Conta da loja</h2>
                <p>
                  {LOCAL_DATA_MODE
                    ? 'Modo local: estas informacoes ficam somente neste computador.'
                    : 'Essas informacoes valem para Easy Print, Delivery Board e Finally Storage.'}
                </p>
              </div>
              <button type="button" onClick={() => setAccountOpen(false)} aria-label="Fechar configuracoes da conta">
                <Icon name="close" size={16} />
              </button>
            </div>

            <div className="account-form-grid">
              <label className="account-field">
                <span>Nome da loja</span>
                <input
                  value={accountForm.name}
                  onChange={(event) => setAccountForm((current) => ({ ...current, name: event.target.value }))}
                />
              </label>

              <label className="account-field">
                <span>Usuario</span>
                <input
                  value={accountForm.username}
                  onChange={(event) => setAccountForm((current) => ({ ...current, username: event.target.value }))}
                />
              </label>

              <label className="account-field">
                <span>Nova senha</span>
                <input
                  type="password"
                  value={accountForm.password}
                  placeholder="Deixe em branco para manter"
                  onChange={(event) => setAccountForm((current) => ({ ...current, password: event.target.value }))}
                />
              </label>

              <label className="account-field">
                <span>Cidade / regiao</span>
                <input
                  value={accountForm.city}
                  onChange={(event) => setAccountForm((current) => ({ ...current, city: event.target.value }))}
                />
              </label>
            </div>

            <label className="account-field">
              <span>Areas atendidas</span>
              <textarea
                value={accountForm.serviceAreas}
                onChange={(event) => setAccountForm((current) => ({ ...current, serviceAreas: event.target.value }))}
                placeholder="Separe por virgula. Ex.: Armacao Penha, Centro Penha"
              />
            </label>

            <label className="account-field">
              <span>Areas que pedem confirmacao</span>
              <textarea
                value={accountForm.reviewAreas}
                onChange={(event) => setAccountForm((current) => ({ ...current, reviewAreas: event.target.value }))}
                placeholder="Ex.: Santa Lidia, Meia Praia"
              />
            </label>

            <label className="account-check">
              <input
                type="checkbox"
                checked={accountForm.receivesOrders}
                onChange={(event) => setAccountForm((current) => ({ ...current, receivesOrders: event.target.checked }))}
              />
              <span>Esta loja recebe pedidos roteados</span>
            </label>

            <label className="account-check">
              <input
                type="checkbox"
                checked={accountForm.autoPrint}
                onChange={(event) => setAccountForm((current) => ({ ...current, autoPrint: event.target.checked }))}
              />
              <span>Imprimir automaticamente pedidos recebidos nesta loja</span>
            </label>

            <section className="account-update-panel" aria-live="polite">
              <div className="account-update-header">
                <div>
                  <strong>Atualizacoes do app</strong>
                  <span>Versao instalada: {updateCurrentVersion}</span>
                </div>
                <span className={`account-update-badge status-${updateStatus.status || 'idle'}`}>
                  {getUpdateStatusLabel(updateStatus.status)}
                </span>
              </div>

              <p>
                {updateStatus.message || (updateSupported
                  ? 'Nenhuma verificacao recente.'
                  : 'Disponivel apenas no app instalado.')}
              </p>

              {updateStatus.availableVersion ? (
                <small>Nova versao: {updateStatus.availableVersion}</small>
              ) : null}

              {updateStatus.status === 'downloading' ? (
                <div className="account-update-progress" aria-label={`Baixando ${updateProgress}%`}>
                  <span style={{ width: `${Math.max(0, Math.min(100, updateProgress))}%` }} />
                </div>
              ) : null}

              <div className="account-update-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => runUpdateAction('check')}
                  disabled={!canCheckUpdate}
                >
                  <Icon name="refresh" size={14} />
                  <span>{updateBusy === 'check' ? 'Verificando...' : 'Verificar'}</span>
                </button>

                {updateStatus.status === 'available' ? (
                  <button
                    type="button"
                    onClick={() => runUpdateAction('download')}
                    disabled={!canDownloadUpdate}
                  >
                    <Icon name="download" size={14} />
                    <span>{updateBusy === 'download' ? 'Baixando...' : 'Baixar'}</span>
                  </button>
                ) : null}

                {updateStatus.status === 'downloaded' ? (
                  <button
                    type="button"
                    onClick={() => runUpdateAction('install')}
                    disabled={!canInstallUpdate}
                  >
                    <Icon name="check" size={14} />
                    <span>Reiniciar e instalar</span>
                  </button>
                ) : null}
              </div>
            </section>

            <div className="account-modal-actions">
              <button type="button" className="secondary" onClick={() => setAccountOpen(false)}>
                Cancelar
              </button>
              <button type="submit">
                Salvar conta
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function App() {
  return (
    <StoreProfileProvider>
      <ProjectHub />
    </StoreProfileProvider>
  );
}

export default App;
