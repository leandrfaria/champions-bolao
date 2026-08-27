# Champions Bolão

Versão atual: **1.17.0**

Bolão privado entre amigos, feito com React + Vite + Supabase. A quantidade de participantes é dinâmica e acompanha os usuários cadastrados no projeto.

## Regras implementadas

- 1 ponto por acertar vencedor ou empate.
- +2 pontos quando o placar é exato (3 pontos no total).
- Cada usuário pode criar ou alterar seu palpite somente antes do horário de início da partida.
- Antes do horário de início da partida, cada usuário enxerga apenas o próprio placar.
- Depois do horário de início da partida, os palpites de todos ficam visíveis.
- O administrador cadastra temporadas, rodadas, jogos e resultados, mas não recebe permissão especial para ver palpites antes do horário de início da partida.
- Feed de atividades registra acessos, palpites, alterações, criação de rodadas/jogos e resultados sem registrar o conteúdo secreto do palpite.

## Requisito local

Use Node.js 20.19+ ou 22.12+ (requisito do Vite 8).

## 1. Configurar o banco

No Supabase:

1. Abra **SQL Editor**.
2. Crie uma nova query.
3. Copie todo o conteúdo de `supabase/setup.sql`.
4. Clique em **Run**.

O script é idempotente o suficiente para uma instalação nova. Recomenda-se executá-lo em um projeto vazio.

## 2. Criar os usuários

No Supabase, vá em **Authentication > Users > Add user > Create new user**.

Crie inicialmente estes emails (o site converte o nome de usuário para emails `@champions-bolao.app` automaticamente):

- `leandro@champions-bolao.app`
- `caio@champions-bolao.app`
- `joao@champions-bolao.app`
- `matheus@champions-bolao.app`
- `leonardo@champions-bolao.app`
- `bruno@champions-bolao.app`

Defina uma senha para cada um e crie os usuários como confirmados.

O trigger do banco cria automaticamente os perfis. O usuário `leandro` vira administrador automaticamente. Você pode criar jogadores adicionais manualmente no Dashboard usando o padrão `usuario@champions-bolao.app`; não é necessário alterar o código para eles conseguirem entrar.

## 3. Rodar o projeto

```bash
npm install
npm run dev
```

Abra a URL exibida pelo Vite (normalmente `http://localhost:5173`).

Faça login usando somente o nome, por exemplo:

- usuário: `leandro`
- senha: a senha cadastrada no Supabase

## 4. Primeiro uso

Entre como `leandro` e abra **Administração**:

1. Crie/ative a temporada.
2. Crie uma rodada.
3. Cadastre os jogos e horários.
4. Cada jogador faz seu palpite.
5. Quando o jogo começar, o banco bloqueia alterações automaticamente.
6. Depois do jogo, o administrador informa o placar final.
7. A classificação é recalculada a partir dos dados.

## Segurança

A segurança importante não depende do React. O arquivo `setup.sql` configura Row Level Security no PostgreSQL.

Mesmo que alguém tente usar o console do navegador diretamente:

- não consegue consultar os palpites de outras pessoas antes do horário de início da partida;
- não consegue criar/alterar um palpite de outra pessoa;
- não consegue alterar o próprio palpite depois do horário de início da partida;
- um usuário comum não consegue cadastrar rodadas, jogos ou resultados;
- o admin não ganha bypass para visualizar palpites secretos.

A aplicação usa a `VITE_SUPABASE_PUBLISHABLE_KEY`, que é uma chave pública de cliente. Nunca coloque uma secret key/service role no React.

## Deploy

O projeto inclui:

- `vercel.json` para SPA na Vercel;
- `public/_redirects` para Netlify.

