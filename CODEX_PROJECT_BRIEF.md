# New Shoes Control — Manual de contexto e implementação

## 1. Finalidade deste arquivo

Este arquivo é o contrato técnico e funcional do projeto New Shoes Control. Antes de alterar qualquer código, o agente deve:

1. Ler `AGENTS.md` integralmente.
2. Ler este arquivo integralmente.
3. Inspecionar o repositório, o `git status`, o schema Prisma e os arquivos existentes.
4. Ler a documentação local relevante do Next.js 16 em `node_modules/next/dist/docs/` antes de usar APIs do framework.
5. Explicar o diagnóstico e o plano antes de implementar.

Não assumir que uma funcionalidade está pronta apenas porque está descrita aqui. Sempre conferir o código real.

---

## 2. Forma de trabalho

João é o desenvolvedor do projeto e está aprendendo. O agente deve atuar como Desenvolvedor Sênior/Tech Lead, explicando o porquê antes do como.

Cada funcionalidade deve seguir este fluxo:

1. Entender a necessidade de negócio.
2. Consolidar as regras de negócio.
3. Modelar a solução.
4. Explicar a arquitetura e os impactos.
5. Implementar apenas o escopo combinado.
6. Testar com `lint`, `build` e testes específicos.
7. Mostrar o diff e sugerir o commit.

Não fazer várias funcionalidades grandes de uma vez. Não fazer commit sem solicitação ou confirmação do João.

Ao orientar mudanças manuais, informar o caminho exato do arquivo e o local exato da alteração. Quando houver risco de erro com imports ou chaves, fornecer o arquivo completo.

---

## 3. Objetivo do produto

Sistema web interno da lavanderia de tênis New Shoes para controlar:

- Produção em andamento e concluída.
- Tempo gasto por funcionário e processo.
- Pausas, almoço e continuações.
- Retornos e retrabalho.
- Comissões.
- Funcionários, permissões e processos.
- Dashboard gerencial quase em tempo real.
- Relatórios por funcionário, data e processo.

O sistema será usado inicialmente por uma equipe pequena. A solução deve ser simples de operar e manter, mas sem bloquear crescimento futuro.

Nada importante deve ficar hardcoded. Pessoas, processos, permissões e valores devem ser cadastráveis no banco. Nomes e regras atuais podem entrar no seed apenas como dados iniciais.

---

## 4. Tecnologias e arquitetura

- Next.js 16.3.4 com App Router.
- TypeScript em modo estrito.
- Tailwind CSS.
- Route Handlers do Next.js para a API.
- PostgreSQL.
- Prisma 7.10.0.
- `@prisma/adapter-pg` e `pg`.
- Recharts para gráficos, quando chegarmos aos relatórios.
- Leitura de QR/código no navegador; avaliar `html5-qrcode` somente na etapa correspondente.

Separação obrigatória:

```text
Página/Componente -> Service -> Repository -> Prisma -> PostgreSQL
```

Regras de negócio ficam nos services. Repositories fazem acesso a dados. Páginas e Route Handlers não devem acessar Prisma diretamente.

Para operações críticas, como finalizar produção e gerar comissão, usar transação para impedir estado parcial ou comissão duplicada.

---

## 5. Estado conhecido do projeto

Commits já realizados:

- `a73b5ae feat: configure PostgreSQL database foundation`
- `8845218 feat: add individual PIN access foundation`
- `450531e feat: add employee PIN login API`

Infraestrutura já validada em algum momento:

- Prisma e Prisma Client em `7.10.0`.
- PostgreSQL local iniciado com `prisma dev`.
- Migrações aplicadas.
- Seed executado.
- Script de conferência do banco executado.
- `npm run lint` e `npm run build` passaram após o commit da API de login.
- GET `/api/employees` foi testado.
- POST `/api/auth/login` foi testado com PIN inicial `0000`.

Arquivos conhecidos:

- `lib/prisma.ts`
- `repositories/employee.repository.ts`
- `repositories/management-session.repository.ts`
- `services/auth.service.ts`
- `types/auth.types.ts`
- `utils/auth.ts`
- `app/api/employees/route.ts`
- `app/api/auth/login/route.ts`
- `prisma/schema.prisma`
- `prisma/seed.ts`
- `scripts/check-database.ts`

### Atenção ao retomar

Houve trabalho não confirmado para troca de PIN. O agente deve inspecionar se existem atualmente:

- função `changeEmployeePin` em `services/auth.service.ts`;
- função `findActiveSession` no repository de sessões;
- função `updateEmployeePin` no repository de funcionários;
- código `INVALID_SESSION` em `types/auth.types.ts`;
- arquivo `app/api/auth/change-pin/route.ts`.

