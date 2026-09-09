# OneCare System

Sistema web para controle de equipamentos vinculados a contratos OneCare.

O projeto está na Etapa 3B: estrutura base, banco configurado e API de equipamentos com listagem, pesquisa, paginação e ordenação. Importação, status, dashboard, notificações e telas funcionais ainda não estão implementados.

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

## API de equipamentos

Endpoints implementados:

```http
POST   /equipamentos
GET    /equipamentos
GET    /equipamentos/arquivados
GET    /equipamentos/:id
PATCH  /equipamentos/:id
DELETE /equipamentos/:id
PATCH  /equipamentos/:id/restaurar
```

O cadastro utiliza propriedades em `camelCase`:

```json
{
  "serialNumber": "SN123456",
  "partNumber": "PN001",
  "cliente": "Cliente Exemplo",
  "patrimonio": "PAT001",
  "contratoOnecare": "OC001",
  "dataInicioOnecare": "2026-01-01",
  "dataFimOnecare": "2026-12-31",
  "dataUltimaConferencia": "2026-09-04"
}
```

As datas da API utilizam `AAAA-MM-DD`. `patrimonio`, `contratoOnecare` e `dataUltimaConferencia` são opcionais. A remoção é lógica e equipamentos arquivados não são retornados por `GET /equipamentos/:id`.

O patrimônio informado recebe `trim` e deve ser único globalmente, inclusive entre equipamentos arquivados. Valor vazio ou somente espaços vira `null`; vários equipamentos podem ficar sem patrimônio. O formato é preservado. Duplicidade no cadastro ou na edição retorna `409`, código `PATRIMONIO_DUPLICADO` e mensagem `Já existe um equipamento com esse patrimônio.`. A edição permite manter o próprio patrimônio. A futura importação por Excel deverá rejeitar patrimônios duplicados no sistema ou em outra linha válida da planilha.

A migration `20260908172841_unique_patrimonio` adiciona somente o índice `uq_equipamentos_patrimonio`. Antes de aplicá-la a uma base com dados, verifique duplicidades e resolva-as com autorização do responsável; a migration não apaga nem ajusta registros.

### Listagem, pesquisa, paginação e ordenação

`GET /equipamentos` retorna somente equipamentos não arquivados. Os parâmetros são opcionais:

- `q`: pesquisa parcial em `serialNumber`, `partNumber`, `patrimonio`, `cliente` e `contratoOnecare`; espaços nas extremidades são ignorados;
- `page`: página atual, padrão `1`;
- `limit`: itens por página, padrão `20` e máximo `100`;
- `sortBy`: campo de ordenação, padrão `createdAt`;
- `order`: direção `asc` ou `desc`, padrão `desc`.

Os campos aceitos em `sortBy` são `serialNumber`, `partNumber`, `patrimonio`, `cliente`, `contratoOnecare`, `dataInicioOnecare`, `dataFimOnecare`, `createdAt` e `updatedAt`.

Empates são resolvidos pelo ID, na mesma direção. `q` vazio ou somente com espaços não aplica pesquisa. Parâmetros inválidos, desconhecidos ou repetidos retornam `400 PARAMETRO_INVALIDO`, com mensagem e detalhes do campo. `page` deve ser um inteiro positivo representável com segurança em JavaScript; páginas além dos resultados retornam uma lista vazia.

Exemplo:

```http
GET /equipamentos?q=SN123&page=1&limit=20&sortBy=createdAt&order=desc
```

Resposta:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0
  },
  "sort": {
    "sortBy": "createdAt",
    "order": "desc"
  }
}
```

## Verificações

Na raiz do projeto:

```powershell
npm.cmd run lint
npm.cmd run test
npm.cmd run test:integration
npm.cmd run build
```

Os testes de integração usam exclusivamente o banco de desenvolvimento `ZebraOneCare` configurado no `.env`. Exercitam cadastro, consulta, edição, reserva de patrimônio em arquivados, múltiplos `NULL` e rejeição de duplicidade pelo índice real. As transações fazem rollback ao final, sem manter equipamentos de teste nem apagar registros existentes; podem ocorrer lacunas normais nos IDs auto-incrementais. O build do backend verifica a sintaxe dos arquivos JavaScript. O frontend gera os arquivos de produção em `frontend/dist`.

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
