# Etapa 8A — preparação técnica para produção

Este documento prepara o OneCare para uma publicação futura, mas **não registra uma implantação**. A Etapa 8B deverá criar e validar o backend/MySQL no Railway; a Etapa 8C deverá publicar e validar o frontend na Netlify. Nenhuma credencial real pertence ao repositório.

## Decisão de arquitetura

Foi escolhida comunicação **same-origin por proxy da Netlify**:

```text
Navegador -> https://frontend-netlify/api/* -> proxy Netlify -> https://backend-railway/*
```

O frontend usa somente o caminho relativo `/api`. No build da Netlify, `frontend/scripts/generateNetlifyFiles.js` valida `API_PROXY_TARGET` e gera a regra de proxy antes do fallback da SPA. A aplicação não aceita uma URL absoluta em `VITE_API_BASE_PATH`.

Motivos:

- os cookies `onecare_session` e `onecare_csrf` continuam first-party, `Secure`, `HttpOnly` e `SameSite=Strict`;
- não é necessário adotar `SameSite=None` nem depender de cookies de terceiros;
- o navegador envia `Origin` da Netlify, que deve ser a origem HTTPS exata em `FRONTEND_ORIGIN`;
- CSP pode manter `connect-src 'self'` e as chamadas preservam `credentials: 'include'` e CSRF;
- a regra `/api/*` precede obrigatoriamente `/* /index.html 200`, evitando que uma API ausente devolva HTML da SPA.

Risco operacional: a importação Excel de até 10 MiB atravessa o proxy. A Netlify documenta proxy externo por rewrite `200`, mas limites efetivos do plano e do caminho publicado precisam ser testados na Etapa 8C com arquivo válido próximo do limite. Se o provedor não suportar o upload, a alternativa será um domínio próprio same-site ou hospedagem conjunta; não mudar cookies para `SameSite=None` sem nova revisão de CSRF.

## Backend no Railway — Etapa 8B

Configuração planejada no painel (não aplicada nesta etapa):

| Item | Valor/ação |
|---|---|
| Root directory | `/backend` |
| Node | linha 22, conforme `engines` |
| Install | `npm ci --include=dev` |
| Build | `npm run build` |
| Pre-deploy | `npm run db:migrate:deploy` |
| Pre-deploy timeout | 300 segundos inicialmente |
| Start | `npm start` |
| Healthcheck | `/health` |
| Réplicas | exatamente 1 |
| Restart policy | reiniciar em falha, configurada no painel |

`npm start` força `NODE_ENV=production`. O processo exige `PORT` válido de 1 a 65535 e escuta em `0.0.0.0`; desenvolvimento mantém `127.0.0.1:3000`. O servidor encerra em `SIGTERM`/`SIGINT`, para o timer de notificações, fecha o Fastify e desconecta o Prisma, com limite de 10 segundos. O processo fica em foreground e falha fechado em configuração ou conexão inválida.

`/health` apenas confirma que o processo HTTP responde. `/ready` executa `SELECT 1` com timeout de dois segundos e retorna somente `ready` ou `not_ready`; o healthcheck de ativação permanece `/health` porque a inicialização já exige conexão com o banco. Ambos são públicos, sem dados internos e sem request log rotineiro.

Somente `prisma migrate deploy` é autorizado no pre-deploy. Não usar `migrate dev`, `db push`, `migrate reset` ou seed no startup. O build executa `prisma generate`; todas as migrations existentes devem permanecer versionadas.

### Variáveis do Railway

| Variável | Obrigatória | Orientação segura |
|---|---:|---|
| `NODE_ENV` | sim | `production` |
| `PORT` | injetada pelo Railway | inteiro válido; não fixar se a plataforma fornecer |
| `DATABASE_URL` | sim | URL MySQL do provedor/cofre, usuário exclusivo; nunca imprimir ou versionar |
| `FRONTEND_ORIGIN` | sim | origem HTTPS exata da Netlify, sem barra final; múltiplas somente se intencionais |
| `ALLOWED_HOSTS` | sim | hostname público exato do backend Railway; `healthcheck.railway.app` é incluído internamente |
| `COOKIE_SECURE` | sim | `true` |
| `CSRF_SECRET` | sim | segredo aleatório externo, pelo menos 32 caracteres |
| `SESSION_DURATION_HOURS` | não | padrão `8`, inteiro de 1 a 168 |
| `LOG_LEVEL` | não | padrão `info`; `silent` é recusado em produção |
| `TRUST_PROXY` | não | manter `false` nesta topologia inicial |
| `TZ` | recomendado | `America/Fortaleza` |
| `IMPORT_MAX_FILE_SIZE_MB` | não | padrão documentado `10` |
| `IMPORT_MAX_ROWS` | não | padrão documentado `10000` |

