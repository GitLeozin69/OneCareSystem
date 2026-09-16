# Etapa 7D — auditoria final de segurança pré-produção

Data: 16/09/2026. Escopo: código, configuração, dependências e testes locais do OneCare. Não houve publicação, pentest externo, alteração de DNS, configuração Netlify/Railway ou implementação de e-mail.

## Base e metodologia

- Branch auditada: `main`; commit inicial: `6b97718ba2a8b115340a3c761baa9f32f7e9e0ee` (`style: finaliza identidade visual do frontend`). Worktree inicialmente limpo.
- Leitura integral de AGENTS, especificação, README, documento 7B/7B.1, configurações, schema, quatro migrations, código backend/frontend, script administrativo e testes. Lockfiles lidos e analisados como JSON; inventário e referências dos pacotes conferidos. Não foi realizada leitura integral de todo o código transitivo de terceiros.
- Inspeção estática, Fastify `inject`, testes de serviços e componentes React, falhas controladas antes das correções, integração MySQL e revisão de diff/histórico. Referências: [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) e [Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html).
- Somente fixtures fictícias. Nenhuma planilha real usada. Não foi inicializado o servidor operacional/scheduler durante os testes, evitando notificações ou outras escritas no banco do usuário.
- Criado o banco **local e separado `ZebraOneCareTest`** e aplicadas nele as quatro migrations existentes. Nenhuma migration nova, nenhum reset, DROP, TRUNCATE ou exclusão de dados reais. O banco de teste é mantido para próximas execuções; os dados de testes são revertidos. IDs auto-incrementais podem avançar mesmo com rollback.
- A conexão existente foi utilizada sem presumir credenciais; a URL de teste foi derivada somente em memória. `.env` não foi alterado nem versionado. `ZebraOneCare` foi acessado apenas para diagnóstico/migrations status, sem modificar suas tabelas ou registros.
- Alteração externa identificada durante a auditoria em `frontend/index.html` (título da página): preservada e **excluída do commit**. Não pertence à auditoria.
- A solicitação menciona Etapa 7C concluída, mas não foi localizada evidência correspondente no histórico/documentação desta checkout. Não se presumiu configuração de infraestrutura ausente. Os requisitos não comprovados continuam explicitamente na Etapa 8.

### Versões verificadas

Node 24.18.1; npm 11.16.0; MySQL 8.4.9; Prisma CLI/Client/adaptador 7.10.0; Fastify **5.12.5** após correção (inicial 5.12.4); Argon2 0.45.1; Helmet 13.1.1; multipart 10.1.1; React/React DOM 19.2.8; Vite 8.2.2; Tailwind 4.3.3; Vitest 5.0.0; jsdom 26.1.0. Drivers/override: mariadb 3.4.7, mysql2 3.23.1, deepmerge-ts 8.0.0.

## Superfície de ataque

- Entradas: servidor Fastify (`backend/src/server.js`), aplicação React (`frontend/src/main.jsx`), CLI interativa `admin:create`, Prisma/migrations e rotina interna de notificações na inicialização/08h de Fortaleza.
- MySQL é a única integração de execução externa ao processo; Excel é processado localmente em memória/worker. Não há serviço de e-mail, recursos remotos de interface ou integração automática com a Zebra.
- Sessões: token opaco aleatório de 32 bytes; somente SHA-256 é persistido, associado ao usuário e expiração absoluta (8h por padrão, 1–168h configurável). Não existe expiração por inatividade.
- Cookies: `onecare_session` e `onecare_csrf`; HttpOnly, Path `/`, SameSite Strict, Secure obrigatório em produção. CSRF usa cookie assinado e HMAC vinculado ao hash da sessão; header em memória no frontend. Cookie CSRF não define prazo próprio: validade operacional depende do cookie/vínculo e da sessão ainda aceita nas rotas protegidas.
- Variáveis: `DATABASE_URL`, `TEST_DATABASE_URL`, `NODE_ENV`, `FRONTEND_ORIGIN`, `SESSION_DURATION_HOURS`, `COOKIE_SECURE`, `CSRF_SECRET`, `HOST`, `PORT`, `TZ` e limites de importação. `VITE_API_URL` configura o proxy de desenvolvimento; chamadas do frontend usam `/api`, sem credenciais embutidas.

