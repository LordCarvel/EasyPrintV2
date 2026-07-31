# Deploy: GitHub Pages + Render

Arquitetura:

- Frontend: GitHub Pages ou Electron, build estatico Vite em `dist`.
- Backend: Render Web Service executando `npm start`.
- Fila de pedidos: SQLite transitorio no Render, com retencao de dois dias.
- Perfis e configuracoes: `localStorage` de cada computador.

## Modo hibrido padrao

O build usa `VITE_DATA_MODE=hybrid` por padrao. Perfis, senhas, configuracoes,
caixa, motoboys, Delivery Board e Finally Storage ficam no navegador. Somente
pedidos, eventos e status usam o backend para atravessar entre computadores.

Use `VITE_DATA_MODE=local` para um build totalmente offline. O modo legado
`VITE_DATA_MODE=remote` continua disponivel, mas volta a sincronizar perfis e
configuracoes e nao e recomendado enquanto houver limite de egress.

## 1. Render

1. Suba este repositorio para o GitHub.
2. No Render, crie um Blueprint a partir do `render.yaml`.
3. Confirme `ROUTING_STORE_MODE=sqlite` e `ROUTING_DB_PATH=/tmp/easyprint-routing.sqlite`.
4. Confirme `CORS_ORIGIN=https://lordcarvel.github.io,easyhub://app`.
5. Variaveis antigas `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` podem ser removidas.
6. Depois do deploy, teste:

```bash
curl https://easyprint-routing-api.onrender.com/health
```

O retorno deve conter `"orderStore":"sqlite"`. A fila e operacional e
transitoria: pedidos com mais de dois dias sao apagados automaticamente. Um
redeploy ou reinicio da instancia tambem pode esvaziar a fila, sem afetar as
configuracoes locais das lojas.

Se voce mudar o nome do servico no Render, ajuste tambem:

- `VITE_ROUTING_API_URL` no GitHub
- `RENDER_API_URL` em `src/features/routing/routingApi.js`
- `.env.example`

## 2. GitHub Pages

1. No GitHub, va em Settings > Pages.
2. Em Build and deployment, selecione GitHub Actions.
3. Em Settings > Secrets and variables > Actions > Variables, crie:

```text
VITE_ROUTING_API_URL=https://easyprint-routing-api.onrender.com
```

4. Faca push para `main` ou `master`.
5. O workflow `.github/workflows/deploy-pages.yml` vai rodar `npm ci`, `npm run build` e publicar `dist`.

## 3. App desktop e atualizacoes

A partir da versao `1.1.7`, o app instalado consegue verificar, baixar e instalar
atualizacoes antes ou depois de entrar em uma conta.

Importante: maquinas que ainda estao em uma versao antiga sem atualizador precisam instalar manualmente uma vez o instalador `1.1.0` ou superior. Depois disso, as proximas atualizacoes entram pelo app.

Para publicar uma nova versao automaticamente, rode:

```bash
npm run release:next -- -WaitRelease
```

Esse comando:

- sobe a versao patch automaticamente, por exemplo `1.1.1` para `1.1.2`;
- roda build e testes;
- faz commit;
- cria a tag `v<versao>`;
- faz push da branch e da tag;
- aguarda a GitHub Release ficar pronta quando usado com `-WaitRelease`.

Opcoes uteis:

```bash
npm run release:next -- -Bump minor
npm run release:next -- -Version 1.2.0
npm run release:next -- -SkipChecks
npm run release:next -- -NoPush
```

Fluxo manual equivalente:

1. Altere `"version"` em `package.json` para uma versao maior.
2. Faca commit e push para `main`.
3. Crie e envie uma tag com a mesma versao:

```bash
git tag v1.1.1
git push origin v1.1.1
```

4. O workflow `.github/workflows/release-desktop.yml` gera a release com:
   - `EasyHub-Setup-<versao>.exe`
   - `EasyHub-Setup-<versao>.exe.blockmap`
   - `latest.yml`
5. No app instalado, abra a conta da loja e use `Atualizacoes do app`.

Tambem e possivel publicar localmente com `GH_TOKEN` configurado:

```bash
npm run release:win
```

## 5. Local

Frontend:

```bash
npm run dev
```

Backend local com SQLite fallback:

```bash
npm run server
```

Backend local usando Supabase:

```bash
copy .env.example .env
# preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
npm run server:env
```

Popular/conectar lojas iniciais:

```bash
npm run server:seed
# ou, com .env:
npm run server:seed:env
```
