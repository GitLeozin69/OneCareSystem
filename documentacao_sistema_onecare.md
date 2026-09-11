# Especificação do Sistema OneCare

## 1. Objetivo

Desenvolver um sistema web para controle de equipamentos vinculados a contratos OneCare.

O sistema deve permitir cadastrar equipamentos, acompanhar os contratos, visualizar os prazos de cobertura, identificar contratos próximos do vencimento e centralizar as informações necessárias para consulta e gestão.

O projeto deve ser desenvolvido de forma organizada, modular e preparada para futuras expansões.

## 2. Objetivos principais

O sistema deverá permitir:

1. Cadastrar equipamentos.
2. Alterar informações dos equipamentos.
3. Excluir equipamentos.
4. Consultar equipamentos.
5. Pesquisar por número de série, part number, cliente, patrimônio, nota fiscal, distribuidor e contrato.
6. Controlar início e término do contrato OneCare.
7. Exibir quanto tempo falta para o vencimento.
8. Identificar contratos vencidos.
9. Identificar contratos próximos do vencimento.
10. Gerar notificações quando faltarem 3 meses corridos ou menos para o vencimento.
11. Exibir indicadores gerais em um dashboard.
12. Manter informações de criação e alteração dos registros.
13. Possibilitar futuras integrações e expansão do sistema.

## 3. Tecnologias

### Backend
- Node.js
- Fastify
- Prisma ORM
- MySQL

### Frontend
- React
- Vite
- Tailwind CSS
- JavaScript

Não utilizar TypeScript na V1.
Não utilizar frameworks CSS como Bootstrap ou Material UI na V1, salvo autorização explícita.

### Controle de versão
- Git
- GitHub

### Desenvolvimento
O projeto deve ser compatível com Windows 11 e funcionar adequadamente pelo terminal integrado do VS Code.

Devem ser utilizadas versões estáveis e mutuamente compatíveis do Node.js, Fastify, Prisma, MySQL, React, Vite e Tailwind CSS. A escolha exata das versões será feita durante a configuração inicial, priorizando execução local e portabilidade futura para serviços de hospedagem como Railway ou equivalente.

## 4. Estrutura esperada do projeto

```text
onecare-system/
│
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── utils/
│   │   ├── middlewares/
│   │   └── server.*
│   │
│   ├── prisma/
│   │   └── schema.prisma
│   │
│   ├── package.json
│   └── .env
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── hooks/
│   │   └── App.*
│   │
│   ├── package.json
│   └── vite.config.*
│
├── README.md
├── AGENTS.md
├── .gitignore
└── documentacao_sistema_onecare.md
```

A estrutura pode ser ajustada pelo agente quando houver uma justificativa técnica clara.

## 5. Cadastro de equipamentos

Cada equipamento deverá possuir, no mínimo:

| Campo | Descrição | Obrigatório |
|---|---|---|
| ID | Identificador interno | Sim |
| Número de Série | Serial Number do equipamento | Sim |
| Part Number | Modelo/código do fabricante | Sim |
| Cliente | Cliente ao qual o equipamento está vinculado | Sim |
| Patrimônio | Número de patrimônio do cliente | Não |
| Nota fiscal | Identificação textual da nota fiscal | Não |
| Distribuidor | Distribuidor responsável pelo equipamento | Sim |
| Contrato OneCare | Número do contrato | Não |
| Data de início OneCare | Início da cobertura | Sim |
| Data de término OneCare | Final da cobertura | Sim |
| Data da última conferência | Quando os dados foram conferidos na fonte original | Não |
| Arquivado | Indica se o equipamento foi retirado das listagens operacionais | Automático |
| Data de arquivamento | Data em que o equipamento foi arquivado | Automático |
| Data de criação | Data de criação do registro | Automático |
| Data de atualização | Data da última alteração | Automático |

### Regras
- O número de série deve ser único.
- O patrimônio é opcional; quando informado, deve ser único globalmente, inclusive entre equipamentos arquivados. Aplicar `trim` e converter texto vazio ou somente espaços para `null`. Vários equipamentos podem ter patrimônio `null`; não há nova restrição de formato.
- A nota fiscal é opcional, não é única, admite até 100 caracteres, recebe `trim` e é convertida para `null` quando ausente, vazia ou somente com espaços.
- O distribuidor é obrigatório, não é único, admite até 255 caracteres, recebe `trim` e não aceita valor ausente, `null`, vazio ou somente com espaços.
- Nota fiscal e distribuidor preservam maiúsculas e minúsculas informadas pelo usuário após a remoção dos espaços externos.
- O número de série deve ser normalizado para maiúsculas e aceitar somente letras de `A` a `Z` e números de `0` a `9`, sem espaços ou caracteres especiais.
- O número do contrato OneCare é opcional tanto no cadastro manual quanto na importação.
- A data de término não pode ser anterior à data de início.
- Campos obrigatórios devem ser validados no backend.
- O frontend também deve apresentar validações para melhorar a experiência do usuário.
- O banco deve utilizar tipos apropriados para datas.
- Não armazenar no banco valores que podem ser calculados dinamicamente, como dias restantes.

## 6. Modelo da relação entre equipamento e contrato

### Escopo da V1

Na primeira versão, somente equipamentos que possuem ou já possuíram cobertura OneCare serão cadastrados. Cada equipamento possui **um contrato OneCare principal por vez**. O número do contrato e as datas ficam diretamente no cadastro do equipamento.

O cadastro e a conferência dos dados serão manuais. A V1 também deverá permitir a importação de equipamentos por planilha Excel (`.xlsx`). Não haverá integração automática com a Zebra nesta versão.

