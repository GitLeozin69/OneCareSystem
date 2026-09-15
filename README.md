# OneCare System

Sistema web para controle de equipamentos vinculados a contratos OneCare.

O projeto está na Etapa 7B.1: além do controle operacional, notificações internas e segurança revisada, o administrador pode alterar a própria senha com confirmação da senha atual e encerramento de todas as suas sessões. O envio por e-mail permanece reservado para a Etapa 6B.

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

No desenvolvimento local, o backend troca `localhost` por `127.0.0.1` e habilita automaticamente `allowPublicKeyRetrieval` para autenticação `caching_sha2_password` do MySQL. Essa opção não é habilitada automaticamente para hosts remotos. Ao hospedar o sistema, substitua a `DATABASE_URL` pela fornecida pelo provedor e configure TLS com validação do certificado conforme as instruções da hospedagem; não utilize `rejectUnauthorized=false` em produção.

## Banco de dados e Prisma

O schema está em `backend/prisma/schema.prisma` e utiliza as tabelas:

- `equipamentos`
- `notificacoes`
- `historico_contratos`
- `usuarios`
- `sessoes`

As sessões usam tokens opacos em cookies `HttpOnly`; somente o hash do token é persistido no MySQL.

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

## Autenticação e primeiro administrador

Depois de aplicar as migrations, crie o único administrador em um terminal interativo:

```powershell
npm.cmd --prefix backend run admin:create
```

O comando solicita usuário, senha de 8 a 128 caracteres e confirmação, oculta a senha quando o terminal permite e recusa a criação de um segundo administrador. Não existe credencial padrão. O administrador cria contas `VISUALIZADOR` pela tela “Usuários”; essas contas consultam dashboard, equipamentos, arquivados e históricos, mas não alteram dados.

No `.env`, configure `NODE_ENV`, `FRONTEND_ORIGIN` com uma lista explícita de origens, `SESSION_DURATION_HOURS` (padrão `8`) e `COOKIE_SECURE`. Em desenvolvimento HTTP local, use `NODE_ENV=development` e `COOKIE_SECURE=false`. Em produção, somente origens HTTPS são aceitas, `COOKIE_SECURE=true` e um `CSRF_SECRET` aleatório de pelo menos 32 caracteres fornecido pelo ambiente são obrigatórios. O backend falha explicitamente diante de modo inválido, cookie inseguro, origem HTTP, segredo ausente ou serviços de negócio sem autenticação.

O frontend mantém o token CSRF somente em memória, envia cookies com `credentials: include` e não armazena sessão em `localStorage` ou `sessionStorage`.

O token CSRF é vinculado ao cookie da sessão e toda operação mutável exige origem permitida. Sessões antigas apresentadas durante um novo login são revogadas; sessões expiradas são removidas durante autenticações bem-sucedidas. As senhas usam Argon2id com parâmetros explícitos. A API aplica headers de segurança, `Cache-Control: no-store`, limite de 64 KiB para corpos JSON comuns e limites de requisição em memória. O upload Excel preserva seu limite independente de 10 MB.

Os limites em memória são adequados a uma instância local. Antes de escalar horizontalmente, a Etapa 7C deverá movê-los para um armazenamento compartilhado e configurar somente os proxies confiáveis. Consulte [docs/seguranca.md](docs/seguranca.md) para evidências, testes e pendências.

### Alterar a própria senha — Etapa 7B.1

Entre como administrador e clique em “Alterar minha senha” no menu. Informe “Senha atual”, “Nova senha” e “Confirmar nova senha”. A nova senha deve ter de 8 a 128 caracteres, ser diferente da atual e coincidir exatamente com a confirmação. Os três campos rejeitam vazio ou somente espaços; senhas válidas preservam espaços e diferenças de caixa. Os campos são limpos após cada tentativa e ao sair do formulário.

A API `PATCH /auth/senha` aceita somente o objeto JSON com `senhaAtual`, `novaSenha` e `confirmacaoNovaSenha`, sem identificador de usuário ou query string. Exige sessão ativa de `ADMIN`, origem permitida e CSRF vinculado à sessão. O limite é de cinco requisições por administrador a cada 15 minutos por instância, com `429` e `Retry-After` ao exceder. O limite de corpo permanece em 64 KiB.

