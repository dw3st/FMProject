/**
 * Made-up sponsors of the LED boards (4.38.21; tester report: 100+ of everything, shirts, shops, companies). Invented
 * names only, never a real brand. Each gets one of the panel colour pairs by its index.
 */
const NAMES = [
  // Game and site
  "FMPROJECT", "WESTLAB.DEV",
  // Sportswear and shirts
  "CAMISA 9", "CHUTEIRA 10", "TRAVA FINA", "MEIÃO", "GOLA V", "UNIFORME+", "MANTO SAGRADO", "FIO DE OURO",
  "LINHA DE FUNDO WEAR", "CANELEIRA PRO", "SHORT BRANCO", "ESCANTEIO SPORTS", "MALHA FORTE", "AGASALHO ZERO",
  // Shops and stores
  "LOJA DO TORCEDOR", "MEGA BAZAR", "CASA DAS BOLAS", "MERCADO CENTRAL", "ARMAZÉM DO ZÉ", "PADARIA ESTRELA",
  "FARMÁCIA VIDA", "ÓTICA VISTA", "SAPATARIA PASSO", "PAPELARIA RISCO", "FERRAGENS BRAVO", "PET AMIGO",
  "FLORICULTURA SOL", "LIVRARIA PÁGINA", "BRINQUEDOS PIÃO", "ELETRO JÁ", "MÓVEIS LAR", "CONSTRUA BEM",
  // Food and drink
  "SUCO DO CAMPO", "CAFÉ DO TÉCNICO", "PIPOCA DE OURO", "REFRI GELO", "PIZZA DO CENTRO", "LANCHE RÁPIDO",
  "SORVETE POLAR", "BISCOITO CROC", "ÁGUA CRISTAL", "CHOCOLATE NOBRE", "PÃO QUENTE", "ISOTÔNICO RAIO",
  "MOLHO DA VÓ", "ARROZ BOM GRÃO", "QUEIJO SERRANO", "AÇAÍ DA PRAIA", "CHURRASCO GAÚCHO", "MILHO VERDE",
  // Companies and services
  "BANCO HORIZONTE", "SEGUROS ESCUDO", "LOGÍSTICA RUMO", "TRANSPORTES VIA", "ENERGIA VERDE", "TELECOM ONDA",
  "CONSTRUTORA PILAR", "IMÓVEIS CHAVE", "ADVOCACIA JUSTO", "CONTÁBIL EXATO", "CLÍNICA SAÚDE+", "ODONTO SORRISO",
  "ACADEMIA FORÇA", "ESCOLA SABER", "IDIOMAS MUNDO", "VIAGENS AZUL", "AÉREA CÉU ABERTO", "HOTEL PORTO",
  "LOCADORA ESTRADA", "POSTO SERRA", "OFICINA MOTOR", "PNEUS ARCO", "LAVA JATO BRILHO", "GRÁFICA CORES",
  // Tech and media
  "TORCIDA TV", "RÁDIO GOL", "APP PLACAR", "NUVEM DADOS", "PIXEL GAMES", "CHIP NOVO", "INTERNET FIBRA",
  "STREAM AO VIVO", "FONE BOM", "TELA GRANDE", "JORNAL DA RODADA", "REVISTA TÁTICA", "PODCAST DO APITO",
  // Football things
  "BOLA CERTA", "PRANCHETA", "APITO", "VESTIÁRIO", "GRAMADO+", "BANDEIRINHA", "PEQUENA ÁREA", "MEIA-LUA",
  "TRAVESSÃO", "CAMAROTE VIP", "ARQUIBANCADA", "PLACAR ELETRÔNICO", "SÚMULA", "IMPEDIMENTO", "PRORROGAÇÃO",
  "BOLA PARADA", "TIRO DE META", "ESQUEMA TÁTICO", "VIRADA DE JOGO", "GOL DE PLACA",
] as const;

/** Panel colour pairs (background, text). */
const PAIRS: readonly [number, number][] = [
  [0x0f172a, 0x4ade80], [0xffffff, 0x111827], [0xf2c230, 0x111827], [0x1d4ed8, 0xffffff], [0xdc2626, 0xffffff],
  [0x111827, 0xf97316], [0x065f46, 0xffffff], [0x7c3aed, 0xffffff], [0x16a34a, 0xffffff], [0xf97316, 0x111827],
  [0x0891b2, 0xffffff], [0xbe185d, 0xffffff], [0x1e293b, 0xfacc15], [0xe5e7eb, 0x1d4ed8], [0x7f1d1d, 0xfde68a],
];

export const LED_ADS: readonly { text: string; bg: number; fg: number }[] = NAMES.map((text, i) => {
  const [bg, fg] = PAIRS[(i * 7) % PAIRS.length]!;
  return { text, bg, fg };
});