## Matriz de rotas

Legenda: A = ADMIN ativo; V = VISUALIZADOR ativo. Sessão ausente/inválida/inativa nas rotas protegidas: **401**; perfil insuficiente: **403**. Leitura autorizada é global por definição do produto, sem isolamento por cliente/tenant. Equipamentos arquivados são consultáveis apenas na listagem específica/histórico, não em GET operacional por ID ou listagem ativa.

Limites por processo: **L** 300/min por usuário (ou IP anônimo), **E** 120/min, **U** 20/h compartilhado nas mutações de usuários, **I** 10/15min compartilhado nas duas importações, **S** 5/15min na senha própria. Login também tem 5 tentativas pendentes/falhas por IP + hash do nome em 15min; sucesso libera seu contador. 429 inclui Retry-After. Não são limites globais entre instâncias.

| Método | Rota | Autenticação/perfil | CSRF + Origin | Rate | Payload máximo | Dados/operação |
|---|---|---|---|---|---|---|
| GET/HEAD | `/health` | Público | Não | Sem limite próprio | Sem corpo esperado | Saúde, sem diagnóstico interno |
| GET/HEAD | `/auth/csrf` | Público | Não | L | Sem corpo esperado | Emite token CSRF/cookie |
| POST | `/auth/login` | Público | Sim | E + login | 64 KiB; strings com limites | Credenciais, emite/rotaciona sessão |
| POST | `/auth/logout` | Público/idempotente | Sim, vinculado ao cookie | E | 64 KiB | Revoga sessão apresentada |
| GET/HEAD | `/auth/me` | A/V | Não | L | Sem corpo esperado | Usuário público e CSRF |
| PATCH | `/auth/senha` | A | Sim | S | 64 KiB; senhas até 128 | Senha própria, revoga todas as sessões |
| GET/HEAD | `/usuarios` | A | Não | L | Sem corpo esperado | Lista pública de contas |
| POST | `/usuarios` | A | Sim | U | 64 KiB | Cria somente visualizador |
| PATCH | `/usuarios/:id/status` | A | Sim | U | 64 KiB | Ativa/desativa visualizador |
| PATCH | `/usuarios/:id/senha` | A | Sim | U | 64 KiB | Redefine senha de visualizador |
| GET/HEAD | `/equipamentos` | A/V | Não | L | Query validada | Lista/pesquisa/status, até 100/página |
| GET/HEAD | `/equipamentos/arquivados` | A/V | Não | L | Query validada | Lista arquivados, até 100/página |
| GET/HEAD | `/equipamentos/:id` | A/V | Não | L | ID validado | Equipamento não arquivado |
| GET/HEAD | `/equipamentos/:id/historico-contratos` | A/V | Não | L | ID/query validados | Histórico inclusive arquivado, até 100/página |
| POST | `/equipamentos` | A | Sim | E | 64 KiB | Cadastro validado |
| PATCH | `/equipamentos/:id` | A | Sim | E | 64 KiB | Edição/histórico transacionais |
| DELETE | `/equipamentos/:id` | A | Sim | E | 64 KiB | Arquivamento lógico, não exclusão física |
| PATCH | `/equipamentos/:id/restaurar` | A | Sim | E | 64 KiB | Restauração |
| POST | `/equipamentos/importacao/validar` | A | Sim | I | Arquivo 10 MiB + 16 KiB de envelope | Prévia XLSX, sem escrita de equipamento |
| POST | `/equipamentos/importacao/confirmar` | A | Sim | I | Mesmo limite | Revalidação/importação transacional |
| GET/HEAD | `/dashboard/resumo` | A/V | Não | L | Sem corpo esperado | Totais e duas listas de até 10 |
| GET/HEAD | `/notificacoes` | A | Não | L | Query validada | Avisos, até 100/página |
| GET/HEAD | `/notificacoes/nao-lidas/contagem` | A | Não | L | Sem corpo esperado | Contagem |
| PATCH | `/notificacoes/:id/ler` | A | Sim | E | 64 KiB | Marca leitura |
| PATCH | `/notificacoes/ler-todas` | A | Sim | E | 64 KiB | Marca todas |
| OPTIONS | Preflight CORS | Público | Não | Respondido antes do limitador | Sem corpo esperado | Origem exata; métodos/headers declarados |