Sucesso retorna `204 No Content`: atualiza o hash Argon2id e revoga **todas** as sessões desse administrador na mesma transação, incluindo a atual. Os cookies de sessão e CSRF são expirados. A interface informa o sucesso, obtém um CSRF anônimo novo e mostra o login. A senha anterior e as sessões antigas deixam de funcionar. Isso substitui a previsão anterior de preservar a sessão atual. Sessões de outros usuários não são afetadas.

Senha atual incorreta retorna `400 SENHA_ATUAL_INCORRETA`, sem encerrar sessões. Confirmação diferente, reutilização, tipos inválidos e campos inesperados também retornam `400`. Sessão inválida retorna `401`; visualizador recebe `403`. Erros inesperados permanecem genéricos. O login confere novamente o hash autenticado dentro da transação, impedindo que uma autenticação iniciada com a senha antiga emita uma sessão depois da troca.

### Recuperação operacional se o administrador esquecer a senha

Não existe recuperação pela interface ou por e-mail. `admin:create` continua destinado apenas à criação inicial e não substitui o administrador existente. Se não souber a senha atual, solicite manutenção autorizada ao responsável técnico:

1. Confirmar a identidade e a autorização do responsável pela conta e identificar o banco OneCare correto.
2. Interromper temporariamente o backend e criar um backup protegido, fora do Git, antes da manutenção.
3. Em ambiente restrito, receber a nova senha por entrada interativa oculta, com confirmação; nunca por argumento de comando, URL, arquivo versionado ou mensagem de log.
4. Validar a política de 8 a 128 caracteres e gerar o hash com os mesmos `ARGON2_OPTIONS` de `authService.js`. Em uma única transação Prisma, atualizar somente `senhaHash` do administrador identificado e revogar todas as suas sessões. Preservar o usuário, seu perfil e os demais dados. Qualquer falha deve reverter a transação.
5. Reiniciar o serviço e conferir o novo login e a rejeição das sessões antigas. Registrar somente responsável, data e resultado da manutenção, sem senha, hash ou token.

Esse é um procedimento de manutenção que exige execução técnica autorizada; esta etapa não adiciona um comando de recuperação nem executa essa operação sobre o administrador existente.

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

O exemplo usa `HOST=127.0.0.1` para não expor o backend à rede local. Na hospedagem, ajuste `HOST` apenas conforme a exigência do provedor.

O navegador chama `/api/equipamentos` na mesma origem do frontend. O proxy local do Vite remove `/api` e encaminha a chamada ao endereço definido em `VITE_API_URL` no `.env` da raiz (padrão: `http://127.0.0.1:3000`). O exemplo existente `http://localhost:3000` também pode ser usado. Reinicie o Vite após alterar essa configuração. O backend continua expondo `/equipamentos`, sem alteração de CORS.

O proxy também está configurado no `npm.cmd --prefix frontend run preview`. Para hospedagem futura dos arquivos estáticos, será necessário configurar o servidor de hospedagem para encaminhar `/api` ao backend; esse proxy do Vite serve apenas ao desenvolvimento/preview. Não coloque credenciais em variáveis `VITE_`, pois elas são públicas.

### Interface de equipamentos

A página lista todos os equipamentos não arquivados, inclusive com contratos já vencidos. A pesquisa é enviada por “Pesquisar” ou Enter e pode ser limpa. Pesquisa, limite e ordenação voltam à primeira página quando alterados; os filtros são preservados ao sair do formulário. Requisições substituídas são canceladas e respostas antigas são ignoradas.

“Novo equipamento” abre o cadastro; “Editar” carrega o equipamento pela API. São obrigatórios serial, part number, cliente, distribuidor, início e término do OneCare. Patrimônio, nota fiscal, número do contrato e última conferência são opcionais; limpar um valor envia `null`. O serial é normalizado para maiúsculas. Somente campos editáveis são enviados e a API continua responsável pela unicidade e pelo histórico.

`distribuidor` recebe `trim`, preserva maiúsculas e minúsculas e admite até 255 caracteres. Não pode ser apagado na edição e pode se repetir entre equipamentos. `notaFiscal` também preserva a forma digitada após `trim`, admite até 100 caracteres, pode se repetir e é convertida para `null` quando ausente ou vazia. Os dois campos aparecem nas listagens ativa e de arquivados e podem ser usados na pesquisa e na ordenação. Eles não integram o histórico de contratos.

As datas da tabela são exibidas em `DD/MM/AAAA`. Os formulários usam controles nativos de data (a aparência depende do idioma do navegador), enviando `AAAA-MM-DD`, sem conversão de fuso. A interface apresenta carregamento, resultados vazios, erros com nova tentativa, conflitos próximos aos campos e confirmação de salvamento. Durante o envio, os controles são desabilitados.

