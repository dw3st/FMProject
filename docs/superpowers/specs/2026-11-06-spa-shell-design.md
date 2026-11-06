# Página única (moldura fixa) e visual padronizado

Pedido do usuário (2026-11-06): trocar de tela sem recarregar o site e, depois, padronizar a moldura (barras, menus,
abas, cartões) com arte pintada no ComfyUI. Cada fase é mostrada ao usuário antes da seguinte; nada vai para produção
antes de todas as fases e layouts aprovados. Branch `spa-shell`.

## Medição de hoje (servidor local em modo produção, cache quente)

| Tela | Pronta (LCP) | Chamadas à API na troca |
|---|---|---|
| Painel | 344 ms | 64 (rostos e escudos inclusos) |
| Elenco | 140 ms | 14 |

Das 14 chamadas do Elenco, 10 são da moldura e se repetem em toda troca: `config`, `art/faces`, `auth/me`, `presence`,
`social/me`, `social/friends`, `worlds/invites`, `leagues`, `saves/:id`, `inbox`. Também a cada troca: o socket social
reconecta, o chat e a janela de assistir reabrem, a tela pisca em branco. Em produção cada chamada paga a rede.

## Fase 1: a moldura fixa (19 telas)

- **Uma página, `src/pages/app/`**, servida nas rotas das 19 telas que usam o `Layout` (Painel, Elenco, Jogador,
  Formação, Clube, Desenvolvimento, Finanças, Equipe técnica, Ligas, Mercado, Olheiro, Estatísticas, Caixa de entrada,
  Conquistas, Notícias, Mundo, Fim de temporada, Sala do jogo, "em breve"). As outras páginas continuam como são.
- **Roteador próprio, sem dependência** (`src/GameInterface/router/`): tabela de rotas (caminho → tela e título),
  `navigate(to, { replace })` e `useRoute()`. Fora da moldura (ou para um caminho que não é dela), `navigate` cai no
  carregamento normal: as telas de fora continuam funcionando sem mudança.
- **Links:** um ouvinte de clique no documento intercepta `<a href>` interno de rota da moldura (botão esquerdo, sem
  Ctrl/Shift/Meta, sem `target` nem `download`). Nenhum link precisa mudar.
- **Redirecionamentos no código:** os `window.location.href = …` viram `navigate(…)` (troca mecânica).
- **A tela remonta a cada navegação** (chave = caminho + busca): quem lê a busca da URL ao montar continua igual a hoje.
  A moldura (barras, amigos, chat, janela de assistir, avanço em grupo) fica montada.
- **Dados:** a cada navegação, `refresh({ background: true })` do `GameSaveProvider` (sem tela de carregando).
- **Título da aba do navegador, rolagem no topo, botão voltar e avançar do navegador** (`popstate`).
- **O que lê `location` para decidir** (aba ativa da barra, "Sem clube", redirecionamento da sala de espera) passa a
  ler `useRoute()`.

## Fase 2: a partida num quadro

- Prévia e resultado ficam como hoje na fase 2a; na 2b viram telas da moldura.
- A partida (`/match`) abre num quadro dentro da moldura, com as barras escondidas. O quadro avisa por `postMessage`
  quando o jogo termina; a moldura vai ao resultado e apaga o quadro. Sair no meio pede confirmação.
- Se o quadro der problema (som, tela cheia, celular), a partida abre como hoje.

## Fase 3: moldura pintada

Mock com 2 ou 3 direções pintadas no ComfyUI (barra superior, abas, cartões, botões, ícones), escolha do usuário,
depois as peças padrão aplicadas em todas as telas.

## Testes

Roteador e interceptação de links com testes puros; todas as rotas da moldura abertas no navegador (clicar em cada aba,
voltar e avançar, recarregar numa rota com busca); a página da partida e as de fora sem mudança; tamanho do pacote antes
e depois.

## Riscos

- Primeiro carregamento maior (um pacote com as 19 telas).
- Dado velho entre telas: coberto pela remontagem e pelo `refresh` em segundo plano.
- Um efeito de tela que não limpa o que abriu (ouvinte, intervalo, socket) passaria a vazar: conferir na revisão.
