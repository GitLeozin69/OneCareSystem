# OneCare System

Sistema web para controle de equipamentos vinculados a contratos OneCare.

O projeto está na Etapa 2: estrutura inicial do backend e do frontend, schema Prisma e migration inicial do banco. As regras de negócio ainda não estão implementadas.

## Tecnologias

- Backend: Node.js, Fastify e Prisma ORM
- Frontend: React, Vite e Tailwind CSS
- Banco de dados: MySQL
- Linguagem: JavaScript

## Requisitos

- Node.js 22.12 ou superior
- npm 10 ou superior
- MySQL 8

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

Preencha a variável `DATABASE_URL` do `.env` com as credenciais do banco destinado exclusivamente ao OneCare:

```env
DATABASE_URL="mysql://usuario:senha@127.0.0.1:3306/ZebraOneCare"
```

O exemplo utiliza valores ilustrativos. Não coloque senhas no README, no `.env.example` ou em qualquer arquivo versionado. Caracteres especiais no usuário ou na senha devem ser codificados para URL.

## Banco de dados e Prisma

O schema está em `backend/prisma/schema.prisma` e utiliza as tabelas:

- `equipamentos`
- `notificacoes`
- `historico_contratos`

Valide o schema:

```powershell
npm.cmd run db:validate
```

Gere o Prisma Client:

```powershell
npm.cmd run db:generate
```

Aplique as migrations já versionadas ao banco configurado em `DATABASE_URL`:

```powershell
npm.cmd run db:migrate:deploy
```

Consulte o estado das migrations:

```powershell
npm.cmd run db:migrate:status
```

Esses comandos devem ser executados somente com uma URL que aponte para o banco `ZebraOneCare`. Não utilize credenciais de produção durante o desenvolvimento local.

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
  prisma/
    migrations/
    schema.prisma
  prisma.config.js
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