“Arquivar” pede confirmação com o serial e retira logicamente o equipamento da listagem operacional. A área “Equipamentos arquivados” possui pesquisa, paginação e ordenação equivalentes, exibe a data do arquivamento e permite restaurar após confirmação. A interface bloqueia ações repetidas enquanto uma dessas operações está em andamento.

“Ver histórico” está disponível na listagem e na edição, para equipamentos ativos ou arquivados. A visualização mostra os valores anterior e novo de cada alteração contratual, do evento mais recente para o mais antigo, com paginação. Datas contratuais usam `DD/MM/AAAA`; o instante da substituição é apresentado no fuso `America/Fortaleza`.

A listagem operacional mostra o indicador textual `Ativo`, `Vencendo`, `Vencido` ou `Sem data de término`, acompanhado exclusivamente de `diasRestantes` recebido da API (`Vence em X dias`, `Vence hoje`, `Vencido há X dias` ou `Prazo não informado`). As cores reforçam o estado, mas o texto permanece visível e acessível. O frontend não calcula status, prazo ou fuso.

O filtro “Status OneCare” consulta o backend com `status=ATIVO`, `VENCENDO` ou `VENCIDO`; “Todos” remove o parâmetro. Alterar o filtro volta à página 1 e preserva pesquisa, limite e ordenação. “Equipamentos vencidos” abre uma tela específica que sempre consulta `GET /equipamentos?status=VENCIDO`, com pesquisa, paginação, ordenação, detalhes, edição, histórico e arquivamento. Equipamentos arquivados permanecem em sua área separada.

### Dashboard operacional

“Dashboard” abre a visão resumida alimentada por `GET /dashboard/resumo`. Os cards apresentam o total operacional, contratos ativos, vencendo e vencidos, equipamentos sem data de término e arquivados. Total, ativo, vencendo, vencido e arquivados funcionam como atalhos para as listagens correspondentes; o card sem data é apenas informativo porque ainda não existe esse filtro na API de equipamentos.

Os indicadores são calculados dinamicamente pelo backend com as mesmas regras de status e com a data civil de `America/Fortaleza`. Equipamentos arquivados não entram no total operacional nem nas categorias. “Próximos vencimentos” mostra até dez contratos `VENCENDO`, do término mais próximo ao mais distante; “Vencidos recentemente” mostra até dez contratos vencidos, do término mais recente ao mais antigo. As listas reutilizam os indicadores e os dias recebidos da API e permitem abrir os detalhes completos.

“Atualizar dashboard” realiza uma nova consulta. Durante a atualização, os dados anteriores permanecem visíveis; erros são apresentados de forma genérica e podem ser tentados novamente.

### Notificações internas

O backend verifica contratos ao iniciar e diariamente às 08:00 no fuso `America/Fortaleza`. Equipamentos ativos que estejam na janela `VENCENDO` recebem um aviso `ONECARE_VENCENDO`; os já vencidos recebem `ONECARE_VENCIDO`. Contratos ativos fora da janela, sem término ou pertencentes a equipamentos arquivados não geram novos avisos.

Cada evento é único por equipamento, tipo e data de término. Execuções repetidas ou concorrentes não duplicam avisos. Uma renovação altera a data que compõe a chave e poderá gerar novos avisos quando o contrato entrar novamente em `VENCENDO` ou `VENCIDO`. Notificações anteriores são preservadas mesmo após leitura, renovação ou arquivamento.

O botão “Notificações” mostra a contagem não lida quando maior que zero. A tela permite filtrar todas, lidas e não lidas, paginar, atualizar manualmente e marcar uma ou todas como lidas. O detalhe completo só pode ser aberto para equipamento ainda ativo; registros arquivados continuam identificados no aviso sem criar um link inválido. Não há polling, WebSocket, e-mail ou integração externa nesta etapa.

### Roteiro manual

