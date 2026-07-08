import domain, { emptyStore } from '../core/domain';

function normalizeImportedData(payload) {
  // New format { motoboys, viagens, entregas, workspaceId?, version? }
  if (payload && typeof payload === 'object' && Array.isArray(payload.motoboys) && Array.isArray(payload.viagens) && Array.isArray(payload.entregas)) {
    return {
      motoboys: payload.motoboys,
      viagens: payload.viagens,
      entregas: payload.entregas,
    };
  }

  // Legacy format: array de motoboys com levas/pedidos
  if (Array.isArray(payload)) {
    const motoboys = [];
    const viagens = [];
    const entregas = [];
    const now = new Date().toISOString();

    payload.forEach((m) => {
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

  throw new Error('Formato de arquivo desconhecido');
}

export function exportToJSON(store, workspaceId) {
  const safeStore = {
    motoboys: store?.motoboys || emptyStore.motoboys,
    viagens: store?.viagens || emptyStore.viagens,
    entregas: store?.entregas || emptyStore.entregas,
    workspaceId,
    version: 2,
    exportedAt: new Date().toISOString(),
  };

  const data = JSON.stringify(safeStore, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').split('.')[0];
  a.href = url;
  a.download = `deliveryboard-${workspaceId || 'default'}-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importFromJSON(file) {
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    const data = normalizeImportedData(json);
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