O campo opcional `data_ultima_conferencia` informa quando alguém conferiu os dados do contrato na planilha, no portal ou em outra fonte original. Ele não altera o status do contrato e serve apenas para indicar quão recente é a informação.

### Histórico simples

Quando o número ou as datas do contrato forem alterados, o backend deverá copiar automaticamente os dados anteriores para uma tabela de histórico antes de salvar a alteração. O usuário continuará vendo apenas o contrato atual na tela principal, mas poderá consultar os contratos anteriores na visualização do equipamento.

O histórico somente deve ser criado quando houver uma alteração real em `contrato_onecare`, `data_inicio_onecare` ou `data_fim_onecare`. Alterações em outros campos, ou o envio dos mesmos valores já persistidos, não devem criar entradas de histórico.

Não será necessário criar um CRUD separado e completo de contratos na V1.

## 7. Status do contrato

O status deve ser calculado pelo backend com base na **data atual do servidor** e na data de término do contrato.

Todas as datas de negócio devem considerar o fuso horário `America/Fortaleza`. Datas de cobertura representam dias civis, sem influência do horário UTC.

A regra oficial é:

```text
Se data_fim < data_atual:
    VENCIDO

Se data_fim >= data_atual
e data_fim <= data_atual + 3 meses corridos:
    VENCENDO

Se data_fim > data_atual + 3 meses corridos:
    ATIVO
```

### Definição de 3 meses

“3 meses” significa **3 meses corridos no calendário**, e não uma conversão fixa de 90 dias.

Quando a data atual estiver no final de um mês e o mês resultante não possuir o mesmo número de dia, o limite deve ser ajustado para o último dia válido do mês de destino, sem transbordar para o mês seguinte.

Exemplo:

```text
Data atual: 10/09/2026
Limite de 3 meses: 10/12/2026
```

O sistema deve utilizar operações de data apropriadas para respeitar a duração real dos meses.

### Dia do vencimento

No próprio dia da data de término, o contrato ainda é considerado `VENCENDO`. A partir do dia seguinte, passa a ser `VENCIDO`. O horário não deve alterar essa regra.

No dia do vencimento, o contador deve apresentar `0 dias restantes`.

### Fonte oficial

O backend é a fonte oficial do status. O frontend apenas apresenta o status recebido e pode atualizar o contador visualmente.

Na Etapa 4A, `statusOnecare` é calculado dinamicamente nas respostas da API e nunca persistido. Se `dataFimOnecare` não existir, `statusOnecare` e `diasRestantes` serão `null`; o equipamento continuará na listagem geral, mas será excluído quando um status específico for filtrado. O schema atual mantém as datas contratuais obrigatórias, portanto esse tratamento é defensivo e não altera o cadastro nem exige migration.

## 8. Contador de vencimento

O sistema deve mostrar:
- Data de término do OneCare.
- Quantidade de dias restantes.
- Informação amigável sobre o tempo restante.

Exemplos:

```text
182 dias restantes
5 meses restantes
Vencido há 12 dias
```

A forma de exibição pode ser melhorada conforme a interface evoluir.

### Regra importante

O contador NÃO deve ser armazenado no banco de dados.

Deve ser calculado a partir de:

```text
data_fim_onecare - data_atual
```

`diasRestantes` representa dias de calendário: é positivo para vencimentos futuros, `0` no próprio dia e negativo após o vencimento. O cálculo usa a data civil de `America/Fortaleza`, sem depender da hora UTC, e retorna `null` quando não houver data de término.

Na interface e nas planilhas, as datas devem ser apresentadas no formato `DD/MM/AAAA`. Na comunicação interna da API e na persistência, devem utilizar o formato não ambíguo `AAAA-MM-DD`, mantendo o tipo `DATE` no MySQL. Conversões não devem deslocar o dia por influência de UTC.

## 9. Rotina automática de verificação

O backend deverá possuir uma rotina automática para verificar contratos próximos do vencimento.

Essa rotina será responsável por:

1. consultar os equipamentos;
2. calcular a situação de cada contrato;
3. identificar os que entraram na janela de 3 meses;
4. criar as notificações necessárias;
5. evitar duplicações.

Equipamentos arquivados não devem ser processados pela rotina.

A rotina deverá ser executada periodicamente pelo servidor, pelo menos uma vez por dia. A implementação pode utilizar um scheduler/cron apropriado para Node.js.

Na V1, a rotina deverá executar também na inicialização do backend, para que contratos que já estejam dentro da janela de três meses sejam identificados imediatamente. A execução diária será feita pelo próprio backend, considerando inicialmente uma única instância do servidor.

A restrição única das notificações no banco continuará sendo obrigatória. Ela impedirá duplicações caso a rotina seja executada mais de uma vez. Se a aplicação for futuramente escalada para múltiplas instâncias, o agendamento deverá ser movido para um processo exclusivo ou para um serviço externo de tarefas agendadas.

## 10. Alerta de 3 meses

O sistema deverá identificar contratos próximos do vencimento.

Quando o contrato entrar na janela de 3 meses corridos restantes, o sistema deverá gerar uma notificação.

Na primeira execução da rotina, também devem ser notificados todos os equipamentos não arquivados cujo contrato ainda não venceu e termine entre a data atual e o limite de três meses corridos, inclusive. Contratos já vencidos não devem gerar uma notificação do tipo `ONECARE_3_MESES`.

Essa notificação não deve ser criada repetidamente todos os dias.

Deve existir mecanismo para evitar duplicação.

