# Revisão de segurança — Etapa 7B

Revisão executada antes da preparação de hospedagem. Ela cobre o código atual e o ambiente local; não representa pentest de infraestrutura externa. Nenhum segredo, credencial ou dado completo de planilha foi registrado neste documento.

## Resultado por controle

| Item | Resultado e evidência | Severidade antes | Correção/mitigação | Teste | Pendência |
|---|---|---:|---|---|---|
| Senhas | Argon2id; senha permanece opaca e aceita 8–128 caracteres conforme decisão do projeto | Baixa | Parâmetros fixados em 64 MiB, 3 iterações e paralelismo 4 | Hash e verificação automatizados | Reavaliar política na hospedagem |
| Enumeração de contas | Usuário ausente, inativo e senha errada retornam a mesma resposta | Aprovado | Hash fictício preserva trabalho equivalente | Teste dos três casos | Nenhuma |
| Força bruta | Cinco falhas por IP e hash do usuário em 15 minutos | Média | 429 passou a incluir `Retry-After` | Serviço e API | Contador compartilhado na Etapa 7C |
| Sessão | Token aleatório de 32 bytes; banco guarda somente SHA-256 | Aprovado | Mantido; índices de hash e expiração confirmados no schema | Unitário e MySQL | Nenhuma |
| Fixação de sessão | Login sempre gera token novo | Média | Token anterior apresentado no login é revogado na transação | Teste de rotação | Nenhuma |
| Expiração | Sessão expirada/inativa é recusada | Baixa | Limpeza adicional de expiradas em login bem-sucedido | Teste automatizado | Limpeza agendada pode ser avaliada em grande escala |
| Logout | Remove hash no banco e limpa cookie com os mesmos atributos | Aprovado | Mantido e testado com CSRF vinculado | Unitário e MySQL | Nenhuma |
| Cookie | `HttpOnly`, `SameSite=Strict`, `Path=/`, expiração; `Secure` obrigatório em produção | Aprovado | Teste explícito de produção | Teste HTTP | Nenhuma |
| CSRF | Antes não era ligado à sessão | Alta | HMAC agora inclui hash do token da sessão; login troca o vínculo | Token ausente, inválido, antigo e atual | Nenhuma |
| Origem | Mutações exigem origem exatamente permitida | Aprovado | Mantido | Origem permitida e semelhante maliciosa | Nenhuma |
| CORS | Allowlist existia, mas métodos/headers eram implícitos | Baixa | Métodos e headers declarados; preflight estrito | GET e OPTIONS | Nenhuma |
| Autorização | Padrão central é autenticado; mutações são ADMIN | Aprovado | Produção falha se serviços forem montados sem autenticação | Acesso anônimo, viewer e admin | Nenhuma |
| Proxy | Fastify não confia em proxy por padrão | Aprovado local | `trustProxy: false` explícito no servidor | Inspeção da inicialização | Configurar ranges confiáveis na Etapa 7C |
| Rate limit geral | Apenas login/concorrência Excel tinham limite | Média | Leitura, escrita, importação e administração recebem limites proporcionais | 429 e `Retry-After` | Armazenamento compartilhado na Etapa 7C |
| Payload JSON | Fastify aceitava o limite padrão de 1 MiB | Baixa | Limite global reduzido a 64 KiB | Requisição acima do limite retorna 413 genérico | Nenhuma |
| Propriedades extras | AJV podia remover campos adicionais silenciosamente | Média | `removeAdditional=false`; schemas rejeitam propriedade inesperada | Payload de login | Ampliar schemas de resposta gradualmente |
| Excel | Extensão, ZIP/OOXML, macros, links, DTD, fórmulas, dimensões, tempo, memória e linhas limitados | Aprovado | Limite multipart independente de 10 MB preservado; 10 requisições/15 min | Suíte Excel e MySQL | Antivírus pode ser adicionado na hospedagem |
| Prisma/SQL | Produção usa API tipada; SQL bruto encontrado apenas em testes com texto constante | Aprovado | Nenhuma alteração de banco | Busca estática e integração | Evitar SQL bruto com entrada externa |
| Headers HTTP | Não havia integração dedicada | Média | `@fastify/helmet`: CSP, nosniff, frame deny, referrer; Permissions-Policy manual; HSTS somente em produção | Teste HTTP dev/prod | Ajustar CSP se frontend/backend forem servidos juntos |
| Cache | Respostas autenticadas não declaravam política | Média | `Cache-Control: no-store, max-age=0` e `Pragma: no-cache` | Teste HTTP | Nenhuma |
| Erros | Respostas inesperadas já eram genéricas | Aprovado | 413 ganhou resposta padronizada; detalhes permanecem no servidor | Testes de erro | Nenhuma |
| Logs | Logs de negócio não incluem corpos, mas não havia redaction central | Média | Redaction de auth, cookies, CSRF e campos de senha | Configuração automatizada e busca estática | Integrar coletor na Etapa 7C |
| Frontend | Sem storage de tokens, HTML bruto ou logs de autenticação | Baixa | Senha local é zerada após cada tentativa de login | Testes React e busca estática | Autorização definitiva continua no backend |
| Ambiente | Produção validava cookie, origem e segredo; modo desconhecido caía em desenvolvimento | Média | `NODE_ENV` restrito; produção exige HTTPS e autenticação completa | Testes de configuração | Segredos devem vir do provedor |
| Dependências | Backend e frontend sem vulnerabilidades no audit inicial | Aprovado | Fastify atualizado dentro da linha 5 e Helmet oficial compatível adicionado | `npm audit`, lint, build e suítes | Raiz não tem lockfile/dependências; audit não aplicável |
| Código perigoso | Sem `eval`, `new Function`, HTML injetado ou comandos vindos do usuário | Aprovado | `child_process` existe somente em teste; worker Excel usa caminho interno fixo | Busca estática | Repetir antes de cada release |

