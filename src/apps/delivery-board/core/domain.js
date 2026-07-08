// Domain primitives and business logic for Delivery Board v2
// Entities: Motoboy, Viagem, Entrega

export const emptyStore = { motoboys: [], viagens: [], entregas: [] };

function generateId(prefix = '') {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeOrderNumber(numeroPedido) {
  return String(numeroPedido ?? '')
    .trim()
    .replace(/^#/, '');
}

// Factories
export function createMotoboy(nome) {
  if (!nome || !String(nome).trim()) throw new Error('Nome do motoboy e obrigatorio');
  return {
    id: generateId('m_'),
    nome: String(nome).trim(),
    ativo: true,
  };
}

export function createViagem(motoboyId, opts = {}) {
  if (!motoboyId) throw new Error('motoboyId e obrigatorio para criar uma viagem');
  const now = opts.dataHoraSaida || new Date().toISOString();
  return {
    id: generateId('v_'),
    motoboyId,
    dataHoraSaida: now,
    dataHoraVolta: null,
    status: 'aberta', // 'aberta' | 'fechada'
    hubDispatchSequence: Number.isFinite(Number(opts.hubDispatchSequence))
      ? Number(opts.hubDispatchSequence)
      : 0,
    lastHubSourceRunId: opts.lastHubSourceRunId || null,
  };
}

export function closeViagem(viagem, opts = {}) {
  if (!viagem) throw new Error('viagem e obrigatoria');
  if (viagem.status === 'fechada') return { ...viagem };
  return { ...viagem, status: 'fechada', dataHoraVolta: opts.dataHoraVolta || new Date().toISOString() };
}

export function reopenViagem(viagem) {
  if (!viagem) throw new Error('viagem e obrigatoria');
  if (viagem.status === 'aberta') return { ...viagem };
  return { ...viagem, status: 'aberta', dataHoraVolta: null };
}

export function createEntrega(viagemId, numeroPedido, opts = {}) {
  if (!viagemId) throw new Error('viagemId e obrigatorio para criar entrega');
  if (numeroPedido === undefined || numeroPedido === null || String(numeroPedido).trim() === '') {
    throw new Error('numeroPedido e obrigatorio');
  }
  return {
    id: generateId('e_'),
    viagemId,
    numeroPedido: normalizeOrderNumber(numeroPedido),
    origem: opts.origem || null,
    valor: opts.valor ?? null,
    statusEntrega: opts.statusEntrega || 'pendente', // 'pendente' | 'entregue'
    observacoes: opts.observacoes || null,
    hubOrderId: opts.hubOrderId || null,
    sourceApp: opts.sourceApp || null,
    sourceBranchId: opts.sourceBranchId || null,
    sourceBranchName: opts.sourceBranchName || null,
    sourceStoreName: opts.sourceStoreName || null,
    externalOrigin: Boolean(opts.externalOrigin || opts.hubOrderId || opts.sourceBranchId || opts.sourceBranchName),
  };
}

// Pure helpers / queries
export function findEntregasByNumero(entregas = [], numeroPedido) {
  if (numeroPedido === undefined || numeroPedido === null) return [];
  const search = normalizeOrderNumber(numeroPedido);
  return entregas.filter((ent) => normalizeOrderNumber(ent.numeroPedido) === search);
}

export function getViagensByMotoboy(viagens = [], motoboyId) {
  return viagens.filter((v) => v.motoboyId === motoboyId);
}

export function getEntregasByViagem(entregas = [], viagemId) {
  return entregas.filter((e) => e.viagemId === viagemId);
}

// Mutators (pure, return new objects)
export function addMotoboyToStore(store, motoboy) {
  return { ...store, motoboys: [...(store.motoboys || []), motoboy] };
}

export function addViagemToStore(store, viagem) {
  return { ...store, viagens: [...(store.viagens || []), viagem] };
}

export function addEntregaToStore(store, entrega) {
  return { ...store, entregas: [...(store.entregas || []), entrega] };
}

export function removeViagemFromStore(store, viagemId, options = { cascade: true }) {
  const newViagens = (store.viagens || []).filter((v) => v.id !== viagemId);
  let newEntregas = store.entregas || [];
  if (options.cascade) {
    newEntregas = newEntregas.filter((e) => e.viagemId !== viagemId);
  }
  return { ...store, viagens: newViagens, entregas: newEntregas };
}

export function updateEntrega(entregas = [], entregaId, changes = {}) {
  return entregas.map((e) => {
    if (e.id !== entregaId) return e;

    const nextChanges = { ...changes };
    if (Object.hasOwn(nextChanges, 'numeroPedido')) {
      nextChanges.numeroPedido = normalizeOrderNumber(nextChanges.numeroPedido);
    }

    return { ...e, ...nextChanges };
  });
}

export function updateEntregaStatus(entregas = [], entregaId, newStatus) {
  return entregas.map((e) => (e.id === entregaId ? { ...e, statusEntrega: newStatus } : e));
}

export function removeEntregaFromStore(store, entregaId) {
  return { ...store, entregas: (store.entregas || []).filter((e) => e.id !== entregaId) };
}

export function updateViagem(viagens = [], viagemId, changes = {}) {
  return viagens.map((viagem) => (viagem.id === viagemId ? { ...viagem, ...changes } : viagem));
}

export function removeMotoboy(store, motoboyId, options = { cascade: false }) {
  const hasViagens = (store.viagens || []).some((v) => v.motoboyId === motoboyId);
  if (hasViagens && !options.cascade) {
    throw new Error('Motoboy possui viagens; use cascade=true para remover em cascata');
  }
  const newMotoboys = (store.motoboys || []).filter((m) => m.id !== motoboyId);
  let newViagens = store.viagens || [];
  let newEntregas = store.entregas || [];
  if (options.cascade) {
    const viagemIds = new Set(newViagens.filter((v) => v.motoboyId === motoboyId).map((v) => v.id));
    newViagens = newViagens.filter((v) => v.motoboyId !== motoboyId);
    newEntregas = newEntregas.filter((e) => !viagemIds.has(e.viagemId));
  }
  return { ...store, motoboys: newMotoboys, viagens: newViagens, entregas: newEntregas };
}

export default {
  emptyStore,
  createMotoboy,
  createViagem,
  closeViagem,
  reopenViagem,
  createEntrega,
  findEntregasByNumero,
  getViagensByMotoboy,
  getEntregasByViagem,
  addMotoboyToStore,
  addViagemToStore,
  addEntregaToStore,
  removeViagemFromStore,
  updateEntrega,
  updateEntregaStatus,
  removeEntregaFromStore,
  updateViagem,
  removeMotoboy,
};