A chave do evento deve incluir a data de término do contrato. Exemplo:

```text
ONECARE_3_MESES:2026-12-15
```

Assim, uma renovação poderá gerar uma nova notificação sem duplicar alertas do mesmo vencimento.

Exemplo:

```text
Equipamento SN123456 está com o contrato OneCare próximo do vencimento.
Vencimento: 15/12/2026.
```

## 11. Notificações

Criar uma tabela de notificações relacionada aos equipamentos.

Estrutura mínima:

```text
id
equipamento_id
tipo
mensagem
lida
created_at
```

Tipos poderão incluir futuramente:

```text
ONECARE_3_MESES
ONECARE_30_DIAS
ONECARE_VENCIDO
```

Inicialmente, implementar pelo menos:

```text
ONECARE_3_MESES
```

### Comportamento
- Notificações podem ser marcadas como lidas.
- Notificações não devem ser duplicadas para o mesmo evento.
- O sistema deve possuir endpoint para listar notificações.
- O sistema deve possuir endpoint para marcar notificação como lida.

## 12. Dashboard

Criar uma página inicial com visão geral dos contratos.

O dashboard deve apresentar pelo menos:

### Total de equipamentos
Quantidade total cadastrada.

### OneCare ativos
Quantidade de contratos ativos.

### OneCare vencendo
Quantidade de contratos com até 3 meses restantes.

### OneCare vencido
Quantidade de contratos vencidos.

### Vencimento em até 30 dias
Quantidade de contratos que vencem nos próximos 30 dias.

Também pode existir uma área com:
- notificações recentes;
- próximos vencimentos;
- últimos equipamentos cadastrados.

Por padrão, os indicadores devem considerar apenas equipamentos não arquivados.

## 13. Tela de equipamentos

Criar uma tela de listagem dos equipamentos.

Na Etapa 3C, a interface apresenta os não arquivados, inclusive contratos vencidos, com pesquisa, ordenação, paginação, cadastro e edição integrados à API. Os campos opcionais sem valor aparecem como “—”. As datas são exibidas em `DD/MM/AAAA`, mantendo `AAAA-MM-DD` na comunicação com o backend. Status e indicadores de vencimento permanecem reservados à Etapa 4.

Na Etapa 3D, a listagem operacional permite arquivar com confirmação explícita contendo o serial. A área `Equipamentos arquivados` reutiliza pesquisa, paginação e ordenação, informa a data do arquivamento e permite restaurar após confirmação. A interface impede ações repetidas durante arquivamento e restauração e atualiza a página atual sem recarregar o navegador.

O histórico de contratos pode ser aberto na listagem ou na edição e funciona para equipamentos ativos e arquivados. Cada evento identifica explicitamente os valores anterior e novo, do mais recente para o mais antigo. Datas contratuais são exibidas em `DD/MM/AAAA` e o instante da substituição no fuso `America/Fortaleza`.

No checkpoint 3D.1, nota fiscal e distribuidor passam a integrar cadastro, edição, consulta e listagens ativa e de arquivados. Esses campos não fazem parte do histórico contratual. A tabela permanece responsiva por meio de rolagem horizontal.

Na Etapa 4B, a listagem operacional apresenta o status textual e os dias restantes fornecidos pelo backend. `Ativo`, `Vencendo`, `Vencido` e `Sem data de término` possuem indicadores visuais distintos sem depender apenas de cor. As frases de prazo são `Vence em X dias`, `Vence hoje`, `Vencido há X dias` e `Prazo não informado`. O frontend não recalcula esses valores.

O filtro visual envia `status` ao backend, volta à primeira página e preserva pesquisa, limite e ordenação. A opção `Todos` remove o parâmetro. A tela `Equipamentos vencidos` reutiliza a listagem com `status=VENCIDO`, oferecendo pesquisa, paginação, ordenação, detalhes, edição, histórico e arquivamento; os arquivados continuam separados.

Além da listagem principal, criar uma visualização ou filtro específico chamado `Vencidos`, contendo os equipamentos cujo OneCare já terminou.

A tabela deve permitir visualizar, no mínimo:
- Número de série
- Part Number
- Cliente
- Distribuidor
- Patrimônio
- Nota fiscal
- Contrato OneCare
- Data de início
- Data de término
- Dias restantes
- Status
- Ações

As ações devem incluir:

```text
Visualizar
Editar
Excluir
```

## 14. Pesquisa, filtros e paginação

A listagem operacional está disponível em:

```http
GET /equipamentos?q=SN123&page=1&limit=20&sortBy=createdAt&order=desc
```

Os parâmetros são opcionais:

- `q`: pesquisa textual parcial;
- `page`: página atual, padrão `1`;
- `limit`: quantidade por página, padrão `20` e máximo `100`;
- `sortBy`: campo de ordenação, padrão `createdAt`;
- `order`: direção da ordenação, padrão `desc`.
- `status`: situação calculada, aceitando somente `ATIVO`, `VENCENDO` ou `VENCIDO`.

A pesquisa por `q` remove espaços das extremidades e consulta os campos `serialNumber`, `partNumber`, `patrimonio`, `notaFiscal`, `distribuidor`, `cliente` e `contratoOnecare`. Valor vazio ou contendo somente espaços equivale a não informar a pesquisa.

Os campos permitidos em `sortBy` são:

- `serialNumber`;
- `partNumber`;
- `patrimonio`;
- `notaFiscal`;
- `distribuidor`;
- `cliente`;
- `contratoOnecare`;
- `dataInicioOnecare`;
- `dataFimOnecare`;
- `createdAt`;
- `updatedAt`.

