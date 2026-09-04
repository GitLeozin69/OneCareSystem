# OneCare System

Sistema web para controle de equipamentos vinculados a contratos OneCare.

O projeto está na Etapa 1: estrutura inicial do backend e do frontend. Prisma, banco de dados e regras de negócio ainda não estão configurados.

## Tecnologias

- Backend: Node.js e Fastify
- Frontend: React, Vite e Tailwind CSS
- Linguagem: JavaScript

## Requisitos

- Node.js 22.12 ou superior
- npm 10 ou superior

O ambiente inicial foi validado com Node.js 24.18.1 e npm 11.16.0 no Windows 11.

## Instalação

Na raiz do projeto, instale as dependências de cada aplicação:

```powershell
npm.cmd --prefix backend install
npm.cmd --prefix frontend install
```

Crie o arquivo local de ambiente a partir do exemplo:

```powershell
Copy-Item .env.example .env
```

O arquivo `.env` é local e não deve ser versionado.

## Desenvolvimento

Execute o backend:

```powershell
npm.cmd run dev:backend
```

Em outro terminal, execute o frontend:

```powershell
npm.cmd run dev:frontend
```

Por padrão:

- backend: `http://localhost:3000`
- verificação de saúde: `http://localhost:3000/health`
- frontend: endereço informado pelo Vite no terminal

## Verificações

Na raiz do projeto:

```powershell
npm.cmd run lint
npm.cmd run test
npm.cmd run build
```

O build do backend verifica a sintaxe dos arquivos JavaScript. O frontend gera os arquivos de produção em `frontend/dist`.

## Estrutura atual

```text
backend/
  src/
    app.js
    server.js
  test/
    health.test.js
frontend/
  src/
    App.jsx
    index.css
    main.jsx
```

Consulte `documentacao_sistema_onecare.md` para a especificação completa e `AGENTS.md` para as regras de desenvolvimento.