Não recriar nem sobrescrever cegamente. Primeiro rodar:

```bash
git status --short
npm run lint
npm run build
```

Existiam alterações alheias ao escopo no `README.md` e arquivos/pastas gerados automaticamente (`.agents`, `.claude`, `.windsurf`, `skills-lock.json`). Preservar e não misturar em commits sem revisão.

---

## 6. Usuários e acesso

Dados iniciais atuais:

- João: funcionário; Higienização e Finalização.
- Julia: funcionária; Higienização e Finalização.
- Paola: funcionária; Finalização e Pintura.
- Maria Eduarda: Gerência.
- Murilo: Gerência.

Confirmar com João antes de corrigir grafia de nomes já gravados no banco.

Regras de autenticação:

- Todos os usuários têm PIN individual.
- PIN inicial: `0000`.
- No primeiro acesso, a troca do PIN é obrigatória.
- O seed não pode redefinir um PIN que o usuário já alterou.
- PIN armazenado somente como hash.
- Sessão atual configurada para 10 horas por `AUTH_SESSION_HOURS=10`.
- Após expirar, basta autenticar novamente.
- Gerência possui a permissão `management.access`.
- Funcionários comuns não acessam a área gerencial.
- Gerência pode redefinir o PIN de alguém para `0000`, forçando nova troca.

O modelo existente se chama `ManagementSession`, embora a sessão já seja usada por todos. Uma renomeação para `AuthSession` pode ser feita futuramente, mas não é prioridade e não deve bloquear a entrega.

---

## 7. Processos e comissões

### Higienização

- João e Julia inicialmente autorizados.
- Sempre par completo.
- Comissão atual: R$ 0,50.

### Finalização

- João, Julia e Paola inicialmente autorizados.
- Pode ser par completo, pé esquerdo ou pé direito.
- Par: R$ 0,50.
- Pé esquerdo: R$ 0,25.
- Pé direito: R$ 0,25.
- Se duas pessoas finalizarem um pé cada, cada uma recebe R$ 0,25.
- Manter o enum atual com `PAIR`, `LEFT_FOOT` e `RIGHT_FOOT`.
- Se o pé esquerdo já foi registrado, oferecer apenas o direito, e vice-versa.
- Impedir que um terceiro registro gere comissão para o mesmo par/processo.
- Um registro de par completo não pode coexistir com registros separados dos pés no mesmo ciclo padrão.

### Pintura

- Paola inicialmente autorizada.
- Sempre par completo.
- Comissão atual: R$ 1,00.

### Regras gerais

- Valores e autorizações vêm do banco.
- Alterações de comissão feitas pela gerência valem apenas para produções futuras.
- `CommissionEntry` guarda o valor efetivamente concedido como histórico.
- Nunca recalcular comissões antigas usando o valor atual.

---

## 8. Código do tênis e ciclo de entrada

- Cada entrada do tênis na New Shoes recebe um código aleatório novo.
- O código serve somente para identificar aquele tênis naquele ciclo interno.
- Não cadastrar modelo, marca, cor, foto ou cliente nesta primeira versão.
- O mesmo código passa por Higienização, Finalização e, quando necessário, Pintura.
- Todo tênis sempre passa por Higienização e Finalização.
- Pintura é opcional.
- Se o mesmo calçado voltar meses depois para um novo serviço, recebe outro código e vira outra entrada.

Decisão confirmada por João: quando for retorno por problema, o tênis mantém o mesmo código original e o mesmo registro de `Shoe`. O retrabalho é registrado como uma nova produção de tipo `RETURN`, vinculada à produção original, com motivo obrigatório e sem gerar nova comissão.

---

## 9. Leitura do código

- O leitor deve somente extrair o texto/código do QR.
- Nunca navegar para URL contida no QR.
- O código lido deve ser mostrado para confirmação.
- Sempre oferecer digitação manual como alternativa.
- Se a câmera ou leitura falhar, todo o fluxo precisa continuar manualmente.
- Usuário escolhe o processo antes de ler o código.
- O processo pode permanecer selecionado para os próximos tênis.
- Cada novo tênis exige confirmação rápida.

Se já houver produção em andamento e outro código for lido:

1. Mostrar confirmação rápida: “Finalizar o atual e começar o próximo?”
2. Confirmando, finalizar corretamente o atual e iniciar o novo.
3. Cancelando, manter o atual em andamento.

Não finalizar silenciosamente sem confirmação.

---

## 10. Pausa, continuação e tempo

### Pausa

