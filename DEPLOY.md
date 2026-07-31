# Deploy: GitHub Pages + Render + Supabase

Arquitetura:

- Frontend: GitHub Pages ou Electron, build estatico Vite em `dist`.
- Backend: Render Web Service executando `npm start`.
- Banco: Supabase Postgres acessado apenas pelo backend.

## Modo local temporario

O build atual usa `VITE_DATA_MODE=local` por padrao. Nesse modo o frontend nao
faz chamadas ao Render/Supabase: perfis, configuracoes e pedidos locais ficam no
`localStorage` de cada computador. Pedidos nao atravessam entre computadores.

Quando o banco estiver disponivel novamente, defina `VITE_DATA_MODE=remote` no
build do frontend para voltar a usar a arquitetura descrita abaixo.

## 1. Supabase

1. Crie um projeto no Supabase.
2. Abra SQL Editor.
3. Rode o conteudo de `supabase/schema.sql`.
4. Rode o conteudo de `supabase/retention-cleanup.sql`. Ele zera pedidos e dados
   operacionais a cada dois dias, preservando perfis, conexoes, palavras-chave,
   catalogos, modelos de impressao, motoboys e configuracoes das ferramentas.
   A ultima previa em imagem do Finally Storage fica somente no computador.
5. Confirme no resultado do SQL que `easyprint-retention-cleanup` aparece com
   `active = true`. Reaplique esse arquivo sempre que ele mudar no repositorio;
   o deploy do frontend/backend nao executa SQL no Supabase.
6. Em Data API/API settings, confirme que o schema `public` esta exposto.
7. Copie:
   - Project URL: `SUPABASE_URL`
   - Service role key ou secret key: `SUPABASE_SERVICE_ROLE_KEY`

Nao coloque a service role key em GitHub Pages, `VITE_*`, codigo frontend ou commits.

Atualizacao de banco em projeto existente:

```sql
-- Rode o conteudo de supabase/order-version-migration.sql antes de subir backend com controle de versao.
-- Reaplique tambem todo o conteudo de supabase/retention-cleanup.sql.
```

Se o projeto estiver respondendo HTTP 402 por `exceed_egress_quota`, primeiro
aguarde a renovacao do ciclo ou restaure o acesso pelo Billing do Supabase. O SQL
de limpeza e as consultas de verificacao nao conseguem rodar enquanto o servico
estiver restrito.

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

## 4. App desktop e atualizacoes

A partir da versao `1.1.0`, o app instalado consegue verificar, baixar e instalar atualizacoes pelo proprio menu de conta da loja.

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
