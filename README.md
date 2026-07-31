# Easy Print – Impressão Fácil

Interface profissional para impressão de comandas térmicas com configurações personalizáveis.

## Stack

- **React 18** - UI library
- **React Router 6** - Client-side routing
- **Vite** - Build tool & dev server
- **CSS3** - Styling com variáveis CSS

## Instalação

```bash
npm install
```

## Desenvolvimento

```bash
npm run dev
```

## Modo hibrido temporario

O app usa `localStorage` para perfis, senhas, configuracoes, caixa, motoboys e
dados das ferramentas. Somente pedidos, eventos e status passam pelo servidor
do Render para circular entre os computadores das filiais.

O servidor usa uma fila SQLite transitoria com retencao de dois dias e nao
acessa o Supabase por padrao. Use `VITE_DATA_MODE=local` apenas para trabalhar
totalmente offline, sem compartilhar pedidos.

## Build

```bash
npm run build
```

## Deploy

O deploy em GitHub Pages + Render esta documentado em [DEPLOY.md](DEPLOY.md).

## Estrutura

```
src/
├── pages/
│   ├── Home.jsx                    # Página de impressão
│   ├── Home.css
│   ├── ConfigDrinks.jsx            # Configuração de bebidas
│   ├── ConfigDrinks.css
│   ├── ConfigTemplate.jsx          # Configuração da comanda
│   └── ConfigTemplate.css
├── components/
│   ├── Header.jsx                  # Navegação com links para rotas
│   ├── Header.css
│   ├── Footer.jsx
│   └── Footer.css
├── api/
│   ├── core/
│   │   ├── Order.js
│   │   ├── OrderParser.js
│   │   └── Printer.js
│   ├── ui/
│   │   ├── Clipboard.js
│   │   └── EventHandlers.js
│   └── utils/
│       └── textHelpers.js
├── App.jsx                        # Rotas principais
├── App.css
├── main.jsx                       # Entry point
└── index.css                      # Estilos globais + variáveis
```

## Funcionalidades

### 📄 Home - Impressão Fácil
- Cola texto de pedidos do iFood
- Botão para colar da área de transferência
- Impressão automática em impressora térmica
- Pronto para restaurante/pizzaria

### 🥤 Configurações - Bebidas
- Adicione/remova bebidas personalizadas
- Define preços para cada bebida
- Escolha cores para destaque na comanda
- Prévia visual em tempo real
- Dados salvos em localStorage

### 📋 Configurações - Comanda Térmica
- Personalize elementos visíveis na comanda
- Toggle: filial, pedido, horário, cliente, endereço, etc.
- Destaque customizado para bebidas (cor fundo + texto)
- Preview de impressão térmica em tempo real
- Layout responsivo

## Tecnologias & Conceitos

✅ Multi-page routing com React Router  
✅ Armazenamento local (localStorage)  
✅ State management simples com hooks  
✅ CSS Grid & Flexbox para layout  
✅ Parsing de pedidos iFood automatizado  
✅ Impressão térmica via iframe  
✅ Sem dependências desnecessárias  

## Notas

- Configurações são salvas em localStorage
- Design segue padrão Delivery Board
- Header com navegação por abas
- Footer fixo em todas as páginas
- Layout totalmente responsivo