1. Inicie backend e frontend nos dois terminais acima e abra `http://127.0.0.1:5173`.
2. Pesquise por um serial ou cliente, envie também com Enter, limpe a pesquisa e altere ordenação/limite. Havendo mais registros que o limite, navegue entre páginas.
3. Cadastre um equipamento exclusivo de teste com serial alfanumérico e datas válidas. Confira a confirmação e a atualização da lista; anote o serial criado.
4. Edite apenas esse registro de teste, limpe os opcionais e confira que aparecem como “—”. Tente serial inválido, datas invertidas e duplicidade com outro registro de teste, se houver.
5. Consulte o histórico pela listagem e pela edição. Altere os dados contratuais do registro de teste e confirme os valores anterior e novo.
6. Arquive o registro de teste após conferir o serial na confirmação. Abra “Equipamentos arquivados”, pesquise-o, confira a data de arquivamento e o histórico, e então restaure-o.
7. Durante salvamento, arquivamento ou restauração, confirme que os controles não permitem ações repetidas. Cancele um formulário e confira que os filtros continuam iguais.
8. Pare o backend, faça uma pesquisa e confira o erro. Reinicie-o e use “Tentar novamente”.
9. Use Tab/Enter para navegar e teste em janela estreita: formulário em uma coluna, botões acessíveis e tabela com rolagem horizontal.
10. Confira os quatro indicadores de status e suas frases de prazo; alterne o filtro e confirme que pesquisa e ordenação permanecem.
11. Abra “Equipamentos vencidos”, teste pesquisa/paginação/ordenação e edite somente um registro de teste; ao renovar o término, ele deve sair da tela após a nova consulta.
12. Abra “Dashboard”, compare os cards com as listagens filtradas, confira as duas listas e seus detalhes, teste os atalhos e use “Atualizar dashboard”.
13. Confirme que equipamentos arquivados aparecem somente no card próprio e não integram os indicadores operacionais.
14. Abra “Notificações”, confira a contagem, os filtros e a paginação, marque um aviso e depois todos como lidos. Confirme que avisos de equipamentos arquivados não oferecem acesso a um detalhe operacional.

Não altere equipamentos reais para esses testes. Registros criados manualmente permanecem no banco; a interface não realiza exclusão física.

## API de notificações

Endpoints internos implementados:

```http
GET   /notificacoes?page=1&limit=20&lida=false
GET   /notificacoes/nao-lidas/contagem
PATCH /notificacoes/:id/ler
PATCH /notificacoes/ler-todas
```

As notificações são restritas ao perfil `ADMIN`.

## API de autenticação e usuários

```text
GET   /auth/csrf
POST  /auth/login
GET   /auth/me
POST  /auth/logout
PATCH /auth/senha
GET   /usuarios
POST  /usuarios
PATCH /usuarios/:id/status
PATCH /usuarios/:id/senha
```

Somente `/health`, `/auth/csrf` e `/auth/login` são públicos. Rotas mutáveis exigem `Origin` permitido e o cabeçalho `x-csrf-token`. A administração de usuários é exclusiva do `ADMIN`; a API sempre cria novos usuários como `VISUALIZADOR`. Desativar um visualizador ou redefinir sua senha revoga todas as sessões dessa conta. O administrador único não pode ser desativado, ter a função alterada ou a senha redefinida por essas rotas.