HEAD é gerado pelo Fastify nas rotas GET e mantém os controles do grupo. PUT e outros métodos declarados no CORS não criam handlers de negócio. CORS bloqueia a leitura pelo navegador de respostas para origens externas; não é uma barreira de autenticação para clientes não navegador. Mutações rejeitam Origin ausente/externo; não há fallback para Referer.

## Achados e tratamento

Nenhum achado crítico ou alto comprovado permaneceu sem tratamento no escopo local. A classificação abaixo não certifica infraestrutura ainda inexistente.

| ID / severidade | Componente, evidência anterior e cenário/impacto | Correção / regressão / estado |
|---|---|---|
| M01 — Médio | Validador compartilhado aceitava senha de oito espaços em criação/redefinição/CLI; permitia credencial trivial e divergente da senha própria | Rejeição de branco, sem trim do valor aceito. `securityAudit.test.js` cobre espaços, tab e Unicode. **Corrigido** |
| M02 — Médio | AJV convertia número/array em string antes do serviço de login e strings em boolean na gestão de usuários; contrato de entrada não era respeitado | `coerceTypes:false`; tipos incorretos retornam 400 sem chegar ao serviço. Teste matricial de login/criação/reset/status e equipamentos. **Corrigido** |
| M03 — Médio | Seis logins errados simultâneos chegaram ao banco e todos retornaram 401, contornando o limite de cinco durante os awaits | Reserva síncrona da tentativa antes de consultar/verificar hash. Teste agora observa cinco acessos e um 429. **Corrigido** |
| M04 — Médio | URLs livres apareciam no logger e no 404 padrão; parâmetros sensíveis enviados por engano poderiam ser retidos. URLs malformadas também eram refletidas pelo roteador | Serializador só registra template; 404 e erros de framework genéricos; 415 deixou de virar 500. Canários em path/query/header e URL malformada não aparecem em logs/respostas. `securityAudit` e `passwordChange` capturam logs em memória. **Corrigido** |
| M05 — Médio | Logout com falha de rede limpava a interface em `finally`, embora cookie/sessão persistissem; criava falsa percepção de saída em computador compartilhado | Interface mantém estado autenticado e orienta nova tentativa; 401 continua encerrando estado pelo fluxo central. Teste React de rede falha e testes existentes de logout/troca. **Corrigido** |
| M06 — Médio | Leitura contratual obsoleta permitiu UPDATE real com início posterior ao fim e histórico incorreto, apesar da transação | UPDATE confere contrato/datas/arquivamento lidos, com 409 e rollback; conflito transacional também é 409. Duas integrações determinísticas (contrato e arquivamento) comprovam rejeição e ausência de histórico persistido. **Corrigido** |
| M07 — Médio | Produção aceitava segredo CSRF composto só de espaços; duração `8garbage`/`8.5` era truncada para 8 | Recusa de segredo em branco e parsing integral de duração. Teste de configuração. Entropia real ainda é requisito operacional, não algo provado pela validação de comprimento. **Corrigido** |
| M08 — Médio | Script de integração carregava DATABASE_URL e os testes exigiam banco operacional; até um rollback poderia bloquear linhas reais e avançar IDs | TEST_DATABASE_URL separada, allowlist local e nome exclusivo, recusa de produção, sem fallback. Execução explícita falha sem configuração; preparação dedicada aplica somente migrations existentes. Testes de trava e integrações. **Corrigido** |
| M09 — Médio no aviso; exploração não aplicável à configuração atual | Fastify 5.12.4 abrangido por GHSA-4mh8-r7rc-xpvc: DoS se HTTP/2 e trailers estiverem habilitados; nenhum deles é usado aqui | Atualização mínima para 5.12.5, um único pacote alterado no lockfile, sem novo override. Suíte completa e audits. **Corrigido por atualização**; não foi produzido crash HTTP/2 no sistema |
| B01 — Baixo | `admin:create` imprime `error.message` de falhas inesperadas no terminal local; pode revelar metadados internos a operador que já possui acesso à máquina | **Pendente**: padronizar erros inesperados da CLI em manutenção própria; não copiar consoles para canais públicos. Sem exposição HTTP demonstrada ou segredo real encontrado |
| B02 — Baixo | Listagem de usuários e rotina de notificações não são paginadas internamente; primeira é ADMIN e segunda não é endpoint público | **Pendente**: medir volume e limitar/lotejar antes de escala significativa. Não foi feito teste de exaustão nem reescrita nesta etapa |
| B03 — Baixo | PORT usa parseInt; IDs numéricos de usuários/notificações têm validação menos uniforme que equipamentos; erro interno continua genérico | **Pendente**: uniformizar limites de inteiros/configuração em manutenção futura. Não demonstrado bypass de autorização ou injeção |
| I01 — Informativo | Ausência de evidência local da Etapa 7C e configurações efetivas do provedor | **Pendente Etapa 8**; não considerar infraestrutura previamente homologada |
| I02 — Informativo | npm 11 emitiu `allow-scripts` para Prisma engines, Prisma e Argon2; scripts declarados de instalação/construção são conhecidos, mas não estão na allowlist local do npm | **Pendente na instalação limpa**: revisar/aprovar individualmente a política de scripts no ambiente de destino; não foi liberada execução geral. Client generate e Argon2 funcionaram nesta instalação existente |