`order` aceita somente `asc` ou `desc`. `status` aceita exatamente os três valores em maiúsculas. `page` deve ser um inteiro maior ou igual a `1`, e `limit` deve ser um inteiro entre `1` e `100`. Parâmetros inválidos retornam HTTP `400`.

Empates são resolvidos pelo ID na mesma direção da ordenação. `page` deve ser representável com segurança como inteiro em JavaScript. Parâmetros inválidos, desconhecidos ou repetidos retornam código `PARAMETRO_INVALIDO`, mensagem e detalhes do campo.

Registros arquivados ficam fora da listagem e de sua contagem. Uma página válida sem registros retorna `data` vazio. O formato da resposta é:

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

`GET /equipamentos/arquivados` mantém os mesmos parâmetros de pesquisa, paginação e ordenação e retorna o mesmo formato, considerando somente registros arquivados. O filtro `status` desta etapa pertence apenas à listagem operacional `GET /equipamentos`.

Na Etapa 4A, `GET /equipamentos?status=VENCIDO&page=1&limit=20` aplica a faixa de datas diretamente na consulta Prisma, antes da paginação, e combina o filtro com pesquisa e ordenação. `total` e `totalPages` consideram somente o status escolhido. Sem `status`, todos os equipamentos não arquivados continuam na listagem. A apresentação visual e a tela de vencidos permanecem fora desta etapa.

## 15. Cadastro e edição

Criar formulário para cadastrar equipamento.

Campos:

```text
Número de Série
Part Number
Cliente
Distribuidor
Patrimônio
Nota fiscal
Contrato OneCare
Data de início
Data de término
```

O mesmo formulário pode ser reutilizado para edição.

Na interface, o formulário inclui também a última conferência opcional. Serial, part number, cliente, distribuidor e as duas datas de cobertura são obrigatórios. Patrimônio, nota fiscal, contrato e última conferência são opcionais; campos opcionais limpos são enviados como `null`. O formulário mantém os dados digitados em caso de erro, apresenta mensagens próximas aos campos e bloqueia envios repetidos durante o salvamento. Ao salvar ou cancelar, pesquisa e ordenação da listagem são preservadas. Na Etapa 3D, a edição também oferece acesso somente para leitura ao histórico mantido pelo backend.

Antes de salvar:
- Validar campos obrigatórios.
- Validar formato de dados.
- Validar datas.
- Validar número de série duplicado.
- Validar patrimônio duplicado, incluindo equipamentos arquivados e desconsiderando o próprio equipamento na edição.
- Converter o número de série para maiúsculas antes da validação e persistência.
- Rejeitar número de série com espaços ou caracteres diferentes de `A-Z` e `0-9`.

## 16. Importação por Excel

Na Etapa 3E, somente o formato Zebra abaixo é aceito em `.xlsx`. Esta definição substitui a previsão anterior de cabeçalhos snake_case e importação parcial: **qualquer linha inválida bloqueia todo o arquivo**.

| Cabeçalho | Campo da API | Obrigatório |
|---|---|---|
| Contract Name | contratoOnecare | Não |
| Distributor Name | distribuidor | Sim |
| End User Name | cliente | Sim |
| Contract Start Date | dataInicioOnecare | Sim |
| Contract End Date | dataFimOnecare | Sim |
| Product Family | partNumber | Sim |
| Serial # | serialNumber | Sim |

Cabeçalho na primeira linha da primeira aba. Normalização: trim, espaços internos repetidos reduzidos a um, caixa ignorada e símbolos preservados. `End User  Name` equivale a `End User Name`. Colunas obrigatórias ausentes ou colunas mapeadas repetidas bloqueiam o arquivo. `Contract Status`, `Reseller Name` e `Quantity` são ignorados; outras colunas geram aviso e também são ignoradas. Cada linha não vazia cria um equipamento, independentemente de Quantity.

Contrato é preservado por linha e pode variar dentro do arquivo. Nenhum campo é extraído do nome do arquivo. `patrimonio`, `notaFiscal` e `dataUltimaConferencia` são sempre `null` nessa origem, não inventados ou deduzidos. Nota fiscal e distribuidor não possuem unicidade. Uma origem futura que forneça patrimônio deverá normalizá-lo como no cadastro manual, conferir conflitos em lote e bloquear duplicidades, inclusive de arquivados.

As validações são compartilhadas com o cadastro manual: trim, serial em maiúsculas com apenas A-Z e números, obrigatoriedade, limites de texto e início não posterior ao término. Seriais numéricos são convertidos para texto decimal sem notação científica nem conversão intermediária para Number. Dígitos já perdidos no próprio Excel não podem ser recuperados; identificadores longos ou com zeros iniciais devem ser armazenados como texto na origem.

Datas aceitas: células reais de data Excel, `DD/MM/AAAA` e `AAAA-MM-DD`. A API recebe `AAAA-MM-DD`; datas inexistentes ou formatos ambíguos são rejeitados, incluindo o dia fictício 29/02/1900 do Excel. A conversão preserva o dia civil, sem deslocamento por UTC, respeitando `America/Fortaleza`.

Qualquer serial repetido no arquivo ou existente no banco bloqueia a confirmação, inclusive de arquivados. Não há importação parcial, atualização ou restauração automática. Consultas de conflitos são feitas em lotes de até 500 linhas, sem consulta por equipamento.

A importação usa dois endpoints:

```http
POST /equipamentos/importacao/validar
POST /equipamentos/importacao/confirmar
```