`page` e `limit` usam os padrões `1` e `20`, com limite máximo `100`. O filtro `lida` aceita somente `true` ou `false`. A listagem usa `createdAt` decrescente e retorna `data`, `pagination` e a contagem global `unreadCount`. Marcar uma notificação já lida é idempotente; um ID inexistente retorna `404 NOTIFICACAO_NAO_ENCONTRADA`.

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
GET    /equipamentos/:id/historico-contratos
```

O cadastro utiliza propriedades em `camelCase`:

```json
{
  "serialNumber": "SN123456",
  "partNumber": "PN001",
  "cliente": "Cliente Exemplo",
  "distribuidor": "Distribuidor Exemplo",
  "patrimonio": "PAT001",
  "notaFiscal": "NF001",
  "contratoOnecare": "OC001",
  "dataInicioOnecare": "2026-01-01",
  "dataFimOnecare": "2026-12-31",
  "dataUltimaConferencia": "2026-09-04"
}
```

As datas da API utilizam `AAAA-MM-DD`. `distribuidor` é obrigatório. `patrimonio`, `notaFiscal`, `contratoOnecare` e `dataUltimaConferencia` são opcionais. A remoção é lógica e equipamentos arquivados não são retornados por `GET /equipamentos/:id`.

O patrimônio informado recebe `trim` e deve ser único globalmente, inclusive entre equipamentos arquivados. Valor vazio ou somente espaços vira `null`; vários equipamentos podem ficar sem patrimônio. O formato é preservado. Duplicidade no cadastro ou na edição retorna `409`, código `PATRIMONIO_DUPLICADO` e mensagem `Já existe um equipamento com esse patrimônio.`. A edição permite manter o próprio patrimônio. A futura importação por Excel deverá rejeitar patrimônios duplicados no sistema ou em outra linha válida da planilha.

A migration `20260908172841_unique_patrimonio` adiciona somente o índice `uq_equipamentos_patrimonio`. Antes de aplicá-la a uma base com dados, verifique duplicidades e resolva-as com autorização do responsável; a migration não apaga nem ajusta registros.

A migration `20260910120000_add_nota_fiscal_distribuidor` adiciona `nota_fiscal` opcional e `distribuidor` obrigatório, sem índices únicos nem valor padrão permanente. Para preservar registros anteriores, ela cria temporariamente `distribuidor` como anulável, preenche somente valores ausentes com `NÃO INFORMADO` e então aplica `NOT NULL`. Novos cadastros precisam informar o distribuidor explicitamente.

### Listagem, pesquisa, paginação e ordenação

`GET /equipamentos` retorna somente equipamentos não arquivados. Os parâmetros são opcionais:

- `q`: pesquisa parcial em `serialNumber`, `partNumber`, `patrimonio`, `notaFiscal`, `distribuidor`, `cliente` e `contratoOnecare`; espaços nas extremidades são ignorados;
- `page`: página atual, padrão `1`;
- `limit`: itens por página, padrão `20` e máximo `100`;
- `sortBy`: campo de ordenação, padrão `createdAt`;
- `order`: direção `asc` ou `desc`, padrão `desc`.
- `status`: filtro opcional com `ATIVO`, `VENCENDO` ou `VENCIDO`.

Os campos aceitos em `sortBy` são `serialNumber`, `partNumber`, `patrimonio`, `notaFiscal`, `distribuidor`, `cliente`, `contratoOnecare`, `dataInicioOnecare`, `dataFimOnecare`, `createdAt` e `updatedAt`.

Empates são resolvidos pelo ID, na mesma direção. `q` vazio ou somente com espaços não aplica pesquisa. Parâmetros inválidos, desconhecidos ou repetidos retornam `400 PARAMETRO_INVALIDO`, com mensagem e detalhes do campo. `page` deve ser um inteiro positivo representável com segurança em JavaScript; páginas além dos resultados retornam uma lista vazia.

Exemplo:

```http
GET /equipamentos?q=SN123&page=1&limit=20&sortBy=createdAt&order=desc
```

Para obter somente contratos vencidos:

```http
GET /equipamentos?status=VENCIDO&page=1&limit=20
```

O backend usa a data civil atual em `America/Fortaleza`. Um término anterior a hoje é `VENCIDO`; entre hoje e o limite de três meses corridos, inclusive, é `VENCENDO`; após o limite é `ATIVO`. O limite ajusta fins de mês para o último dia válido, em vez de usar 90 dias fixos. `diasRestantes` é positivo no futuro, zero no dia do vencimento e negativo depois dele.

`statusOnecare` e `diasRestantes` são calculados a cada resposta e não existem no banco. Eles são retornados na listagem, consulta por ID, cadastro e atualização. Se um equipamento não possuir data de término, ambos são `null`; ele permanece na listagem sem filtro e é excluído quando `status` for informado. O schema atual ainda exige as datas no cadastro, e nenhuma migration foi criada nesta etapa.

Exemplo dos campos calculados em um equipamento:

```json
{
  "dataFimOnecare": "2026-09-25",
  "statusOnecare": "VENCENDO",
  "diasRestantes": 15
}
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

`GET /equipamentos/arquivados` aceita os mesmos parâmetros e devolve o mesmo formato, considerando exclusivamente equipamentos arquivados. `DELETE /equipamentos/:id` realiza arquivamento lógico e `PATCH /equipamentos/:id/restaurar` devolve o registro à listagem operacional.

## API do dashboard

```http
GET /dashboard/resumo
```

A resposta contém `generatedAt`, os seis valores em `totals`, até dez itens em `proximosVencimentos` e até dez em `vencidosRecentes`. Os itens das listas expõem somente ID, serial, part number, cliente, distribuidor, contrato, término, status e dias restantes. As contagens e listas são consultadas em uma única transação de leitura; nenhum total ou status é persistido. Como o schema atual exige a data de término, `semDataTermino` é obtido pela diferença entre o total operacional e as três categorias, mantendo também o tratamento defensivo para dados sem classificação.