`TRUST_PROXY` permanece deliberadamente `false`: os ranges/hops efetivos da cadeia Netlify → Railway não foram comprovados sem a implantação. Isso impede spoofing de `X-Forwarded-For`, mas agrega limites anônimos pelo IP visto pelo backend. Na Etapa 8B, validar headers reais e proteção de borda antes de confiar em qualquer hop; nunca usar `trustProxy:true` genericamente.

O scheduler diário vive no processo web. A implantação inicial deve usar uma única réplica para evitar rotinas duplicadas e limites em memória inconsistentes. Antes de escalar, mover agendamento/limites para coordenação compartilhada. O sistema não depende do filesystem persistente; upload e processamento são em memória/worker e migrations rodam em container separado.

## Frontend na Netlify — Etapa 8C

`netlify.toml` já define a base `frontend`, o build `npm run build:netlify`, publicação de `dist` e Node 22. O painel deve fornecer:

| Variável | Escopo | Valor |
|---|---|---|
| `API_PROXY_TARGET` | build | origem HTTPS pública exata do backend Railway, sem caminho/credenciais/query |
| `VITE_API_BASE_PATH` | build/browser | opcional; manter `/api` |

`API_PROXY_TARGET` não é segredo, porém não é embutida no JavaScript: ela existe para gerar `dist/_redirects`. Se faltar ou for insegura, o build da Netlify falha. Variáveis `VITE_*` são públicas no bundle e jamais devem conter tokens, senhas ou URLs credenciadas.

O build gera:

- proxy `/api/*` para o Railway, removendo o prefixo `/api`;
- fallback `/* /index.html 200`, sempre depois do proxy;
- CSP same-origin, `nosniff`, frame deny, referrer e Permissions-Policy;
- HTML/rotas sem cache persistente e assets com hash em cache imutável de um ano.

HSTS não foi duplicado no arquivo estático: HTTPS/HSTS e domínio são responsabilidade da plataforma e devem ser confirmados no ambiente publicado. Testar acesso direto e refresh em `/`, `/login`, `/equipamentos`, `/dashboard`, `/notificacoes` e `/usuarios`; a aplicação atual usa navegação interna, mas todas as URLs devem receber o shell da SPA sem 404. Confirmar também que `/api/health` devolve JSON, nunca `index.html`.

## Checklist pós-deploy obrigatório

1. Confirmar migrations aplicadas e `/health`/`/ready` sem detalhes internos.
2. Verificar login/logout, cookie `Secure`, `HttpOnly`, `SameSite=Strict`, Path `/` e ausência de token no storage.
3. Confirmar CORS/origem exata e recusa de origem/Host externos; validar CSRF em POST/PATCH/DELETE.
4. Testar administrador, visualizador e alteração de senha, inclusive revogação de sessão.
5. Criar, consultar, editar, arquivar/restaurar um equipamento fictício e conferir histórico.
6. Importar planilha fictícia pequena e outra próxima de 10 MiB; confirmar que proxy, timeout e mensagens permanecem corretos.
7. Validar dashboard, notificações e scheduler às 08:00 em `America/Fortaleza` com uma réplica.
8. Inspecionar CSP/headers/cache em HTML e assets, bundle sem segredo/source map e logs redigidos.
9. Enviar `SIGTERM` em homologação e observar parada sem requisições truncadas ou timer pendente.
10. Configurar monitoramento contínuo externo: o healthcheck Railway atua no deploy, não substitui uptime/alertas.

## Limites da validação local

Os testes locais cobrem configuração, Host, readiness, shutdown, CORS/cookies/CSRF existentes, resolução da API, ordem de proxy/fallback e headers gerados. Vite preview é apenas uma prévia local e não reproduz TLS, CDN, limites do proxy, headers da borda, DNS, política de reinício ou sinais do Railway. Esses itens continuam bloqueadores das Etapas 8B/8C e não devem ser declarados aprovados antes de uma publicação controlada.

Referências oficiais consultadas em 17/09/2026: [Railway healthchecks](https://docs.railway.com/deployments/healthchecks), [Railway pre-deploy](https://docs.railway.com/deployments/pre-deploy-command), [Netlify rewrites/proxies](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/), [Netlify configuration](https://docs.netlify.com/build/configure-builds/file-based-configuration/), [Vite environment variables](https://vite.dev/guide/env-and-mode) e [Prisma Migrate](https://docs.prisma.io/docs/cli/migrate).