- Interrupção temporária, como banheiro ou almoço.
- Pausar encerra apenas a sessão de tempo atual, não conclui a produção.
- Retomar cria uma nova sessão de tempo vinculada à mesma produção.

### Continuação

- Serviço formalmente deixado incompleto e retomado depois.
- Pode acontecer no mesmo dia, depois do almoço ou em outro dia.
- Nunca inferir continuação apenas pela mudança de data ou turno.
- Continuação permanece vinculada à produção original.
- Não gera outra comissão.
- Ao entrar, mostrar serviços pendentes e permitir “Continuar” ou “Deixar para depois”.
- Ao ler um código com serviço incompleto do mesmo funcionário/processo, perguntar se deseja continuar.

### Horários de referência

- Manhã: 09h–13h.
- Tarde: 14h–18h.
- São referências para organização e relatórios, não regras rígidas.
- Não pausar automaticamente às 13h nem às 18h.
- A rotina real pode atrasar e a ação do usuário prevalece.

### Almoço

O almoço deve ser um registro do funcionário, separado da produção, pois a pessoa pode almoçar sem estar com um tênis aberto.

Fluxo desejado:

1. Funcionário toca em “Iniciar almoço”.
2. Se houver produção ativa, ela é pausada.
3. Registrar horário real de saída.
4. Funcionário toca em “Voltei do almoço”.
5. Registrar horário real de retorno.
6. Se havia produção pausada, perguntar se deseja continuar.

Gerência pode corrigir horário esquecido, mantendo registro de quem corrigiu, quando e o motivo.

---

## 11. Retorno

Retorno é um serviço que havia sido concluído e entregue, mas voltou por sujeira ou problema.

Tipos funcionais:

- Retorno Higienização.
- Retorno Finalização.
- Retorno Pintura.

Modelar preferencialmente com `ProductionKind.RETURN` junto do processo correspondente, evitando três processos duplicados hardcoded.

Regras:

- Retorno não gera comissão.
- Manter a comissão original.
- Motivo do retorno é obrigatório.
- Guardar vínculo com a produção original.
- Mostrar quem realizou o serviço original.
- Preferencialmente o responsável original refaz, mas não bloquear outra pessoa.
- Se outra pessoa assumir, avisar claramente e registrar responsável original e responsável pelo retrabalho.
- A gerência pode transferir/corrigir quando necessário.

---

## 12. Saídas manuais e correções

A operação real não funciona sempre de forma perfeita. Todo caminho automático importante precisa de uma alternativa manual:

- Digitar código.
- Alterar processo antes de confirmar.
- Marcar retorno manualmente.
- Informar motivo do retorno.
- Marcar continuação manualmente.
- Pausar, retomar e finalizar manualmente.
- Cancelar uma leitura errada antes de salvar.

Correções históricas de horários, responsáveis, retornos e produção são exclusivas da gerência, para evitar que funcionários alterem dados que afetam a própria comissão.

Toda correção material deve guardar autor, data e motivo. Evitar apagar histórico; preferir cancelamento/inativação e trilha de auditoria.

---

## 13. Frontend

Prioridade absoluta: celular primeiro, computador depois.

### Interface do funcionário

- Uma coluna no celular.
- Botões grandes e textos diretos.
- Sem depender de hover.
- Código/leitor como ação central.
- Processo atual e cronômetro sempre visíveis.
- Ações principais: ler/digitar código, confirmar, pausar, continuar, finalizar e almoço.
- Poucas decisões por tela.
- Feedback visual claro de sucesso e erro.

Fluxo básico:

1. Selecionar nome.
2. Digitar PIN.
3. Trocar PIN se obrigatório.
4. Ver pendências.
5. Escolher processo.
6. Ler ou digitar código.
7. Confirmar rapidamente.
8. Acompanhar produção atual.

### Interface da gerência

- Rota separada e protegida por sessão/permissão.
- Cards e listas responsivas no celular.
- Tabelas e navegação mais ampla no computador.
- Produção atualizada automaticamente a cada 5–10 segundos na primeira versão.
- Evitar WebSocket inicialmente; a equipe é pequena e polling é mais simples e suficiente.

Painel ao vivo deve mostrar, no mínimo:

- funcionário;
- processo atual;
- código;
- status;
- horário de início;
- tempo decorrido;
- almoço/pausa/disponível.

---

## 14. Autonomia da gerência

O sistema precisa funcionar diariamente sem depender do João ou de alteração no código.

A gerência deverá conseguir:

- Cadastrar, editar e desativar funcionários.
- Definir processos autorizados por funcionário.
- Redefinir PIN para `0000` e exigir troca.
- Cadastrar e desativar processos.
- Alterar valores de comissão para o futuro.
- Consultar produção e comissões.
- Corrigir registros e horários com justificativa.
- Consultar retornos.
- Gerar relatórios.

Não excluir definitivamente funcionários ou dados históricos que já tenham produção relacionada.

---

## 15. Atualização quase em tempo real

Para a primeira versão, o dashboard gerencial consulta a API automaticamente a cada 5–10 segundos.

O PostgreSQL é a fonte de verdade. A interface não deve calcular estado permanente sozinha.

Se o sistema crescer para várias unidades ou muitos usuários simultâneos, a atualização poderá migrar para SSE/WebSocket sem mover as regras dos services.

---

## 16. Próxima ordem de implementação

### Etapa 0 — Auditoria do estado real

- Ler instruções.
- Conferir `git status` e últimos commits.
- Inspecionar arquivos de autenticação.
- Rodar lint e build.
- Informar exatamente o que está pronto, parcial ou ausente.

### Etapa 1 — Concluir autenticação

- Concluir service e endpoint de troca de PIN.
- Implementar consulta da sessão atual.
- Implementar logout/revogação da sessão.
- Testar login, cookie, troca de PIN, expiração, bloqueio e permissões.
- Criar commit isolado após revisão.

### Etapa 2 — Consolidar a modelagem da produção

- Aplicar a decisão confirmada: retorno mantém o código original e o mesmo `Shoe`, com uma nova produção `RETURN` vinculada à produção original.
- Modelar motivo obrigatório do retorno.
- Modelar almoço/intervalo do funcionário.
- Modelar auditoria de correções gerenciais.
- Validar como impedir duplicidade de pé/par e comissão.
- Criar migração pequena e revisável.

### Etapa 3 — Núcleo de produção

- Repositories.
- Services com máquina de estados e transações.
- Iniciar, pausar, retomar, continuar, finalizar e cancelar.
- Troca rápida de código com confirmação.
- Comissão somente na conclusão válida de produção padrão.
- Retorno sem comissão.

### Etapa 4 — APIs da produção

- Endpoints protegidos por sessão.
- Validação explícita dos dados.
- Mensagens de erro próprias para a interface.
- Testes de autorização e concorrência básica.

### Etapa 5 — Frontend de autenticação

- Seleção de funcionário.
- Login por PIN.
- Troca obrigatória de PIN.
- Logout.

### Etapa 6 — Frontend mobile de produção

- Seleção de processo.
- Leitura/digitação de código.
- Confirmação rápida.
- Produção ativa, cronômetro e ações.
- Pausa, continuação, retorno e almoço.

### Etapa 7 — Dashboard gerencial ao vivo

- Consulta periódica.
- Status dos funcionários.
- Produções em andamento e alertas.

### Etapa 8 — Administração

- Funcionários, permissões, processos, valores e PIN.
- Correções com auditoria.

### Etapa 9 — Relatórios

- Por dia, período, funcionário e processo.
- Quantidades, tempos, retornos e comissão.
- Exportação pode ser avaliada depois do relatório básico.

### Etapa 10 — Produção

- Banco hospedado.
- Migrações de produção.
- Variáveis seguras.
- Backups.
- Testes com a equipe.
- Treinamento e implantação gradual.

---

## 17. Critérios de qualidade

Antes de considerar uma etapa concluída:

- Regra explicada e aprovada.
- Sem valores ou nomes hardcoded fora do seed/configuração apropriada.
- Autorização verificada no servidor, não apenas na interface.
- Operações financeiras protegidas contra duplicidade.
- Datas armazenadas corretamente e exibidas no horário de Bauru/São Paulo.
- Erros tratados com mensagem compreensível.
- Fluxo manual disponível quando necessário.
- `npm run lint` passa.
- `npm run build` passa.
- Teste do fluxo principal passa.
- Diff revisado.
- Commit pequeno e descritivo.

---

## 18. Primeira instrução recomendada ao Codex

Copiar e enviar:

> Leia integralmente `AGENTS.md` e `CODEX_PROJECT_BRIEF.md`. Depois inspecione o repositório, `git status`, os três últimos commits, o schema Prisma e todos os arquivos atuais de autenticação. Rode `npm run lint` e `npm run build`. Não altere nenhum arquivo ainda. Entregue um diagnóstico objetivo separando o que está pronto, parcial e ausente, e proponha somente os próximos passos necessários para concluir a troca de PIN e a sessão atual.

Depois de revisar o diagnóstico, autorizar apenas uma etapa por vez.