```json
{
  "generatedAt": "2026-09-11T10:00:00-03:00",
  "totals": {
    "totalEquipamentos": 100,
    "onecareAtivo": 60,
    "onecareVencendo": 20,
    "onecareVencido": 15,
    "semDataTermino": 5,
    "arquivados": 3
  },
  "proximosVencimentos": [],
  "vencidosRecentes": []
}
```

É sempre válida a relação `totalEquipamentos = onecareAtivo + onecareVencendo + onecareVencido + semDataTermino`.

### Histórico de contratos

`GET /equipamentos/:id/historico-contratos?page=1&limit=20` funciona para equipamentos ativos e arquivados. `page` tem padrão `1`; `limit` tem padrão `20` e máximo `100`. Os eventos são ordenados do mais recente para o mais antigo e retornam o formato:

```json
{
  "data": [
    {
      "id": 1,
      "anterior": {
        "contratoOnecare": "OC001",
        "dataInicioOnecare": "2026-01-01",
        "dataFimOnecare": "2026-12-31"
      },
      "novo": {
        "contratoOnecare": "OC002",
        "dataInicioOnecare": "2027-01-01",
        "dataFimOnecare": "2027-12-31"
      },
      "substituidoEm": "2026-09-09T12:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

Uma página válida sem eventos retorna `data` vazio. Equipamento inexistente retorna `404`; parâmetros inválidos, desconhecidos ou repetidos retornam `400 PARAMETRO_INVALIDO`. A consulta é somente leitura: o histórico continua sendo gravado apenas quando uma edição realmente modifica número ou datas do contrato.

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

Os testes de integração usam exclusivamente o banco de desenvolvimento `ZebraOneCare` configurado no `.env`. Exercitam cadastro, consulta, edição, histórico, arquivamento, listagem de arquivados, restauração, nota fiscal e distribuidor repetíveis, reserva de patrimônio em arquivados, múltiplos `NULL` e rejeição de duplicidade pelo índice real. As transações fazem rollback ao final, sem manter equipamentos de teste nem apagar registros existentes; podem ocorrer lacunas normais nos IDs auto-incrementais. O build do backend verifica a sintaxe dos arquivos JavaScript. O frontend gera os arquivos de produção em `frontend/dist`.

### Dependências e auditoria — checkpoint 3D.1

Diagnóstico online em 10/09/2026: `npm.cmd --prefix backend audit` e a variante `--omit=dev` apontaram 6 pacotes afetados (1 moderado e 5 altos). `npm explain` confirmou as cadeias abaixo; as versões dos filhos estavam fixadas exatamente pelos respectivos pais.

| Dependência | Pacote pai e restrição original | Instalada antes | Mínima corrigida | Versão adotada |
|---|---|---|---|---|
| `mariadb` | `@prisma/adapter-mariadb@7.10.0` → `3.4.5` | 3.4.5 | 3.4.6 na linha 3.4 | 3.4.7 |
| `mysql2` | `prisma@7.10.0` → `3.15.3` | 3.15.3 | 3.23.1 para todos os avisos detectados | 3.23.1 |
| `deepmerge-ts` | `prisma@7.10.0` → `@prisma/config@7.10.0` → `7.1.5` | 7.1.5 | 8.0.0 | 8.0.0 |

Referências das correções: [MariaDB](https://github.com/advisories/GHSA-cqhc-2h57-wpxf), [mysql2](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3) e [deepmerge-ts](https://github.com/advisories/GHSA-ggr8-5vv4-36mx). A versão MariaDB 3.4.6 indicada pelo aviso não estava disponível no registro npm consultado; 3.4.7 estava disponível na mesma linha de manutenção.

`mariadb` é usado pelo adaptador em execução. Embora `prisma` esteja declarado em `devDependencies`, ele também é um peer opcional de `@prisma/client`; nesta árvore, `mysql2` e `deepmerge-ts` permanecem incluídos na auditoria de produção. Não são classificados como exclusivamente de desenvolvimento. A conexão da API utiliza `mariadb`, não `mysql2`.

`npm outdated` e a consulta às versões publicadas da linha 7 confirmaram 7.10.0 como a versão estável mais recente disponível nessa linha. O `latest` de `prisma` apontava para 8.0.0-rc.13, que não foi adotado. Prisma Client, CLI e adaptador permaneceram alinhados em 7.10.0, sem downgrade.

Os `overrides` em `backend/package.json` substituem apenas `mariadb` sob o adaptador, `mysql2` sob o Prisma e `deepmerge-ts` sob `@prisma/config@7.10.0`. Os dois primeiros corrigem drivers transitivos fixados pelos pais; o terceiro foi necessário porque não havia atualização oficial corrigida do pai na linha 7. A compatibilidade do major 8 de `deepmerge-ts` foi verificada pelo carregamento da configuração, validate, generate, migrate status e pelos testes com MySQL real. Revise esses overrides quando atualizar o Prisma; remova-os somente quando os pais adotarem versões corrigidas e as verificações passarem.

Verificações finais desse checkpoint: auditorias completas de backend e frontend e auditoria de produção do backend com **zero vulnerabilidades reportadas**; 118 testes de backend e 37 de frontend aprovados. Os 4 testes dependentes do banco, pulados na suíte comum, passaram na execução de integração (5 testes aprovados ao todo). Lint, build, geração do Client, validação do schema e estado das 3 migrations também passaram. POST e GET foram exercitados via Fastify `inject` com MySQL real em transações revertidas, sem persistir equipamentos de teste. Nenhuma migration foi reaplicada durante a correção das dependências.

Para repetir as auditorias, com acesso ao registro npm:

```powershell
npm.cmd --prefix backend audit
npm.cmd --prefix backend audit --omit=dev
npm.cmd --prefix frontend audit
```

Auditoria sem acesso à rede/cache confiável não comprova ausência de vulnerabilidades. Não use `npm audit fix --force` para contornar os avisos: no diagnóstico, ele sugeria downgrade incompatível para Prisma 6.

A instalação apresentou um aviso `allow-scripts` sobre scripts de `prisma` e `@prisma/engines` sem aprovação cadastrada no npm. A política não foi alterada nem o aviso suprimido; os comandos explícitos de geração e verificação do Prisma funcionaram neste ambiente. Uma instalação nova deve revisar esses scripts se necessário. Falhas iniciais `EPERM` do sandbox foram resolvidas repetindo as verificações com autorização fora dele.

## Importação Excel — Etapa 3E

Use “Importar Excel” na listagem ativa. Somente `.xlsx`, primeira aba, cabeçalho na primeira linha; máximo de 10 MB e 10.000 linhas após o cabeçalho. O arquivo é processado em memória e nunca armazenado no servidor. A planilha de referência não faz parte do repositório e seus dados não são usados nos testes.

| Coluna Zebra | Campo |
|---|---|
| Contract Name | contratoOnecare (opcional) |
| Distributor Name | distribuidor |
| End User Name | cliente |
| Contract Start Date | dataInicioOnecare |
| Contract End Date | dataFimOnecare |
| Product Family | partNumber |
| Serial # | serialNumber |

Exceto Contract Name, essas colunas e seus valores são obrigatórios. Cabeçalhos recebem trim, espaços repetidos são reduzidos a um e diferenças de caixa são ignoradas, preservando `#`. `End User  Name` também é aceito. Colunas mapeadas repetidas são rejeitadas. `Contract Status`, `Reseller Name` e `Quantity` são ignorados; outras colunas geram aviso. Quantity não multiplica equipamentos: uma linha não vazia cria um equipamento.

