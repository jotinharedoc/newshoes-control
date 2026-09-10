# Organização e evolução

O documento principal é [`../CODEX_PROJECT_BRIEF.md`](../CODEX_PROJECT_BRIEF.md), fornecido por João com as decisões acordadas. Este arquivo descreve a implementação atual e não substitui nem redefine as regras do manual.

## Responsabilidades

- `app`: páginas, navegação e endpoints HTTP. Validar o formato da entrada; delegar regras aos serviços.
- `components`: interface e interação. Nunca consultar o banco ou decidir autorização apenas no navegador.
- `services`: regras de negócio e autorização. Reutilizar `requireAccess(token, permission?)` nos futuros serviços protegidos.
- `repositories`: consultas e persistência com Prisma.
- `utils/access.ts`: códigos de permissão e decisão de destino após autenticação.
- `lib/auth-http.ts` e `lib/auth-page.ts`: adaptação da autenticação para HTTP e páginas do Next.js.
- `tests`: testes das regras importantes sem acessar o banco real.

Cada página protegida verifica a sessão no servidor. Uma futura API deve verificar acesso também, mesmo quando chamada por uma página já protegida. A lista de nomes usada no login é pública por fazer parte do fluxo de seleção de funcionário; ela não retorna PINs nem permissões.

## Acesso implementado

Login por funcionário e PIN; troca obrigatória do PIN provisório; troca voluntária; sessão com token armazenado como hash; logout com revogação; bloqueio de funcionário/cargo inativo; permissão `management.access` para gerência.

As páginas de produção e gerência são pontos de entrada protegidos. Ainda não registram produção nem oferecem cadastros ou relatórios.

## Próximas etapas

Seguir a seção 16 do manual: concluir e validar autenticação; consolidar a modelagem; implementar núcleo e APIs de produção; frontend; dashboard; administração; relatórios e implantação. As telas básicas de autenticação foram antecipadas durante o trabalho anterior à leitura do manual.

A autenticação passou em testes com persistência simulada. Ainda falta validar o fluxo completo com navegador, cookies e uma base de teste antes de considerar a etapa concluída. A consulta da sessão atual existe como serviço, sem endpoint dedicado.

## Regras já acordadas e pendências

- A troca de código exige confirmação para finalizar o atual e iniciar o próximo; nunca finalizar silenciosamente.
- Retorno exige motivo, vínculo com a produção original e não gera comissão. Preserva-se a comissão original.
- Continuação mantém a produção original e não gera outra comissão; não deve ser inferida pela data ou turno.
- Almoço é um registro do funcionário, separado da produção. Não há pausas automáticas em horários fixos.
- Correções materiais são gerenciais, com autor, data e motivo.
- Valores alterados valem para produções futuras e não modificam comissões históricas.
- Decisão confirmada por João: retorno mantém o código original e o mesmo registro de `Shoe`. Registrar o retrabalho como uma nova produção `RETURN`, vinculada à produção original, com motivo obrigatório e sem nova comissão. Essa regra ainda precisa ser implementada.

Essas regras de produção ainda não foram implementadas. O schema atual precisa ser complementado conforme a etapa 2 do manual, incluindo motivo de retorno, almoço e auditoria.

## Preservação de histórico

Ao implementar produção, salvar o valor calculado em `CommissionEntry.amount`; mudanças futuras em `ProcessRule` não devem recalcular lançamentos antigos automaticamente. Operações que precisam acontecer juntas devem usar uma transação. Alterações estruturais no banco devem gerar migrations; não modificar migrations já aplicadas.

## Validação local

- `npm test`: autenticação e autorização com persistência simulada, sem alterar dados reais.
- `npm run lint`: análise estática.
- `npm run build`: compilação e checagem de tipos.
- Teste manual com contas de teste: login → troca obrigatória → área permitida → logout; tentar abrir `/gerencia` como funcionário e abrir áreas protegidas sem sessão.

O teste completo com PostgreSQL deve usar uma base de desenvolvimento/teste. Não executar o seed em produção para validar o login.
