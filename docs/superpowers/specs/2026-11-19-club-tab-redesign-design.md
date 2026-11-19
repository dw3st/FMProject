# Aba Clube em quatro abas

Pedido do usuário (2026-11-19): "tudo confuso, ficou muito complexo". Ficaram bons e não mudam: a imagem do estádio e o
mapa do clube com as instalações, a Loja e o Estoque. Confusos: Oficina e Obras (uma obra pede três abas) e o Público
perdido numa aba própria. Desenho aprovado na conversa. Só a tela muda: preços, receitas, prazos, diretoria, desgaste e
regras do craft (`docs/superpowers/specs/2026-11-18-club-craft-design.md`, `.claude/rules/game/facilities.md`) ficam iguais.

## Abas

Hoje: Instalações, Estádio, Público, Obras, Oficina, Estoque, Loja (sete). Depois, `SegmentedTabs` com quatro:

| Aba | `?tab=` | Conteúdo |
|---|---|---|
| Visão geral (padrão) | `overview` | O mapa do clube com a imagem do estádio (o de hoje) e, ao lado, a lista "O que fazer" |
| Estádio | `stadium` | Setores, conforto e gramado (hoje) + o público (gráfico por jogo, recorde, média) + os patrocinadores do estádio |
| Obras | `works` | Obras e Oficina num fluxo só |
| Materiais | `materials` | Loja e Estoque (os de hoje) como duas partes da mesma aba |

Links antigos: `facilities` → `overview`; `attendance` → `stadium`; `workshop` → `works`; `shop` e `stock` →
`materials` (a parte certa aberta). `/finances?tab=facilities` continua levando ao Clube.

## Visão geral: "O que fazer"

Uma lista em três grupos, calculada só do que a rota `GET /facilities` e o estado do craft já devolvem (nada novo no
servidor, salvo campos que faltarem para a tela):

- **Reformar:** itens com condição abaixo de 70 (âmbar) ou 40 (vermelho), interditados primeiro. Cada linha: nome,
  condição, o efeito perdido em texto curto ("lesões +30%", "público −5%"), o custo da reforma. Reforma pequena (paga
  na hora, `paidNow`): botão **Reformar** na própria linha, com a mesma rota de hoje.
- **Melhorar:** itens abaixo do nível 10 sem obra. Nível atual → próximo, o ganho em uma linha, e a marca **Pronto para
  montar** quando o estoque já tem a receita, senão "faltam N peças".
- **Em andamento:** obras por área (barra de prazo, entrega) e a bancada da oficina (o que está sendo feito, quando fica
  pronto).
- Toda linha tem um botão que abre **Obras com aquela obra escolhida** (`?tab=works&job=<id>`).
- Vazio: "Nada precisa de atenção agora".

## Obras

- **Em cima, a fila:** a bancada da oficina e as obras em andamento, uma por área (estádio, CT, base; a regra de
  hoje).
- **Embaixo, a obra escolhida**, em três passos numa linha:
  1. **Peças:** a receita, com o que tem no estoque e o que falta.
  2. **Fabricar ou comprar o que falta:** "Fabricar" põe os componentes na bancada (materiais do estoque);
     "Comprar o que falta" abre Materiais com o carrinho cheio (o `goToShop` de hoje).
  3. **Começar a obra:** só com tudo no estoque e a área livre; o motivo quando não pode.
- **Ao lado, o seletor de obras** agrupado por área (estádio, CT, base), com a mesma lista de obras de hoje (setor,
  conforto, gramado, troca de grama, reforma, reconstrução, melhoria, obras de grupo).

## Testes

- Funções puras da lista "O que fazer" (agrupamento, ordem, marca de pronto, faltantes) com teste.
- Redirecionamento dos `?tab=` antigos com teste.
- `bun run ui:audit` limpo nos arquivos tocados; i18n en e pt-BR.
- Capturas reais do build de dev (1440 e celular deitado) antes de publicar.

## Fora

Nenhuma regra nova de craft ou de instalações; nenhuma mudança na IA.