Patrimônio, nota fiscal e última conferência são `null`. O contrato vem de cada linha, nunca do nome do arquivo. Textos recebem trim e o serial é normalizado para maiúsculas. Datas aceitam células Excel, `DD/MM/AAAA` ou `AAAA-MM-DD`, sem deslocar o dia por fuso. Datas inválidas, fórmulas nos campos importados e duplicidades bloqueiam o arquivo inteiro, inclusive seriais de arquivados. Não há importação parcial, sobrescrita, restauração, histórico ou notificações.

Endpoints, ambos com um único arquivo no campo multipart `arquivo`:

```http
POST /equipamentos/importacao/validar
POST /equipamentos/importacao/confirmar
```

Validar retorna 200 com `summary`, `warnings` e `rows`, sem escrever no banco. Linhas trazem número original, dados, `VALID`/`INVALID` e erros por campo. Confirmar reenvia o mesmo arquivo e repete as verificações. Erros de linha retornam 422; conflitos concorrentes, 409. Qualquer falha reverte todas as inserções. Sucesso retorna 201 com `summary.importedRows`. Consultas e inserções usam lotes de até 500; as inserções pertencem a uma única transação. Não foi necessária nova migration.

A interface invalida a prévia ao trocar o arquivo, bloqueia cliques repetidos e só habilita confirmação sem erros. A prévia tem filtros e páginas de 50 linhas. Em queda de conexão na confirmação, confira a listagem e valide novamente antes de repetir: a gravação pode ter terminado sem a resposta chegar.

