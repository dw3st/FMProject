/**
 * Made-up sponsors of the LED boards (4.38.21; tester report: 100+ of everything, shirts, shops, companies). Invented
 * names only, never a real brand, each in Portuguese and English (the board follows the game language). Each gets one of
 * the panel colour pairs by its index.
 */
const NAMES: readonly (readonly [pt: string, en: string])[] = [
  // Game and site
  ["FMPROJECT", "FMPROJECT"], ["WESTLAB.DEV", "WESTLAB.DEV"],
  // Sportswear and shirts
  ["CAMISA 9", "NUMBER 9 SHIRTS"], ["CHUTEIRA 10", "BOOTS 10"], ["TRAVA FINA", "FINE STUDS"], ["MEIÃO", "LONG SOCKS"],
  ["GOLA V", "V-NECK"], ["UNIFORME+", "KIT+"], ["MANTO SAGRADO", "SACRED SHIRT"], ["FIO DE OURO", "GOLDEN THREAD"],
  ["LINHA DE FUNDO WEAR", "BYLINE WEAR"], ["CANELEIRA PRO", "SHIN GUARD PRO"], ["SHORT BRANCO", "WHITE SHORTS"],
  ["ESCANTEIO SPORTS", "CORNER KICK SPORTS"], ["MALHA FORTE", "STRONG KNIT"], ["AGASALHO ZERO", "ZERO TRACKSUITS"],
  // Shops and stores
  ["LOJA DO TORCEDOR", "FAN STORE"], ["MEGA BAZAR", "MEGA BAZAAR"], ["CASA DAS BOLAS", "HOUSE OF BALLS"],
  ["MERCADO CENTRAL", "CENTRAL MARKET"], ["ARMAZÉM DO ZÉ", "JOE'S GROCERY"], ["PADARIA ESTRELA", "STAR BAKERY"],
  ["FARMÁCIA VIDA", "LIFE PHARMACY"], ["ÓTICA VISTA", "VISTA OPTICIANS"], ["SAPATARIA PASSO", "STEP SHOES"],
  ["PAPELARIA RISCO", "SCRIBBLE STATIONERY"], ["FERRAGENS BRAVO", "BRAVO HARDWARE"], ["PET AMIGO", "PET PAL"],
  ["FLORICULTURA SOL", "SUN FLORIST"], ["LIVRARIA PÁGINA", "PAGE BOOKSHOP"], ["BRINQUEDOS PIÃO", "SPINNING TOP TOYS"],
  ["ELETRO JÁ", "ELECTRO NOW"], ["MÓVEIS LAR", "HOME FURNITURE"], ["CONSTRUA BEM", "BUILD WELL"],
  // Food and drink
  ["SUCO DO CAMPO", "FARM JUICE"], ["CAFÉ DO TÉCNICO", "THE MANAGER'S COFFEE"], ["PIPOCA DE OURO", "GOLDEN POPCORN"],
  ["REFRI GELO", "ICE SODA"], ["PIZZA DO CENTRO", "DOWNTOWN PIZZA"], ["LANCHE RÁPIDO", "QUICK BITE"],
  ["SORVETE POLAR", "POLAR ICE CREAM"], ["BISCOITO CROC", "CRUNCH COOKIES"], ["ÁGUA CRISTAL", "CRYSTAL WATER"],
  ["CHOCOLATE NOBRE", "NOBLE CHOCOLATE"], ["PÃO QUENTE", "HOT BREAD"], ["ISOTÔNICO RAIO", "BOLT SPORTS DRINK"],
  ["MOLHO DA VÓ", "GRANDMA'S SAUCE"], ["ARROZ BOM GRÃO", "GOOD GRAIN RICE"], ["QUEIJO SERRANO", "HIGHLAND CHEESE"],
  ["AÇAÍ DA PRAIA", "BEACH AÇAÍ"], ["CHURRASCO GAÚCHO", "GAUCHO BARBECUE"], ["MILHO VERDE", "SWEET CORN"],
  // Companies and services
  ["BANCO HORIZONTE", "HORIZON BANK"], ["SEGUROS ESCUDO", "SHIELD INSURANCE"], ["LOGÍSTICA RUMO", "HEADING LOGISTICS"],
  ["TRANSPORTES VIA", "VIA TRANSPORT"], ["ENERGIA VERDE", "GREEN ENERGY"], ["TELECOM ONDA", "WAVE TELECOM"],
  ["CONSTRUTORA PILAR", "PILLAR BUILDERS"], ["IMÓVEIS CHAVE", "KEY REAL ESTATE"], ["ADVOCACIA JUSTO", "FAIR LAW FIRM"],
  ["CONTÁBIL EXATO", "EXACT ACCOUNTING"], ["CLÍNICA SAÚDE+", "HEALTH+ CLINIC"], ["ODONTO SORRISO", "SMILE DENTAL"],
  ["ACADEMIA FORÇA", "POWER GYM"], ["ESCOLA SABER", "KNOW SCHOOL"], ["IDIOMAS MUNDO", "WORLD LANGUAGES"],
  ["VIAGENS AZUL", "BLUE TRAVEL"], ["AÉREA CÉU ABERTO", "OPEN SKY AIRWAYS"], ["HOTEL PORTO", "HARBOUR HOTEL"],
  ["LOCADORA ESTRADA", "ROAD CAR RENTAL"], ["POSTO SERRA", "MOUNTAIN FUEL"], ["OFICINA MOTOR", "MOTOR GARAGE"],
  ["PNEUS ARCO", "ARC TYRES"], ["LAVA JATO BRILHO", "SHINE CAR WASH"], ["GRÁFICA CORES", "COLOURS PRINTING"],
  // Tech and media
  ["TORCIDA TV", "FANS TV"], ["RÁDIO GOL", "GOAL RADIO"], ["APP PLACAR", "SCORE APP"], ["NUVEM DADOS", "DATA CLOUD"],
  ["PIXEL GAMES", "PIXEL GAMES"], ["CHIP NOVO", "NEW CHIP"], ["INTERNET FIBRA", "FIBRE INTERNET"],
  ["STREAM AO VIVO", "LIVE STREAM"], ["FONE BOM", "GOOD HEADPHONES"], ["TELA GRANDE", "BIG SCREEN"],
  ["JORNAL DA RODADA", "MATCHDAY NEWS"], ["REVISTA TÁTICA", "TACTICS MAGAZINE"], ["PODCAST DO APITO", "WHISTLE PODCAST"],
  // Football things
  ["BOLA CERTA", "SPOT-ON BALL"], ["PRANCHETA", "CLIPBOARD"], ["APITO", "WHISTLE"], ["VESTIÁRIO", "DRESSING ROOM"],
  ["GRAMADO+", "PITCH+"], ["BANDEIRINHA", "CORNER FLAG"], ["PEQUENA ÁREA", "SIX-YARD BOX"], ["MEIA-LUA", "THE D"],
  ["TRAVESSÃO", "CROSSBAR"], ["CAMAROTE VIP", "VIP BOX"], ["ARQUIBANCADA", "THE TERRACE"],
  ["PLACAR ELETRÔNICO", "SCOREBOARD"], ["SÚMULA", "MATCH SHEET"], ["IMPEDIMENTO", "OFFSIDE"],
  ["PRORROGAÇÃO", "EXTRA TIME"], ["BOLA PARADA", "SET PIECE"], ["TIRO DE META", "GOAL KICK"],
  ["ESQUEMA TÁTICO", "GAME PLAN"], ["VIRADA DE JOGO", "COMEBACK"], ["GOL DE PLACA", "WONDER GOAL"],
];

/** Panel colour pairs (background, text). */
const PAIRS: readonly [number, number][] = [
  [0x0f172a, 0x4ade80], [0xffffff, 0x111827], [0xf2c230, 0x111827], [0x1d4ed8, 0xffffff], [0xdc2626, 0xffffff],
  [0x111827, 0xf97316], [0x065f46, 0xffffff], [0x7c3aed, 0xffffff], [0x16a34a, 0xffffff], [0xf97316, 0x111827],
  [0x0891b2, 0xffffff], [0xbe185d, 0xffffff], [0x1e293b, 0xfacc15], [0xe5e7eb, 0x1d4ed8], [0x7f1d1d, 0xfde68a],
];

/** Board text follows the game language: Portuguese for pt-*, English otherwise. */
export type LedLang = "pt" | "en";
export const ledLang = (language: string | undefined): LedLang => (language?.toLowerCase().startsWith("pt") ? "pt" : "en");

export const LED_ADS: readonly { text: Record<LedLang, string>; bg: number; fg: number }[] = NAMES.map(([pt, en], i) => {
  const [bg, fg] = PAIRS[(i * 7) % PAIRS.length]!;
  return { text: { pt, en }, bg, fg };
});