Ambos recebem `multipart/form-data`, com um único arquivo no campo `arquivo`, sem outros campos. Validar retorna HTTP 200 com `summary` (`totalRows`, `validRows`, `invalidRows`, `canImport`), `warnings` e `rows`. Cada linha informa `rowNumber`, `status` (`VALID` ou `INVALID`, situação da validação, não do contrato), `data` e `errors`. Erros informam linha, campo, código, valor e mensagem. Duplicidades internas incluem até 50 `conflictingRows` por ocorrência, `conflictingRowCount` e `conflictingRowsTruncated`; todas as linhas inválidas continuam na prévia. Esse limite evita respostas de tamanho quadrático com milhares de repetições.

Validar nunca escreve no banco. Confirmar recebe novamente o arquivo e repete toda a validação. Linhas inválidas retornam 422 `IMPORTACAO_INVALIDA` com detalhes por linha, sem gravar. Arquivos estruturalmente inválidos retornam erro padronizado em vez de prévia. A confirmação válida insere lotes de até 500 dentro de uma única transação, sem `skipDuplicates`, histórico ou notificações. Qualquer falha reverte tudo. O índice MySQL arbitra conflitos concorrentes; 409 `IMPORTACAO_CONFLITO` exige nova validação. Sucesso retorna 201, mensagem e `summary` com `totalRows` e `importedRows`.

Limites: 10 MB e 10.000 linhas não vazias após o cabeçalho. `IMPORT_MAX_FILE_SIZE_MB` e `IMPORT_MAX_ROWS` podem reduzir, mas não ampliar esses tetos. Linhas completamente vazias são ignoradas, preservando o número original. Como proteção contra matrizes artificialmente esparsas, a região física de leitura é limitada às primeiras 100.001 linhas, inclusive cabeçalho.

Segurança: verificar ZIP e tipo OOXML real; rejeitar arquivo vazio, corrompido, protegido, macros, links externos, DTD/entidades XML e fórmulas nos campos importados. Nada é executado ou salvo permanentemente; conteúdo da planilha não entra nos logs. Leitura em worker com limite de 15 segundos e heap de 128 MB; pacote descompactado até 50 MB, cada entrada até 20 MB, até 1.000 entradas e 256 colunas. Dimensões artificiais fora da região são rejeitadas. Até duas requisições de importação simultâneas por instância; excedentes recebem 429. Esses controles não substituem autenticação ou proteção de acesso na hospedagem.

A interface oferece “Importar Excel”, nome/tamanho do arquivo, validação, resumo, avisos, prévia paginada em grupos de 50 e filtros todas/válidas/inválidas. Trocar arquivo invalida a prévia. Confirmar exige prévia válida e nenhuma operação em andamento. Erros na confirmação exigem validar novamente. Sucesso limpa arquivo/prévia e atualiza a listagem. Em queda de conexão na confirmação, conferir a listagem antes de repetir: a transação pode ter terminado sem a resposta chegar.

## 17. API

Criar uma API REST.

### Equipamentos

Listar:
```http
GET /equipamentos
```

Buscar por ID:
```http
GET /equipamentos/:id
```

Criar:
```http
POST /equipamentos
```

Atualizar:
```http
PATCH /equipamentos/:id
```

Arquivar:
```http
DELETE /equipamentos/:id
```

Restaurar equipamento arquivado:
```http
PATCH /equipamentos/:id/restaurar
```

Listar equipamentos arquivados:
```http
GET /equipamentos/arquivados
```

Consultar histórico de contratos:
```http
GET /equipamentos/:id/historico-contratos?page=1&limit=20
```

A consulta funciona para equipamentos ativos e arquivados. `page` possui padrão `1`; `limit` possui padrão `20` e máximo `100`. Os parâmetros devem ser inteiros positivos, não podem ser repetidos e parâmetros desconhecidos são rejeitados com `400 PARAMETRO_INVALIDO`. Equipamento inexistente retorna `404`. A resposta, ordenada do evento mais recente para o mais antigo, é:

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

A tabela existente armazena a fotografia anterior de cada substituição. A API deriva o valor novo a partir do contrato atual ou da fotografia da alteração imediatamente posterior, inclusive nos limites entre páginas. A consulta não cria nem modifica registros.

Validar planilha e gerar prévia:
```http
POST /equipamentos/importacao/validar
```

Confirmar importação:
```http
POST /equipamentos/importacao/confirmar
```

Os corpos e respostas JSON da API devem utilizar propriedades em `camelCase`. Os nomes em `snake_case` permanecem nos nomes físicos definidos no banco, quando aplicável. A importação utiliza os cabeçalhos Zebra da seção 16.

## 18. API de notificações

Listar notificações:
```http
GET /notificacoes
```

Marcar como lida:
```http
PATCH /notificacoes/:id/lida
```

## 19. API do dashboard

Criar endpoint específico para informações resumidas:

```http
GET /dashboard
```

Exemplo:

```json
{
  "total": 100,
  "ativos": 70,
  "vencendo": 15,
  "vencidos": 10,
  "venceEm30Dias": 5
}
```

A estrutura final pode ser adaptada conforme as necessidades reais do frontend.

## 20. Banco de dados

Banco:

```text
MySQL
```

Tabela principal:

```text
equipamentos
```

Tabela de notificações:

```text
notificacoes
```

Tabela de histórico simples:

```text
historico_contratos
```

### Equipamentos

Estrutura mínima:

```sql
CREATE TABLE equipamentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    serial_number VARCHAR(100) NOT NULL UNIQUE,
    part_number VARCHAR(100) NOT NULL,
    cliente VARCHAR(255) NOT NULL,
    patrimonio VARCHAR(100) UNIQUE,
    nota_fiscal VARCHAR(100),
    distribuidor VARCHAR(255) NOT NULL,
    contrato_onecare VARCHAR(100),
    data_inicio_onecare DATE NOT NULL,
    data_fim_onecare DATE NOT NULL,
    data_ultima_conferencia DATE,
    arquivado BOOLEAN NOT NULL DEFAULT FALSE,
    arquivado_em DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### Histórico de contratos

```sql
CREATE TABLE historico_contratos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    equipamento_id INT NOT NULL,
    contrato_onecare VARCHAR(100),
    data_inicio_onecare DATE NOT NULL,
    data_fim_onecare DATE NOT NULL,
    substituido_em DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (equipamento_id)
        REFERENCES equipamentos(id)
        ON DELETE CASCADE
);
```

### Notificações

Estrutura mínima:

```sql
CREATE TABLE notificacoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    equipamento_id INT NOT NULL,
    tipo VARCHAR(50) NOT NULL,
    mensagem TEXT NOT NULL,
    lida BOOLEAN DEFAULT FALSE,
    evento_chave VARCHAR(255) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (equipamento_id)
        REFERENCES equipamentos(id)
        ON DELETE CASCADE,

    UNIQUE KEY uq_notificacao_evento (equipamento_id, tipo, evento_chave)
);
```

O banco deve ser gerenciado pelo Prisma. As datas do contrato devem ser armazenadas como `DATE` no MySQL.

Alterações estruturais devem ser feitas através de migrations.

## 21. Prisma

Modelo inicial esperado:

```prisma
model Equipamento {
  id                Int      @id @default(autoincrement())
  serialNumber      String   @unique
  partNumber        String
  cliente           String
  patrimonio        String?  @unique(map: "uq_equipamentos_patrimonio")
  notaFiscal        String?  @map("nota_fiscal") @db.VarChar(100)
  distribuidor      String   @db.VarChar(255)
  contratoOnecare   String?
  dataInicioOnecare DateTime @db.Date
  dataFimOnecare    DateTime @db.Date
  dataUltimaConferencia DateTime? @db.Date
  arquivado         Boolean  @default(false)
  arquivadoEm       DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  notificacoes      Notificacao[]
  historicoContratos HistoricoContrato[]
}

model HistoricoContrato {
  id                Int      @id @default(autoincrement())
  equipamentoId     Int
  contratoOnecare   String?
  dataInicioOnecare DateTime @db.Date
  dataFimOnecare    DateTime @db.Date
  substituidoEm     DateTime @default(now())

  equipamento       Equipamento @relation(fields: [equipamentoId], references: [id], onDelete: Cascade)
}