Dependências locais de produção: [`@fastify/multipart`](https://github.com/fastify/fastify-multipart) para upload; [`read-excel-file`](https://github.com/catamphetamine/read-excel-file) para leitura; `fflate` e `fast-xml-parser` para verificar ZIP/XML, fórmulas e proteção antes da leitura. [`write-excel-file`](https://github.com/catamphetamine/write-excel-file) é somente de desenvolvimento, gerando fixtures fictícias em memória (também utilizadas pelos testes frontend). Instale as dependências do backend antes de executar a suíte do frontend.

Proteções adicionais: rejeição de arquivos corrompidos/protegidos, macros, links externos e DTD; leitura em worker de até 15 segundos, heap de 128 MB; até duas importações simultâneas por instância (429 para excedentes). Limites ZIP: 50 MB descompactados, 20 MB por entrada, 1.000 entradas e 256 colunas. São permitidas 10.000 linhas não vazias; para conter matrizes artificialmente esparsas, a região física é limitada às primeiras 100.001 linhas, inclusive cabeçalho. `IMPORT_MAX_FILE_SIZE_MB` e `IMPORT_MAX_ROWS` permitem diminuir os limites máximos. Detalhes de conflitos mostram até 50 linhas relacionadas por ocorrência, com contagem e indicação de truncamento, mantendo todas as linhas da prévia. Valores inválidos exibidos são limitados a 300 caracteres. Identificadores numéricos são expandidos sem notação científica; dígitos já perdidos na origem não são recuperáveis, portanto prefira serial como texto no Excel.

### Testes da importação e roteiro manual

A validação deve ser enviada por `POST` pela interface “Importar Excel”; abrir a URL `/equipamentos/importacao/validar` na barra do navegador envia `GET` e retorna 404. Após atualizar o backend, reinicie `npm.cmd run dev:backend`. A suíte inclui regressão da leitura do Excel com `node --watch`, ignorando mensagens internas do monitoramento sem perder o resultado ou os erros do worker.

`npm.cmd test` inclui testes da importação com planilhas geradas em memória. `npm.cmd run test:integration` verifica prévia sem escrita, confirmação e conflito real pelo índice MySQL. Uma transação externa faz rollback de todos os dados fictícios; podem existir lacunas normais nos IDs. Não utiliza nem altera equipamentos reais.

Para conferência manual, crie uma planilha **fictícia** com os cabeçalhos acima e duas linhas: seriais `EXCELMANUAL001`/`EXCELMANUAL002`, clientes e distribuidores de teste, contratos `CONTRATO-FICTICIO-A`/`CONTRATO-FICTICIO-B`, produto `MODELO-TESTE`, início `01/01/2026` e término `01/01/2027`.

1. Use dois espaços em `End User  Name`; valide e confira duas linhas válidas, contratos diferentes e nenhuma escrita antes da confirmação.
2. Faça variações com serial repetido, distribuidor vazio e data `31/02/2026`; confira erros e confirmação bloqueada.
3. Acrescente uma coluna desconhecida e confira o aviso; experimente filtros e troque o arquivo para invalidar a prévia.
4. Confirme somente o arquivo fictício válido e confira a quantidade na mensagem e a atualização da listagem.
5. Reenvie o mesmo arquivo: os seriais existentes devem bloquear uma nova importação. Não exclua registros para repetir o teste sem autorização.

Registros de uma confirmação manual permanecem no banco. Não use a planilha real de referência para esse roteiro. A importação exige uma sessão de administrador e proteção CSRF válida.

Verificação do checkpoint 3E: 149 testes de backend e 46 de frontend aprovados; os 5 testes dependentes do banco pulados na suíte comum passaram na suíte de integração (6 testes ao todo). Foram exercitados 10.000 registros válidos e 10.000 duplicados, múltiplas abas, fórmulas, proteção, macros, limites ZIP e concorrência. Lint, build, Prisma validate/generate e as 3 migrations existentes passaram; auditorias completas e de produção do backend/frontend reportaram zero vulnerabilidades. Nenhuma fixture permaneceu no MySQL ou como arquivo XLSX no repositório. A revisão visual no navegador não foi realizada porque não havia navegador conectado; os testes da interface usam componentes e respostas HTTP simuladas.

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
