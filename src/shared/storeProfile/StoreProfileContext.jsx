import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  clearCurrentStoreId,
  getSessionToken,
  LOCAL_DATA_MODE,
  SHARED_ORDERS_MODE,
  routingApi,
  setAuthSession
} from '../../features/routing/routingApi';
import { hydrateLocalSettingsFromStore } from '../../features/routing/storeSettingsClient';
import { showAppAlert } from '../ui/appDialog';
import './StoreProfileContext.css';

const StoreProfileContext = createContext(null);

const areaTextToInput = (value = []) => Array.isArray(value) ? value.join(', ') : String(value || '');

function Field({ label, children }) {
  return (
    <label className="store-profile-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function StoreProfileLogin({ onSessionReady }) {
  const [stores, setStores] = useState([]);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [createForm, setCreateForm] = useState({ name: 'Minha loja', city: '', username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadStores = async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await routingApi.listSetupStores();
      setStores(payload.stores || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStores();
  }, []);

  const login = async () => {
    if (!loginForm.username.trim() || !loginForm.password) {
      void showAppAlert('Informe usuario e senha da loja.');
      return;
    }

    try {
      const session = await routingApi.login(loginForm);
      setAuthSession(session);
      onSessionReady(session.store);
    } catch (err) {
      setError(err.message);
    }
  };

  const createStore = async () => {
    if (!createForm.name.trim() || !createForm.username.trim() || !createForm.password) {
      void showAppAlert('Informe nome, usuario e senha da loja.');
      return;
    }

    try {
      await routingApi.createSetupStore(createForm);
      const session = await routingApi.login({
        username: createForm.username,
        password: createForm.password
      });
      setAuthSession(session);
      onSessionReady(session.store);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="store-profile-login">
      <section className="store-profile-card">
        <div className="store-profile-header">
          <h1>Perfil da loja</h1>
          <p>
            {LOCAL_DATA_MODE
              ? SHARED_ORDERS_MODE
                ? 'Escolha a loja. Perfis e configuracoes ficam neste computador; pedidos circulam entre as filiais.'
                : 'Escolha a loja. Enquanto o servidor estiver fora, tudo sera salvo somente neste computador.'
              : 'Entre uma vez para carregar caixa, motoboys, rotas e configuracoes da pizzaria em todos os projetos.'}
          </p>
        </div>

        {error ? <div className="store-profile-error">{error}</div> : null}
        {loading ? <div className="store-profile-note">Carregando lojas...</div> : null}

        <div className="store-profile-grid">
          <Field label="Usuario">
            <input
              value={loginForm.username}
              onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void login();
              }}
            />
          </Field>

          <Field label="Senha">
            <input
              type="password"
              value={loginForm.password}
              onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void login();
              }}
            />
          </Field>
        </div>

        <button type="button" className="store-profile-primary" onClick={login}>
          Entrar
        </button>

        <p className="store-profile-note">
          Lojas iniciais: penha, gravata ou sao-domingos. Senha inicial: 1234.
          {LOCAL_DATA_MODE && SHARED_ORDERS_MODE ? ' Somente os pedidos usam o servidor compartilhado.' : ''}
          {LOCAL_DATA_MODE && !SHARED_ORDERS_MODE ? ' O modo totalmente local nao compartilha pedidos entre computadores.' : ''}
        </p>

        <div className="store-profile-store-list">
          {stores.map((store) => (
            <article key={store.id}>
              <strong>{store.name}</strong>
              <span>Usuario: {store.username || store.id}</span>
              <small>{areaTextToInput(store.serviceAreas) || 'Sem areas cadastradas'}</small>
            </article>
          ))}
        </div>

        <div className="store-profile-divider" />

        <h2>Criar perfil</h2>
        <Field label="Nome da loja">
          <input
            value={createForm.name}
            onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
          />
        </Field>
        <Field label="Cidade / regiao">
          <input
            value={createForm.city}
            onChange={(event) => setCreateForm((current) => ({ ...current, city: event.target.value }))}
          />
        </Field>
        <div className="store-profile-grid">
          <Field label="Usuario">
            <input
              value={createForm.username}
              onChange={(event) => setCreateForm((current) => ({ ...current, username: event.target.value }))}
            />
          </Field>
          <Field label="Senha">
            <input
              type="password"
              value={createForm.password}
              onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
            />
          </Field>
        </div>
        <button type="button" className="store-profile-primary" onClick={createStore}>
          Criar e entrar
        </button>
      </section>
    </div>
  );
}

export function StoreProfileProvider({ children }) {
  const [store, setStore] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(Boolean(getSessionToken()));
  const [error, setError] = useState('');

  const reloadProfile = async () => {
    const payload = await routingApi.getMe();
    const nextSettings = await hydrateLocalSettingsFromStore();
    setStore(payload.store);
    setSettings(nextSettings);
    setError('');
    return { store: payload.store, settings: nextSettings };
  };

  useEffect(() => {
    if (!getSessionToken()) {
      setLoading(false);
      return;
    }

    let canceled = false;
    setLoading(true);

    reloadProfile()
      .catch((err) => {
        if (canceled) return;
        clearCurrentStoreId();
        setStore(null);
        setSettings(null);
        setError(err.message);
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });

    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    const handleSettingsUpdate = (event) => {
      if (event.detail) setSettings(event.detail);
    };

    window.addEventListener('storeProfileSettingsUpdated', handleSettingsUpdate);
    return () => window.removeEventListener('storeProfileSettingsUpdated', handleSettingsUpdate);
  }, []);

  useEffect(() => {
    const handleProfileReload = () => {
      void reloadProfile().catch((err) => setError(err.message));
    };

    window.addEventListener('storeProfileReloadRequested', handleProfileReload);
    return () => window.removeEventListener('storeProfileReloadRequested', handleProfileReload);
  }, []);

  const logout = async () => {
    try {
      await routingApi.logout();
    } catch {
      // A sessao local deve cair mesmo se o servidor estiver fechado.
    }

    clearCurrentStoreId();
    setStore(null);
    setSettings(null);
  };

  const contextValue = useMemo(() => ({
    store,
    settings,
    reloadProfile,
    logout
  }), [store, settings]);

  if (loading) {
    return (
      <div className="store-profile-loading">
        Carregando perfil da loja...
      </div>
    );
  }

  if (!store) {
    return (
      <StoreProfileLogin
        onSessionReady={(nextStore) => {
          setStore(nextStore);
          void reloadProfile().catch((err) => setError(err.message));
        }}
      />
    );
  }

  return (
    <StoreProfileContext.Provider value={contextValue}>
      {error ? <div className="store-profile-floating-error">{error}</div> : null}
      {children}
    </StoreProfileContext.Provider>
  );
}

export function useStoreProfile() {
  const context = useContext(StoreProfileContext);
  if (!context) {
    throw new Error('useStoreProfile must be used inside StoreProfileProvider');
  }
  return context;
}
