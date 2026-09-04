# Instruções do projeto

Antes de implementar qualquer funcionalidade, leia:
- `documentacao_sistema_onecare.md`

## Regras

- Desenvolva uma etapa por vez.
- Não implemente funcionalidades futuras sem autorização.
- Use JavaScript, não TypeScript.
- Use Node.js, Fastify, Prisma, MySQL, React, Vite e Tailwind CSS.
- Não altere o banco sem criar uma migration.
- Execute testes, lint e build depois de alterações relevantes.
- Não considere uma tarefa concluída se os testes falharem.
- Não instale dependências desnecessárias.
- Não altere arquivos sem relação com a tarefa atual.
- Mantenha `.env` fora do Git.
- Explique resumidamente o que foi alterado.

## Git e checkpoints

- Crie um commit local ao concluir cada etapa ou funcionalidade relevante.
- Somente crie o commit se os testes, o lint e o build aplicáveis passarem.
- Revise `git diff` e `git status` antes do commit.
- Não versione `.env`, `node_modules`, `dist`, logs ou arquivos sensíveis.
- Use Conventional Commits.
- Não use `--no-verify` ou `--amend`.
- Nunca execute `git push` sem autorização explícita do usuário.