Ao publicar, configure estas variáveis de ambiente no painel da Vercel:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`


## Atualização 1.1

- Nova página **Sobre** com regulamento completo do bolão.
- Regras de pontuação 0/1/3 documentadas.
- Placar em mata-mata considera 120 minutos quando houver prorrogação; disputa de pênaltis não entra no placar.
- Desempate oficial aplicado ao ranking: pontos, placares exatos e resultados corretos.
- Regras do Pix inicial de R$50 e adicional de R$10 do último colocado.
- Regra de escolha dos seis jogos da fase de liga documentada sem fixar uma ordem de participantes.
- Regra de sorteio substituto quando um responsável não escolhe seus três jogos dentro do prazo.


## GitHub e Vercel

Este repositório foi preparado para publicação pública. Arquivos `.env` reais são ignorados pelo Git; somente `.env.example` deve ser versionado.

Para desenvolvimento local, copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Na Vercel, crie essas mesmas duas variáveis em **Project > Settings > Environment Variables**.

Não use `service_role`, `sb_secret_*`, senha do banco ou qualquer outro segredo em variáveis `VITE_*`. Veja `SECURITY.md`.

Antes de publicar, garanta que o banco já recebeu a versão mais recente de `supabase/setup.sql`, desative cadastro público no Supabase Auth e mantenha criação de usuários pelo painel `Authentication > Users`.


## Atualização 1.2 — segurança para GitHub

- `.env` real removido do projeto distribuído.
- `.gitignore` bloqueia `.env`, `.env.*` e metadados locais.
- `.env.example` contém somente placeholders.
- Grants de `anon` revogados explicitamente nas tabelas.
- `EXECUTE` de funções/RPCs revogado de `anon` e concedido apenas onde necessário.
- RPC de presença de palpites possui checagem adicional de usuário autenticado.
- Privilégios padrão do schema `public` endurecidos para que novos objetos não sejam expostos automaticamente.
- Instruções de Vercel e Supabase em `SECURITY.md`.
- Login deixou de limitar o acesso aos seis nomes iniciais: novos usuários criados manualmente no Supabase podem entrar usando o prefixo do email como usuário.


## Atualização 1.3 — visual e flexibilidade

- Participantes deixaram de ter qualquer limite fixo no frontend; contadores, presença e classificação usam os perfis reais do Supabase.
- Página **Sobre** refeita com texto mais natural e sem ordem fixa de responsáveis pela escolha dos jogos.
- Termos de interface usam “início da partida” em vez de “kickoff”.
- Nova identidade visual em azul/roxo; a identidade foi consolidada com o troféu a partir da v1.4.
- Classificação redesenhada com líder em destaque e tabela esportiva mais legível.
- Campo de data/horário do admin dividido em controles mais claros e visuais.
- Inputs de gols agora podem ser apagados normalmente antes de digitar outro valor.
- Home simplificada: rodada, jogos abertos/finalizados, palpites e classificação.
- Admin pode excluir uma temporada com confirmação; rodadas, jogos e palpites ligados a ela são apagados em cascata e suas estatísticas deixam de existir.

A v1.3 não exige uma migration adicional se o banco já estiver no setup v1.2: a exclusão em cascata e a política de delete de temporada já faziam parte do schema.


## Atualização v1.4

- O símbolo do projeto e o favicon agora usam um troféu.
- A página **Sobre** foi refeita como uma documentação de regras, com índice lateral, seções e tabelas simples.
- O administrador pode adicionar, trocar e remover fotos dos participantes.
- As fotos ficam no bucket privado `avatars` do Supabase Storage; usuários autenticados podem visualizá-las e somente administradores podem alterá-las.
- As fotos aparecem na sidebar, classificação, ranking da home e palpites revelados.

Se seu banco já estava configurado na v1.3, execute `supabase/upgrade-v1.4.sql` uma única vez antes de usar o gerenciamento de fotos.

## v1.5 — central da rodada e histórico da temporada

A Home foi reconstruída como central da rodada atual, e a tela Rodadas passou a oferecer visões Individual e Geral, filtros por fase, seletor de temporada, timeline e expansão inline. Os escudos são resolvidos de forma centralizada em `src/config/teamLogos.js`, com fallback visual quando um clube ainda não estiver mapeado.

A v1.5 não exige alteração no banco.


## v1.6 — histórico pessoal e centro competitivo

A tela **Meus palpites** agora exibe exclusivamente palpites que o usuário realmente enviou, separados entre em aberto e finalizados, com filtros por status/rodada, desempenho compacto, gráfico de pontos por rodada, edição enquanto a partida ainda permite e histórico em accordion com escudos reais. Jogos sem palpite não entram nesta página.

A tela **Classificação** ganhou visões Geral e Por rodada, Top 3 com fotos/avatares, destaques calculados da temporada, ranking com participantes dinâmicos e suporte visual a empates. A tabela principal foi simplificada para posição, jogador, pontos, exatos e vencedores, sem as colunas “Última rodada” e “Mov.”.

A v1.6 não exige alteração no banco.

## v1.7 — timeline e regulamento visual

- Atividades agora funciona como uma timeline filtrável por Palpites, Rodadas, Resultados e Classificação.
- Logs de login/acesso, pontuação individual e movimentações genéricas de ranking ficam fora do feed.
- A disputa pelo topo pode gerar eventos derivados de liderança e 2º lugar a partir dos resultados reais da temporada ativa.
- Sobre o bolão foi reconstruído como regulamento visual, com fluxo do palpite, exemplos de pontuação, anonimato, ciclo e regras completas em accordion.
- O painel de números do regulamento mostra somente participantes e temporada.

A v1.7 não exige alteração no banco.

## v1.8 — workspace administrativo

- Administração dividida em Visão geral, Rodadas e jogos, Resultados e Participantes.
- Formulários permanentes foram substituídos por modais acionados somente quando necessário.
- Visão geral reúne temporada ativa, rodada atual, presença dos palpites, resultados pendentes, alertas operacionais e rodadas recentes.
- Rodadas e jogos ganhou seletor de temporada/rodada, jogos agrupados por data, escudos, edição e cadastro com preview do confronto.
- Resultados virou uma central separada com pendentes/finalizados e aviso claro para placares de 90/120 minutos.
- Participantes agora usa lista compacta e editor de foto com preview antes do upload.
- `rounds.closed_at` registra o encerramento administrativo de uma rodada. A ação só é liberada quando todos os jogos já possuem resultado e não altera a regra de bloqueio dos palpites.

Se o banco já estava na v1.7, execute `supabase/upgrade-v1.8.sql` uma única vez.

## v1.9 — legibilidade, navegação e responsividade

- Sidebar agora pode ser recolhida para uma barra compacta de ícones; a preferência fica salva no navegador.
- Contraste dos textos secundários foi aumentado e os menores tamanhos tipográficos foram elevados em todo o sistema.
- Tabela da Classificação voltou a um tratamento neutro, sem cores diferentes para cada posição.
- Overflow horizontal de página foi bloqueado e os componentes densos continuam podendo rolar internamente apenas quando necessário.
- A timeline de Atividades não provoca mais scroll lateral da página.
- Upload de fotos passou a confirmar a persistência do `avatar_path` antes de considerar o salvamento concluído.
- `upgrade-v1.9.sql` corrige a permissão de coluna necessária para o administrador persistir fotos em bancos que passaram pelo hardening v1.2.

Se o banco já está na v1.8, execute `supabase/upgrade-v1.9.sql` uma única vez.

## v1.11 — atividades, rodadas e estatísticas

- Home mostra o contador de apostas como `0/N`, com tooltip explicativo.
- Atividades ganhou filtro por rodada, logs de exclusão de rodada/temporada e limpeza administrativa do feed.
- Rodadas possuem acesso direto à tela de jogos e palpites; o detalhe usa os mesmos escudos reais do restante do sistema.
- O indicador/critério `Vencedores` conta também placares exatos quando a partida teve vencedor. Empates não contam nesse critério. A pontuação continua 0/1/3.
- Fotos selecionadas no Admin são normalizadas para um recorte quadrado antes do upload.
- Bancos existentes devem executar `supabase/upgrade-v1.11.sql` uma vez.

## v1.12 — perfis de participantes e mobile

- Avatares maiores e com enquadramento mais aberto para preservar melhor o uniforme.
- Clique em qualquer avatar para abrir um resumo do participante com posição, pontos, exatos, vencedores e taxa de acerto.
- Dentro do perfil, clicar na foto abre a imagem em tela cheia.
- Revisão ampla de responsividade com foco em iPhone 13 (390 px), incluindo navegação, Home, Rodadas, Meus palpites, Classificação, Atividades, Sobre, Administração, modais e detalhes de rodada.
- Legibilidade de Atividades aumentada.
- Visão geral da Administração reorganizada para reduzir informação simultânea.
- Removido o glifo visual da timeline de Rodadas que podia parecer um ícone de imagem quebrado.
- Não existe migration nova na v1.12.


## v1.13 — rodadas e avatares

- Ordenação visual das rodadas em ordem crescente ou decrescente.
- Resumo Geral de Rodadas com estatísticas agregadas da temporada.
- Confrontos compactados nas tabelas de Rodadas e Meus palpites.
- Avatares maiores, preenchendo melhor o círculo, com crop mais consistente em novos uploads.
- Sem migration nova no Supabase.


## v1.15 — Mobile Home + Rodadas

Refinamento específico para smartphones nas telas Início e Rodadas, com layout mobile-first, filtros de fase removidos apenas no mobile, bottom navigation com cinco itens e suporte a safe-area. Não exige migration no Supabase.

## v1.16 — Mobile Classificação + Atividades

Refinamento exclusivo para smartphones nas telas Classificação e Atividades. O desktop permanece com o layout da v1.15. A Classificação recebeu temporada compacta, Top 3 mobile-first, destaques sem repetição do líder e ranking em lista. Atividades ganhou timeline mais densa, filtros compactos e mantém fotos reais nos eventos relacionados a participantes.


## v1.17 — Mobile Sobre + Administração

Refinamento exclusivo para smartphones nas telas Sobre o bolão e Administração. O desktop permanece com a composição da v1.16.

- Sobre mobile em linguagem editorial, com fluxo vertical, exemplos de pontuação empilhados, ciclo do palpite e regulamento fechado em accordions.
- Administração mobile com cabeçalho compacto, ações raras no menu contextual, tabs simplificadas, visão geral operacional 2x2, rodadas/jogos compactos, resultados adaptados e participantes em linhas curtas.
- CTA contextual de adicionar jogo acima da navegação inferior quando a rodada permitir.
- Sem alteração de schema ou migration do Supabase.
