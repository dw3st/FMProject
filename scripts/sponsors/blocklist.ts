/**
 * Famous real brands. No sponsor name may contain one of them as a whole word (or whole phrase),
 * compared without case or accents. The build fails when one is found.
 */
export const BRAND_BLOCKLIST: readonly string[] = [
  // sportswear
  "nike", "adidas", "puma", "umbro", "reebok", "kappa", "lotto", "joma", "macron", "hummel", "mizuno", "asics",
  "under armour", "new balance", "diadora", "errea", "castore", "topper", "olympikus", "fila",
  // cars and tyres
  "toyota", "honda", "nissan", "ford", "fiat", "volkswagen", "audi", "bmw", "mercedes", "renault", "peugeot",
  "citroen", "hyundai", "kia", "chevrolet", "jeep", "volvo", "skoda", "ferrari", "porsche", "suzuki", "mazda",
  "tesla", "opel", "lamborghini", "pirelli", "michelin", "goodyear", "bridgestone", "continental", "dunlop",
  // banks, payments, insurance
  "barclays", "hsbc", "lloyds", "natwest", "santander", "bbva", "caixabank", "commerzbank", "unicredit", "intesa",
  "paribas", "citibank", "chase", "goldman", "itau", "bradesco", "nubank", "visa", "mastercard", "paypal",
  "allianz", "axa", "generali", "mapfre", "standard chartered", "ing",
  // airlines
  "emirates", "etihad", "lufthansa", "ryanair", "easyjet", "iberia", "klm", "latam", "delta", "qatar airways",
  "air france", "british airways", "turkish airlines", "aeromexico", "qantas",
  // drinks and food
  "coca", "pepsi", "fanta", "sprite", "heineken", "budweiser", "guinness", "carlsberg", "corona", "brahma",
  "skol", "antarctica", "ambev", "quilmes", "peroni", "amstel", "estrella", "mahou", "red bull", "monster",
  "gatorade", "nestle", "danone", "unilever", "heinz", "kellogg", "nutella", "ferrero", "mcdonalds", "mcdonald",
  "burger king", "kfc", "subway", "starbucks", "dominos", "pizza hut",
  // tech, media, telecom
  "google", "microsoft", "apple", "samsung", "sony", "huawei", "xiaomi", "intel", "nvidia", "facebook",
  "instagram", "netflix", "spotify", "amazon", "uber", "airbnb", "oracle", "ibm", "tiktok", "youtube", "espn",
  "sky", "globo", "televisa", "mediaset", "vodafone", "telefonica", "movistar", "orange", "verizon", "claro",
  "vivo", "tim", "turkcell", "telcel", "rakuten",
  // betting and crypto
  "bet365", "betfair", "betway", "bwin", "betano", "sportingbet", "unibet", "paddy power", "ladbrokes",
  "william hill", "pokerstars", "stake", "pixbet", "betsson", "binance", "coinbase",
  // supermarkets, retail, fashion
  "tesco", "sainsbury", "sainsburys", "asda", "aldi", "lidl", "carrefour", "walmart", "costco", "mercadona",
  "rewe", "edeka", "auchan", "leclerc", "kroger", "target", "ikea", "zara", "gucci", "prada", "armani",
  "chanel", "dior", "rolex", "boss",
  // energy, logistics, appliances
  "shell", "exxon", "chevron", "repsol", "gazprom", "lukoil", "aramco", "petronas", "petrobras", "eni",
  "dhl", "fedex", "ups", "maersk", "philips", "bosch", "siemens", "whirlpool", "electrolux", "lg", "panasonic",
];
