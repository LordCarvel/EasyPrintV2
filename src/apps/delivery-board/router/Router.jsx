import { useState, useEffect } from 'react';

function parseHash(hash) {
  const h = (hash || '').replace(/^#/, '');
  if (!h || h === '/' || h === '') return { name: 'home', params: {} };

  // /workspace/:id
  const wsMatch = h.match(/^\/workspace\/([^/]+)\/?$/) || h.match(/^\/workspace\/([^/]+)$/);
  if (wsMatch) return { name: 'workspace', params: { workspaceId: wsMatch[1] } };

  // /motoboy/:idx[/leva/:l/pedido/:p]
  const m = h.match(/^\/motoboy\/(\d+)(?:\/leva\/(\d+)(?:\/pedido\/(\d+))?)?$/);
  if (m) return { name: 'motoboy', params: { motoboyIdx: Number(m[1]), levaIdx: m[2] ? Number(m[2]) : null, pedidoIdx: m[3] ? Number(m[3]) : null } };

  if (h.startsWith('/settings')) return { name: 'settings', params: {} };

  return { name: 'notfound', params: {} };
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseHash(location.hash));

  useEffect(() => {
    const onHash = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return route;
}

export function navigate(path) {
  if (!path.startsWith('#')) path = `#${path}`;
  location.hash = path;
}

export default null;
