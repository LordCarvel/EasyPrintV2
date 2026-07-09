# Deploy: GitHub Pages + Render + Supabase

Arquitetura:

- Frontend: GitHub Pages, build estatico Vite em `dist`.
- Backend: Render Web Service executando `npm start`.
- Banco: Supabase Postgres acessado apenas pelo backend.

## 1. Supabase

1. Crie um projeto no Supabase.
2. Abra SQL Editor.
3. Rode o conteudo de `supabase/schema.sql`.
4. Em Data API/API settings, confirme que o schema `public` esta exposto.
5. Copie:
   - Project URL: `SUPABASE_URL`
   - Service role key ou secret key: `SUPABASE_SERVICE_ROLE_KEY`

Nao coloque a service role key em GitHub Pages, `VITE_*`, codigo frontend ou commits.

## 2. Render

1. Suba este repositorio para o GitHub.
2. No Render, crie um Blueprint a partir do `render.yaml`.
3. Preencha os secrets marcados como `sync: false`:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Confirme `CORS_ORIGIN=https://lordcarvel.github.io,easyhub://app`.
5. Depois do deploy, teste:

```bash
curl https://easyprint-routing-api.onrender.com/health
```

Se voce mudar o nome do servico no Render, ajuste tambem:

- `VITE_ROUTING_API_URL` no GitHub
- `RENDER_API_URL` em `src/features/routing/routingApi.js`
- `.env.example`

## 3. GitHub Pages

1. No GitHub, va em Settings > Pages.
2. Em Build and deployment, selecione GitHub Actions.
3. Em Settings > Secrets and variables > Actions > Variables, crie:

```text
VITE_ROUTING_API_URL=https://easyprint-routing-api.onrender.com
```

4. Faca push para `main` ou `master`.
5. O workflow `.github/workflows/deploy-pages.yml` vai rodar `npm ci`, `npm run build` e publicar `dist`.

## 4. Local

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
