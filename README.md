# OneCare System

Sistema web para controle de equipamentos vinculados a contratos OneCare.

O projeto está na Etapa 3C: API e interface de equipamentos com listagem, pesquisa, paginação, ordenação, cadastro e edição. Arquivados e histórico na interface, importação, status, dashboard e notificações ainda não estão implementados.

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
- frontend: `http://127.0.0.1:5173` (porta fixa; se estiver ocupada, o Vite informa o erro)

O navegador chama `/api/equipamentos` na mesma origem do frontend. O proxy local do Vite remove `/api` e encaminha a chamada ao endereço definido em `VITE_API_URL` no `.env` da raiz (padrão: `http://127.0.0.1:3000`). O exemplo existente `http://localhost:3000` também pode ser usado. Reinicie o Vite após alterar essa configuração. O backend continua expondo `/equipamentos`, sem alteração de CORS.

O proxy também está configurado no `npm.cmd --prefix frontend run preview`. Para hospedagem futura dos arquivos estáticos, será necessário configurar o servidor de hospedagem para encaminhar `/api` ao backend; esse proxy do Vite serve apenas ao desenvolvimento/preview. Não coloque credenciais em variáveis `VITE_`, pois elas são públicas.

### Interface de equipamentos

A página lista todos os equipamentos não arquivados, inclusive com contratos já vencidos. A pesquisa é enviada por “Pesquisar” ou Enter e pode ser limpa. Pesquisa, limite e ordenação voltam à primeira página quando alterados; os filtros são preservados ao sair do formulário. Requisições substituídas são canceladas e respostas antigas são ignoradas.

“Novo equipamento” abre o cadastro; “Editar” carrega o equipamento pela API. São obrigatórios serial, part number, cliente, início e término do OneCare. Patrimônio, número do contrato e última conferência são opcionais; limpar um valor envia `null`. O serial é normalizado para maiúsculas. Somente campos editáveis são enviados e a API continua responsável pela unicidade e pelo histórico.

As datas da tabela são exibidas em `DD/MM/AAAA`. Os formulários usam controles nativos de data (a aparência depende do idioma do navegador), enviando `AAAA-MM-DD`, sem conversão de fuso. A interface apresenta carregamento, resultados vazios, erros com nova tentativa, conflitos próximos aos campos e confirmação de salvamento. Durante o envio, os controles são desabilitados.

### Roteiro manual

1. Inicie backend e frontend nos dois terminais acima e abra `http://127.0.0.1:5173`.
2. Pesquise por um serial ou cliente, envie também com Enter, limpe a pesquisa e altere ordenação/limite. Havendo mais registros que o limite, navegue entre páginas.
3. Cadastre um equipamento exclusivo de teste com serial alfanumérico e datas válidas. Confira a confirmação e a atualização da lista; anote o serial criado.
4. Edite apenas esse registro de teste, limpe os opcionais e confira que aparecem como “—”. Tente serial inválido, datas invertidas e duplicidade com outro registro de teste, se houver.
5. Durante um salvamento, confirme que o botão não permite novo envio. Cancele um formulário e confira que os filtros continuam iguais.
6. Pare o backend, faça uma pesquisa e confira o erro. Reinicie-o e use “Tentar novamente”.
7. Use Tab/Enter para navegar e teste em janela estreita: formulário em uma coluna, botões acessíveis e tabela com rolagem horizontal.

Não altere equipamentos reais para esses testes. Registros criados manualmente permanecem no banco; não há exclusão pela interface nesta etapa.

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

`npm.cmd test` executa as suítes do backend e do frontend. Para executar apenas os componentes, use `npm.cmd --prefix frontend test`. O frontend usa Vitest 5, jsdom 26 e Testing Library React/DOM, somente como dependências de desenvolvimento. O jsdom 26 mantém compatibilidade com o Node mínimo do projeto. Os testes usam respostas HTTP simuladas, não dependem do MySQL e não criam dados reais.

O Vitest foi configurado seguindo seu [guia oficial](https://vitest.dev/guide/); o proxy usa a [configuração oficial do Vite](https://vite.dev/config/server-options.html#server-proxy).

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
    components/
    pages/
    services/
    utils/
    App.jsx
    index.css
    main.jsx
  test/
  vitest.config.js
```

Consulte `documentacao_sistema_onecare.md` para a especificação completa e `AGENTS.md` para as regras de desenvolvimento.