model Notificacao {
  id             Int      @id @default(autoincrement())
  equipamentoId  Int
  tipo           String
  mensagem       String
  lida           Boolean  @default(false)
  eventoChave    String
  createdAt      DateTime @default(now())

  equipamento    Equipamento @relation(
    fields: [equipamentoId],
    references: [id],
    onDelete: Cascade
  )

  @@unique([equipamentoId, tipo, eventoChave])
}
```

Esse modelo pode ser ajustado conforme a implementação real, desde que o agente explique alterações relevantes.

## 22. Regras de negócio

### Número de série
Não pode existir mais de um equipamento com o mesmo serial.

O backend deverá aplicar `trim`, converter o valor para maiúsculas e validar a expressão regular:

```text
^[A-Z0-9]+$
```

### Datas

```text
data_inicio_onecare <= data_fim_onecare
```

### Patrimônio

O patrimônio é opcional e, quando informado, único em todo o sistema. O backend aplica `trim`, preserva o formato informado e converte texto vazio ou apenas espaços para `null`. O índice único permite múltiplos valores `NULL`. O patrimônio continua reservado ao equipamento arquivado e não pode ser reutilizado enquanto pertencer a ele.

Cadastro e edição com patrimônio já utilizado retornam HTTP `409`, código `PATRIMONIO_DUPLICADO` e mensagem `Já existe um equipamento com esse patrimônio.`. Na edição, manter o mesmo patrimônio no próprio equipamento é permitido.

### Nota fiscal e distribuidor

`notaFiscal` é opcional, recebe `trim`, aceita `null` e transforma texto vazio em `null`. `distribuidor` é obrigatório e recebe `trim`; no `PATCH`, sua ausência preserva o valor atual, mas `null` ou texto vazio não podem apagá-lo. Ambos preservam a forma digitada, podem se repetir e participam da pesquisa e ordenação. Alterações nesses campos não criam histórico de contrato.

A migration do checkpoint 3D.1 adiciona primeiro `distribuidor` como anulável, preenche somente registros anteriores sem valor com `NÃO INFORMADO` e depois aplica `NOT NULL`, sem deixar valor padrão. `nota_fiscal` permanece anulável. Nenhuma das colunas possui restrição de unicidade.

### Status
O status deve ser calculado automaticamente.

### Timer
Nunca armazenar timer no banco.

### Notificações
Evitar notificações duplicadas.

### Backend
O backend é a fonte oficial das regras de negócio.

### Frontend
O frontend é responsável pela apresentação e interação com o usuário.

## 23. Regras para exclusão

A ação de exclusão da interface deve arquivar o equipamento e exigir confirmação explícita no frontend.

Equipamentos arquivados:
- não aparecem nas listagens e indicadores principais;
- não geram notificações;
- podem ser consultados em uma área de arquivados por meio de `GET /equipamentos/arquivados`, com os mesmos recursos de pesquisa, paginação e ordenação da listagem operacional;
- podem ser restaurados após confirmação explícita;
- continuam permitindo consulta somente para leitura ao histórico de contratos;
- mantêm seu patrimônio reservado; outro equipamento não pode reutilizá-lo.

Não implementar exclusão física pela interface na V1. O `ON DELETE CASCADE` permanece apenas para uma eventual operação administrativa futura.

## 24. Tratamento de erros

A API deve retornar respostas HTTP coerentes.

Exemplos:

```text
200 OK
201 Created
400 Bad Request
404 Not Found
409 Conflict
413 Payload Too Large
415 Unsupported Media Type
422 Unprocessable Entity
500 Internal Server Error
```

Exemplo de erro:

```json
{
  "error": "Equipamento com esse número de série já existe."
}
```

Evitar expor informações sensíveis ou detalhes internos desnecessários.

Formato padrão sugerido:

```json
{
  "error": "SERIAL_DUPLICADO",
  "message": "Equipamento com esse número de série já existe.",
  "details": []
}
```

Erros mínimos a tratar:
- campos obrigatórios ausentes;
- serial inválido ou duplicado;
- patrimônio duplicado, inclusive de equipamento arquivado (`409 PATRIMONIO_DUPLICADO`);
- intervalo de datas inválido;
- equipamento ou notificação não encontrado;
- parâmetros de paginação inválidos;
- arquivo ausente, muito grande ou em formato diferente de `.xlsx`;
- cabeçalhos ou linhas inválidas na importação;
- indisponibilidade do banco de dados.

## 25. Configuração

Informações sensíveis não devem ficar diretamente no código.

Utilizar variáveis de ambiente.

Exemplo:

```env
DATABASE_URL="mysql://usuario:senha@localhost:3306/onecare"
PORT=3000
TZ=America/Fortaleza
IMPORT_MAX_FILE_SIZE_MB=10
IMPORT_MAX_ROWS=10000
```

O arquivo `.env` não deve ser versionado no Git.

Criar `.env.example` para documentar as variáveis necessárias.

## 26. Segurança

Mesmo sendo uma primeira versão simples, seguir boas práticas básicas:

- Validar dados no backend.
- Não confiar apenas na validação do frontend.
- Utilizar ORM/queries parametrizadas para evitar SQL Injection.
- Não armazenar senhas ou segredos no código.
- Não versionar `.env`.
- Tratar erros de maneira segura.
- Separar responsabilidades entre rotas, controllers e services.
- Preparar o projeto para autenticação futura.
- Limitar o tamanho dos arquivos de importação.
- Validar extensão, tipo e conteúdo das planilhas.
- Configurar CORS explicitamente para as origens permitidas.
- Aplicar cabeçalhos HTTP de segurança.
- Aplicar limitação de requisições, especialmente em endpoints de escrita e importação.

Não implementar autenticação complexa sem necessidade nesta primeira versão.

A V1 será executada sem autenticação de usuários. As validações, o CORS, os cabeçalhos de segurança e a limitação de requisições reduzem riscos técnicos, mas não substituem controle de acesso. Enquanto não houver autenticação, uma implantação web não deve expor publicamente os endpoints de escrita sem uma proteção de acesso fornecida pela plataforma ou pela rede. A autenticação da aplicação permanece como evolução futura.

## 27. Interface

A interface deve ser limpa e objetiva.

Prioridades:
1. Facilidade de visualização.
2. Pesquisa rápida.
3. Identificação clara de contratos vencendo.
4. Identificação clara de contratos vencidos.
5. Cadastro simples.

Sugestão de navegação:

```text
Dashboard
Equipamentos
Vencidos
Notificações
Arquivados
```

A interface deve ser responsiva.

## 28. Visualização de status

Utilizar indicação visual para os estados:

```text
ATIVO
VENCENDO
VENCIDO
```

A implementação visual exata fica a critério do frontend, mas deve ser intuitiva.

## 29. Arquitetura

O projeto deve seguir separação de responsabilidades.

Backend:

```text
Routes
   ↓
Controllers
   ↓
Services
   ↓
Prisma
   ↓
MySQL
```

Frontend:

```text
Pages
   ↓
Components
   ↓
Services/API
   ↓