Aviso oficial: [GHSA-4mh8-r7rc-xpvc](https://github.com/fastify/fastify/security/advisories/GHSA-4mh8-r7rc-xpvc), publicado em 16/09/2026, e [release 5.12.5](https://github.com/fastify/fastify/releases/tag/v5.12.5). O audit inicial retornava zero, ilustrando que ausência de alertas npm não substitui a revisão dos avisos oficiais.

## Controles verificados e limites da evidência

- Argon2id centralizado em 64 MiB, três iterações e paralelismo quatro, sem alteração nesta etapa. Limites 8–128 respeitados, sem normalização de senha válida; mensagem uniforme para senha errada, conta inexistente e inativa. Não houve medição estatística de side-channel de tempo.
- Rotação de token, revogação do anterior, expiração, usuário desativado, senha antiga recusada após troca, duas sessões invalidadas e rollback em falha de revogação são cobertos nos testes existentes e MySQL. Hashes são gerados dinamicamente nas fixtures, não copiados de usuários reais. Nenhuma sessão em storage persistente do navegador.
- Matriz automatizada de 21 rotas protegidas × quatro estados (anônimo, inativo, visualizador, administrador), além dos testes de autenticação e senha. O teste da matriz simula resolução da sessão; validade/inatividade reais são exercitadas pelas suítes de serviço/MySQL. Upload autorizado sem multipart chega ao validador e retorna 415, não representa importação bem-sucedida nesse teste.
- CSRF ausente/inválido/de vínculo anterior, origem externa, CORS exato/preflight, cookies dev/prod, headers/no-store, mass assignment de role/adminSlot/hash, JSON inválido, prototype pollution, arrays/objetos e filtros/IDs extremos cobertos. SQL de negócio usa Prisma com valores parametrizados; SQL bruto dos testes é constante. Busca estática não encontrou execução de comandos oriundos de dados da API.
- Textos de cliente e mensagens dinâmicas são renderizados por React sem HTML bruto. Teste com marcação fictícia confirma texto literal, sem elemento executável. Não há `dangerouslySetInnerHTML`, eval, redirecionamento externo baseado em entrada ou recursos remotos de interface. Testes frontend usam jsdom, não constituem pentest em todos os navegadores reais.
- Serial e patrimônio únicos no MySQL inclusive arquivados; patrimônio vazio vira NULL e múltiplos NULL são aceitos. Datas DATE, calendário de Fortaleza, três meses corridos, fim de mês/bissexto, histórico somente em mudança, conflitos de cadastro/importação e rollback são cobertos. A concorrência contratual simula deterministicamente o SELECT obsoleto com escrita/rollback reais; não é benchmark de duas conexões sob carga.
- Excel: um arquivo .xlsx, 10 MiB, 10.000 linhas de dados, primeira aba, sem uso de nome como caminho. ZIP limitado a 1.000 entradas/50 MiB declarados totais/20 MiB por entrada, dimensões limitadas, sem macros/DTD/links externos/conteúdo ativo aceito. Fórmulas de cabeçalhos/campos mapeados são rejeitadas; colunas ignoradas não são executadas. Worker 15s/heap 128 MiB e duas importações simultâneas. Testes incluem arquivos corrompidos, limites, duplicidades, headers, timeout/concorrência e transações; não se presume resistência a toda variante futura de ZIP bomb.
- GET de negócio não altera equipamentos/notificações. Há efeitos técnicos documentados: `/auth/csrf` emite cookie; consulta de sessão expirada/inativa pode apagar somente essa sessão inválida. Não se afirma que toda leitura seja estritamente isenta de escrita técnica.
- `trustProxy:false`, sem confiança em X-Forwarded-For. Limites em memória com capacidade limitada e janelas, proteção contra repetição local; não garantem resistência a botnet, reinício, múltiplas instâncias ou DoS de borda. Configuração HTTP observada: requestTimeout e connectionTimeout 0, keepAliveTimeout 72s. Timeouts de borda/conexão precisam ser definidos/testados antes de exposição pública.
- MySQL local acessível em loopback/3306, pool 10, mínimo ocioso 1, aquisição 10s/conexão 5s. Recuperação RSA automática só em loopback. Configuração atual utiliza conta administrativa local; isso **não é configuração aprovada de produção**. Nenhum usuário, senha ou URL real é registrado aqui.

## Testes, ferramentas e resultados

| Verificação | Resultado final |
|---|---|
| Backend `npm --prefix backend test` | 276 testes: **265 aprovados**, 11 integrações puladas somente porque TEST_DATABASE_URL não é carregada na suíte comum |
| Frontend `npm --prefix frontend test` | **101 aprovados**, oito arquivos, sem pulados |
| Integrações MySQL isoladas | **13 aprovados**, zero pulados; incluem os 11 dependentes do banco e dois testes de configuração já contados na suíte comum |
| Adversariais novos reexecutados isoladamente | **11 aprovados**, além das duas regressões MySQL |
| Regressões frontend novas | Logout com falha de rede, conflito de edição e renderização literal de HTML; incluídas nos 101 |
| Lint backend/frontend | Aprovados |
| Build backend/frontend | Aprovados; frontend sem segredo identificado no bundle |
| Prisma generate / validate | Client 7.10.0 gerado e schema válido |
| Migrations status | Quatro aplicadas, nenhuma pendente em ZebraOneCare e ZebraOneCareTest |
| Conexão/rollback MySQL | Aprovados; tabelas de negócio/usuários/sessões do banco de teste vazias após execuções |
| Audit backend completo / produção | **0 / 0 vulnerabilidades** |
| Audit frontend completo / produção | **0 / 0 vulnerabilidades** |
| Outdated | Consultado online nos dois projetos; atualizações não relacionadas não aplicadas |
| Diff/check e revisão | Sem erro de whitespace; avisos LF→CRLF do Git não são erros de execução |
| Arquivos proibidos/segredos | Nenhum segredo real identificado no diff/arquivos versionados/saída de logs capturada; exemplos e fixtures distinguidos de credenciais reais |

A linha de base foi 254 testes backend + 98 frontend aprovados, com nove integrações ainda puladas na suíte comum. Cinco regressões iniciais backend e uma frontend falharam antes da correção. Um teste de ID foi corrigido para esperar o 422 já documentado para inteiro fora do limite seguro (não era falha da aplicação). Duas integrações novas inicialmente falharam por SAVEPOINT não suportado no protocolo preparado do driver; substituídas por rollback da transação inteira, mantendo asserções de rejeição e preservação. EPERM do sandbox em processos Node/Vite/Prisma foi resolvido por execução autorizada, sem ignorar testes.

### Dependências e repositório

- Atualização somente de Fastify 5.12.4→5.12.5. Prisma continua 7.10.0; nenhum downgrade, audit fix --force ou instalação global.
- Overrides anteriores preservados sem acréscimos: adaptador→mariadb 3.4.7, Prisma→mysql2 3.23.1, @prisma/config 7.10→deepmerge-ts 8.0.0. MySQL2/deepmerge aparecem na árvore de produção por dependências/peer do Prisma; não são tratados como exclusivamente dev.
- Lockfiles v3 coerentes com manifests; URLs de pacotes registradas no npm oficial e entradas resolvidas com integrity. Scripts de instalação identificados: engines/Prisma/Argon2 no backend, fsevents opcional no frontend; sem script de instalação próprio vindo de conteúdo de upload. Não equivale a auditoria de todo o código dessas bibliotecas.
- Outdated relevante: Prisma 8.0.0-rc.15 (não adotar RC/major automaticamente), React/DOM 19.3.0, Vite 8.3.0, Vitest 5.0.1, jsdom 30.0.1, Testing Library DOM 10.4.2 e react-refresh 0.5.7. Sem aviso de vulnerabilidade nos quatro audits finais. `outdated` pode encerrar com código 1 por listar versões, não por teste falho.
- `.env`, node_modules e dist ignorados; nenhum dump, planilha real, log, certificado/chave privada versionado. SQL versionado é somente migration. Busca no histórico por URLs credenciadas identificou exemplos usuario/senha ou usuario/segredo; padrões de hash encontrados são asserções de prefixo, não hashes reais. Não houve suspeita confirmada exigindo rotação nem reescrita de histórico. A busca é baseada em padrões/revisão, não prova matemática da ausência de todo segredo possível.

## Requisitos obrigatórios antes de publicar — Etapa 8

1. Definir domínios e topologia real. Com cookies SameSite Strict e `/api` relativo, frontend/backend em sites independentes não funcionarão automaticamente. Preferir exposição same-site/reverse proxy; qualquer mudança de SameSite deve preservar CSRF e ser testada, não liberada genericamente.
2. HTTPS, Secure, NODE_ENV production, segredo CSRF aleatório de fonte segura, allowlist exata de origens; verificar cookies e login no navegador do domínio definitivo. Não versionar segredos nem usar placeholders.
3. Usuário MySQL exclusivo de menor privilégio; separar credenciais de migrations; TLS validado, rede restrita e RSA conforme provedor. Não expor porta do MySQL ou usar root de desenvolvimento em produção.
4. Definir proxies confiáveis por topologia/ranges, sem `trustProxy:true` indiscriminado. Limites globais/por IP na borda e contadores compartilhados para múltiplas instâncias; dimensionar Argon2, uploads e pool sob carga legítima.
5. Configurar e testar timeouts de cabeçalho/corpo/conexão, limites de upload/URL, shutdown gracioso, saúde, alertas e proteção contra requisições lentas. O teste local não certifica resistência de rede.
6. Aplicar CSP, framing, nosniff, referrer, cache e HSTS ao **frontend servido pela hospedagem**, não apenas à API. Confirmar que bundles/mapas públicos não carregam segredos. Vite dev não é servidor de produção.
7. Logs com acesso/retensão restritos e sem URLs/credenciais, backups e ensaio de restauração, execução controlada de migrations, rotina de limpeza de sessões e monitoramento. Revisar tratamento de erros da CLI antes de centralizar consoles.
8. Fazer instalação limpa com lockfile e revisar allow-scripts individualmente; repetir generate, testes, audits e ensaio de permissões na plataforma final. Atualizar revisões de dependências continuamente.

Continuam fora deste checkpoint: envio de e-mail 6B, recuperação de senha/MFA, novos perfis, testes ofensivos externos, grandes refatorações, hardening específico do provedor e publicação.

## Conclusão

**APTO COM PENDÊNCIAS DOCUMENTADAS** para avançar à preparação da Etapa 8. Os problemas comprovados de maior relevância local foram corrigidos e testados, sem achado crítico/alto aberto neste escopo. Isso **não autoriza exposição direta em produção**: requisitos de infraestrutura, privilégios, TLS, timeouts, proteção de borda e validação da instalação limpa permanecem obrigatórios. Não se declara o sistema absolutamente seguro.

Mensagem preparada: `security: conclui auditoria final pre-producao`. O commit **não foi criado nesta execução**, pois a autorização do comando foi recusada. As alterações revisadas permanecem preparadas para commit; `frontend/index.html` fica fora delas. Nenhum git push foi executado.