## Matriz de acesso revisada

| Grupo | Sem sessão | VISUALIZADOR | ADMIN |
|---|---:|---:|---:|
| Health e obtenção inicial de CSRF | Permitido | Permitido | Permitido |
| Dashboard, equipamentos, arquivados e histórico | Negado | Leitura | Leitura |
| Cadastro, edição, arquivamento e restauração | Negado | Negado | Permitido com CSRF |
| Importação Excel | Negado | Negado | Permitido com CSRF |
| Notificações internas | Negado | Negado | Permitido com CSRF nas mutações |
| Administração de usuários | Negado | Negado | Permitido com CSRF nas mutações |

## Dependências e auditorias

- Raiz: não possui dependências nem `package-lock.json`; por isso `npm audit` retorna `ENOLOCK` e é não aplicável. Nenhum lockfile foi criado artificialmente.
- Backend: auditorias completa e `--omit=dev` terminaram com 0 vulnerabilidades. O lockfile está presente.
- Frontend: auditorias completa e `--omit=dev` terminaram com 0 vulnerabilidades. O lockfile está presente.
- `fastify` foi atualizado de 5.12.3 para 5.12.4, correção compatível da mesma linha.
- `@fastify/helmet` 13.1.1 foi incluído; a linha 13 é compatível com Fastify 5.
- Os overrides preexistentes foram preservados: `mariadb` 3.4.7, `mysql2` 3.23.1 e `deepmerge-ts` 8.0.0. A árvore instalada confirmou essas versões.
- O levantamento de desatualizados mostrou Prisma 8 somente como release candidate de nova versão principal e atualizações não relacionadas à segurança no frontend. Nenhuma troca principal ou atualização sem causa foi feita.
- Todos os pacotes diretos possuem uso identificado. A instalação não emitiu aviso de pacote descontinuado.

## Preparação obrigatória para a Etapa 7C

- Criar usuário MySQL exclusivo, não `root`, com privilégios mínimos.
- Usar TLS com validação de certificado conforme o provedor.
- Executar migrations por processo controlado e separado da inicialização comum.
- Configurar backups e testar restauração.
- Definir os proxies confiáveis antes de habilitar `trustProxy`.
- Compartilhar os contadores de rate limit caso haja múltiplas instâncias.
- Fornecer `CSRF_SECRET`, `DATABASE_URL` e demais segredos pelo ambiente da hospedagem.
- Implementar futuramente a troca da própria senha do administrador, mediante senha atual, mantendo somente a sessão que realizou a alteração. Essa função não faz parte da Etapa 7B.

## Comandos de verificação

```powershell
npm.cmd --prefix backend audit
npm.cmd --prefix backend audit --omit=dev
npm.cmd --prefix frontend audit
npm.cmd --prefix frontend audit --omit=dev
npm.cmd test
npm.cmd run test:integration
npm.cmd run lint
npm.cmd run build
npm.cmd run db:generate
npm.cmd run db:validate
npm.cmd run db:migrate:status
git diff --check
```

Resultado deste checkpoint: 219 testes na suíte comum do backend (211 aprovados e 8 integrações puladas sem `DATABASE_URL`), 84 testes do frontend aprovados e 10 testes MySQL aprovados separadamente com rollback. Lint e builds passaram. Prisma Client 7.10.0 foi gerado, o schema foi validado e as quatro migrations estavam aplicadas no banco `ZebraOneCare`.