Backend
```

Evitar concentrar toda a lógica em um único arquivo.

## 30. Testes

Implementar testes progressivamente.

Priorizar inicialmente:
- criação de equipamento;
- tentativa de serial duplicado;
- patrimônio único no cadastro e na edição, reserva em arquivados, múltiplos valores `null` e normalização de valores vazios;
- nota fiscal opcional, distribuidor obrigatório, normalização, repetição, pesquisa e ordenação desses campos;
- validação de datas;
- cálculo de status;
- cálculo de dias restantes;
- criação de notificação;
- prevenção de notificação duplicada.
- normalização e validação do serial;
- paginação, pesquisa, filtros e ordenação;
- importação de planilha válida e inválida;
- arquivamento e restauração;
- criação do histórico antes da alteração do contrato;
- cálculos de data no fuso `America/Fortaleza`.

Testes podem ser ampliados conforme o projeto evoluir.

## 31. Git

O projeto deve utilizar Git desde o início.

Realizar commits pequenos e objetivos.

Exemplos:

```text
chore: inicializa projeto
feat: cria modelo de equipamentos
feat: implementa cadastro de equipamentos
feat: adiciona dashboard
feat: adiciona notificações onecare
fix: corrige cálculo de vencimento
```

Evitar commits gigantes com diversas funcionalidades não relacionadas.

## 32. Documentação

O projeto deve possuir documentação suficiente para outra pessoa conseguir executar o sistema.

O README deve explicar:
- requisitos;
- instalação;
- configuração do `.env`;
- criação do banco;
- execução das migrations;
- execução do backend;
- execução do frontend;
- execução dos testes.

## 33. Desenvolvimento por etapas

Não criar o sistema inteiro de uma única vez.

Seguir preferencialmente esta ordem:

### Etapa 1 — Estrutura
Criar:
- backend;
- frontend;
- Git;
- arquivos base;
- configuração inicial.

### Etapa 2 — Banco
Criar:
- Prisma;
- conexão MySQL;
- schema;
- migrations.

### Etapa 3 — Equipamentos
Criar:
- CRUD;
- validações;
- pesquisa;
- paginação e ordenação;
- arquivamento e restauração;
- importação por Excel.

Subdivisão da Etapa 3, sem alterar a numeração das demais etapas:

- 3A: API e regras básicas de equipamentos;
- 3B: listagem, pesquisa, paginação e ordenação na API;
- 3C: frontend integrado para listagem, cadastro e edição;
- 3D: arquivados e consulta visual do histórico;
- 3D.1: inclusão de nota fiscal e distribuidor nos equipamentos;
- 3E: importação por Excel.

### Etapa 4 — Status
Implementar:
- ativo;
- vencendo;
- vencido;
- dias restantes;
- tela de vencidos;

### Etapa 5 — Dashboard
Implementar:
- indicadores;
- próximos vencimentos.

### Etapa 6 — Notificações
Implementar:
- alerta de 3 meses;
- armazenamento;
- listagem;
- marcar como lida.

### Etapa 7 — Refinamento
Melhorar:
- interface;
- responsividade;
- tratamento de erros;
- testes;
- documentação.

## 34. Regras para o agente de desenvolvimento

O agente deve seguir estas regras:

1. Ler este documento antes de iniciar alterações importantes.
2. Não alterar o banco sem migration.
3. Não armazenar o timer no banco.
4. O backend deve ser a fonte oficial do status.
5. Não remover funcionalidades existentes sem autorização.
6. Não adicionar funcionalidades grandes fora do escopo sem autorização.
7. Fazer alterações pequenas e organizadas.
8. Explicar alterações importantes.
9. Executar testes após alterações relevantes.
10. Verificar erros de lint/build quando aplicável.
11. Evitar duplicação de código.
12. Manter o projeto simples antes de adicionar complexidade.
13. Não instalar dependências desnecessárias.
14. Manter `.env` fora do Git.
15. Criar ou atualizar documentação quando uma alteração modificar o funcionamento do sistema.
16. Antes de executar comandos potencialmente destrutivos, solicitar confirmação.
17. Não apagar dados reais do banco durante desenvolvimento sem autorização explícita.

## 35. Comportamento esperado do Codex

Ao iniciar o projeto, o agente deve:

1. Ler `documentacao_sistema_onecare.md`.
2. Ler `AGENTS.md`, quando existir.
3. Verificar a estrutura atual do projeto.
4. Identificar o que já está implementado.
5. Não reescrever partes existentes desnecessariamente.
6. Propor a próxima etapa.
7. Executar a etapa aprovada.
8. Testar a implementação.
9. Relatar o que foi alterado.
10. Informar quaisquer problemas encontrados.

## 36. Primeira instrução para o agente

Ao abrir o projeto pela primeira vez, utilizar uma instrução semelhante à seguinte:

> Leia completamente o arquivo `documentacao_sistema_onecare.md` e qualquer arquivo `AGENTS.md` existente.
>
> Não implemente o sistema inteiro neste momento.
>
> Primeiro analise a documentação e o estado atual do projeto.
>
> Explique:
>
> 1. a arquitetura recomendada;
> 2. a estrutura de pastas;
> 3. as dependências necessárias;
> 4. a estratégia de banco de dados e migrations;
> 5. possíveis problemas ou inconsistências na especificação;
> 6. a ordem recomendada de implementação.
>
> Não faça alterações ainda.
>
> Depois da análise, aguarde a minha autorização para iniciar a primeira etapa.

## 37. Funcionalidades futuras

Estas funcionalidades podem ser consideradas posteriormente, mas não devem ser implementadas na primeira versão sem autorização:

- autenticação de usuários;
- níveis de acesso;
- múltiplos usuários;
- histórico completo de alterações;
- exportação para Excel;
- exportação para PDF;
- envio de e-mail;
- envio de notificações via WhatsApp;
- integração com OneCare/API externa;
- anexos de documentos;
- múltiplos contratos por equipamento;
- relatórios avançados;
- filtros avançados;
- auditoria;
- backup automático;
- Docker;
- deploy em servidor;
- integração CI/CD.

## 38. Critérios de qualidade

Uma funcionalidade somente deve ser considerada concluída quando:

- estiver implementada;
- estiver integrada ao restante do sistema;
- estiver validada;
- não quebrar funcionalidades existentes;
- possuir tratamento básico de erros;
- tiver sido testada;
- estiver documentada quando necessário.

## 39. Princípio geral do projeto

Priorizar:

```text
Simplicidade
+
Organização
+
Confiabilidade
+
Facilidade de manutenção
```

Evitar criar uma arquitetura excessivamente complexa para uma primeira versão.

O sistema deve ser construído de forma incremental, permitindo que novas funcionalidades sejam adicionadas posteriormente sem necessidade de reescrever toda a aplicação.
