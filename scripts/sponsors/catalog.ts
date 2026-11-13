/**
 * Hand-written catalog of INVENTED sponsors. One company per line: `<size> <sector> <name>[ !]`
 * (G = global, N = national, L = local; a trailing ` !` marks a funny one).
 * Country keys are the `country` values of `leagueData.json`. Nothing here is a real brand:
 * `buildSponsors.ts` fails on a blocklisted name, a duplicate, a name over 22 characters,
 * an unknown sector or a country below its minimums.
 */
export const GLOBAL_SPONSORS = `
G bank Norvane Bank
G bank Aurelis Capital
G bank Kestrel & Lowe Bank
G insurance Velmont Insurance
G insurance Orbisure
G insurance Halcyon Mutual
G beer Korvan Pils
G beer Brava Nord Lager
G soft_drink Zestio Cola
G soft_drink Limora
G soft_drink Frutaz
G betting BetVanta
G betting Wagerly
G betting OddsHarbor
G airline Zephyra Air
G airline Nordwing Airways
G airline Solanis Airlines
G car_maker Vantor Motors
G car_maker Kaizu Motor
G car_maker Halden Automotive
G car_maker Dynara Auto
G telecom Telvana
G telecom Linqo Mobile
G telecom Voxora
G energy Solmar Energy
G energy Voltaris
G energy Nordgrid Power
G tech Quorix
G tech Lumetric
G tech Zentaq Systems
G tech Brixel
G tech Datavane
G tech Orbyte
G fashion Maison Lirelle
G fashion Corvane
G sportswear Strivo
G sportswear Kontra Sport
G sportswear Tarok
G sportswear Fulgor Sportswear
G sportswear Runaro
G food Granova Foods
G food Belmira
G fast_food Crispy Comet
G fast_food Wrapido
G logistics Translane
G logistics Portavia Logistics
G logistics Hexa Freight
G travel Wandria
G travel Voyanta Travel
G crypto Coinlume
G crypto Blokara
G crypto Zentoken
G home_appliances Domovia
G home_appliances Kelvora
G media Vistacast
G media Kickoff Media Group
G health Vitalune
G health Medivanta
G tyre_shop Rolltrak Tyres
G tyre_shop Duratread
`;

export const COUNTRY_SPONSORS: Record<string, string> = {
  Brazil: `
N bank Banco Jequitibá
N insurance Seguradora Atlântida
N beer Cerveja Serra Dourada
N soft_drink Guaraná Tucumã
N betting Aposta Craque
N telecom TelBrasa
N airline Arara Linhas Aéreas
N supermarket Supermercados Sabiá
N sportswear Drible Esportes
N energy Energia Sol do Cerrado
L tyre_shop Borracharia do Tião !
L bakery Padaria Pão Quentinho !
L food Boi na Brasa Grill !
L fast_food Pastel da Feira !
L education Autoescola Passa Fácil !
L fashion Barbearia do Careca !
L health Dentista Sorriso Largo !
L fast_food Lanchonete X-Tudão !
L food Açougue Boi Feliz !
L beer Boteco Segundo Tempo !
L health Ótica do Bandeirinha !
L supermarket Mercadinho Fiado Não !
L food Sorveteria Gol Gelado !
L pharmacy Farmácia Vila Nova
L construction Construtora Pedra Alta
L real_estate Imobiliária Morada Sul
L education Colégio Novo Saber
L health Clínica Bem Viver
L logistics Transportes Rodamar
L home_appliances Eletro Lar Jacarandá
L car_dealer Veículos Estrada Real
L media Rádio Arquibancada FM
L travel Turismo Rota do Sol
L bakery Confeitaria Dona Nena
L food Pizzaria Forno a Lenha
L tech Infocentro Paraíso
`,
  Portugal: `
N bank Banco Tejo Atlântico
N insurance Seguros Farol do Cabo
N beer Cerveja Pedra Moura
N telecom Rede Lusa Telecom
N supermarket Mercados Cegonha
N energy Energia Vento Norte
N betting Apostas Bola Cheia
N airline Asas do Atlântico
L bakery Pastelaria Doce Nata
L food Talho do Sr. Joaquim
L food Café Golo de Letra !
L food Tasca do Fora de Jogo !
L tyre_shop Oficina do Ti Manel !
L fashion Barbearia Bigode Fino !
L bakery Padaria Pão da Avó
L pharmacy Farmácia da Ribeira
L construction Construções Serra Alta
L real_estate Imobiliária Miradouro
L tyre_shop Pneus Rápidos do Minho
L car_dealer Stand Auto Alfama
L health Clínica Dentária Riso
L education Escola de Línguas Foz
L travel Viagens Rota das Ilhas
L food Peixaria Mar Salgado
L fast_food Rei do Frango Assado !
L home_appliances Eletro Lar Alentejo
L logistics Transportes Douro Sul
L media Rádio Bancada Central
L fashion Sapataria Passo Certo
L supermarket Mercearia da Dona Rosa
L fast_food Bifanas do Penálti !
`,
  Argentina: `
N bank Banco Pampa Sur
N insurance Seguros Cordillera
N beer Cerveza Quebracho
N soft_drink Gaseosas Chispa
N telecom Austral Telecom
N airline Aerolíneas del Plata
N supermarket Supermercados El Ombú
N betting Apuestas La Redonda
N energy Energía Viento Sur
L bakery Panadería La Medialuna
L food Parrilla El Tío Cacho !
L tyre_shop Gomería El Pinchazo !
L food Kiosco El Entretiempo !
L fast_food Pizzería La Pelota
L food Carnicería El Bife
L fast_food Empanadas La Abuela
L food Heladería Dulce Gol !
L fashion Peluquería El Jopo !
L pharmacy Farmacia Plaza Norte
L real_estate Inmobiliaria Los Tilos
L construction Constructora Río Bravo
L car_dealer Automotores Ruta 9
L construction Ferretería El Tornillo
L travel Remises El Rayo
L education Instituto Nuevo Sur
L health Clínica Los Álamos
L media Radio Tribuna Sur
L logistics Fletes Don Pepe
L travel Turismo Lagos del Sur
L food Yerba La Ronda
L home_appliances Electro Hogar Pampa
L health Dentista El Sacamuelas !
`,
  Spain: `
N bank Banco Sierra Blanca
N insurance Seguros La Atalaya
N beer Cerveza Torre Dorada
N telecom Peninsular Telecom
N supermarket Supermercados Olivar
N energy Solvento Energía
N airline Aerolíneas Levante
N betting Apuestas El Golazo
N fashion Moda Alameda
L bakery Churrería La Porra
L food Bar El Fuera de Juego !
L tyre_shop Neumáticos Paco Rueda !
L food Jamones Pata Chula !
L fashion Peluquería Tijeretazo !
L fast_food Bocatería El Mordisco !
L pharmacy Farmacia Plaza Mayor
L education Autoescuela Rotonda
L real_estate Inmuebles Sol y Teja
L construction Construcciones Peñalba
L health Dental La Sonrisa
L food Frutería La Huerta
L food Asador Casa Paquita
L food Tapas La Tía Carmen
L travel Viajes Costa Clara
L education Academia El Aprobado !
L car_dealer Coches Hermanos Luque
L logistics Transportes Guadalmar
L media Radio Grada Sur
L home_appliances Electro Hogar Triana
L beer Sidrería El Culín
L bakery Horno La Espiga
`,
  Mexico: `
N bank Banco Nopal
N insurance Seguros Quetzal
N beer Cerveza Dos Volcanes
N soft_drink Refrescos Chispita
N telecom Telmaya
N airline Aerovías del Golfo
N supermarket Tiendas La Comadre
N betting Apuestas Gol de Oro
N energy Energía Sol de Jade
L fast_food Taquería El Penal !
L fast_food Tacos Don Chuy
L fast_food Tortas La Chilena !
L tyre_shop Vulcanizadora El Clavo !
L bakery Panadería La Concha
L bakery Tortillería Doña Lupe
L food Carnitas El Compadre
L pharmacy Farmacia San Rafael
L car_dealer Refacciones El Pistón
L food Paletas Polo Norte
L fashion Peluquería El Pelón !
L supermarket Abarrotes Doña Chela
L construction Constructora Tepeyac
L real_estate Inmobiliaria Jacaranda
L car_dealer Autos Seminuevos Norte
L health Clínica Santa Cecilia
L education Colegio Nuevo Milenio
L travel Viajes Mar Caribe
L logistics Mudanzas El Burrito !
L media Radio La Porra FM
L food Pollos Asados El Gallo
L food Mariscos El Capitán
L health Dentista Diente Feliz !
`,
  England: `
N bank Wexford & Hale Bank
N insurance Ashdown Mutual
N beer Old Ferret Ale
N betting Top Bins Bet
N telecom Britlink Mobile
N supermarket Harrowby Markets
N airline Albion Airways
N energy Thistle & Rose Energy
N car_maker Kingsley Motors
N media Terrace Talk Radio
L fast_food Dave's Chippy !
L food The Offside Trap Pub !
L bakery Soggy Bottom Bakery !
L tyre_shop Big Kev's Tyres !
L food Pie & Mash Corner
L fashion Baldy's Barbers !
L food Proper Brew Tea Rooms
L food Nan's Sunday Roast !
L logistics Gary's Van Hire
L construction Pennine Plumbing
L bakery Cobble Lane Bakery
L car_dealer Whitby Road Motors
L real_estate Marlow Estate Agents
L health Oakfield Dental
L pharmacy Hadley Pharmacy
L education Thornbury College
L construction Ashby Builders
L travel Sunny Days Travel
L food Burnt Toast Cafe !
L construction Wonky Shelf DIY !
L travel Park the Bus Coaches !
L car_dealer Elbow Grease Car Wash !
L fast_food Stoppage Time Kebabs !
`,
  USA: `
N bank Liberty Ridge Bank
N insurance Homestead Mutual
N beer Buffalo Creek Lager
N soft_drink Fizzwell Soda
N telecom Starlane Wireless
N airline Tallgrass Air
N supermarket Farmhand Markets
N betting Gridline Sportsbook
N car_maker Rushmore Motors
N tech Bytecanyon
L food Big Earl's BBQ !
L tyre_shop Uncle Ray's Tires !
L car_dealer Soccer Mom Minivans !
L bakery Bubba's Bait & Bagels !
L health Lone Pine Dental
L pharmacy Maple Street Pharmacy
L bakery Sunrise Donut Shop
L fast_food Cactus Jack's Tacos
L real_estate Prairie Home Realty
L construction Blue Heron Builders
L car_dealer Lakeshore Auto Mall
L education Ridgeview Academy
L logistics Tri-County Trucking
L food Mama Lou's Diner
L fast_food Crosstown Pizza Co.
L fast_food The Hot Dog Hat Trick !
L food Overtime Sports Bar
L construction Pop's Hardware Store
L travel Golden Valley Travel
L media KGOL Soccer Radio
L home_appliances Yard Sale Appliances !
L food Second Half Coffee !
L fast_food Patty Wagon Burgers !
`,
  Germany: `
N bank Bankhaus Eichenberg
N insurance Schutzwall Assekuranz
N beer Brauerei Hirschgold
N telecom Telenetz Süd
N supermarket Frischemarkt Lindner
N car_maker Weißenfels Motoren
N energy Küstenwind Energie
N airline Fluglinie Alpenblick
N betting Wettbüro Volltreffer
N sportswear Sturmlauf Sport
L bakery Bäckerei Sonnenschein
L food Metzgerei Wurst Case !
L fast_food Dönerbude Abseits !
L fashion Friseur Haarscharf !
L tyre_shop Reifen Müller & Sohn
L beer Kneipe Dritte Halbzeit !
L fast_food Imbiss Zum Elfmeter !
L car_dealer Autohaus Bergmann
L pharmacy Apotheke am Marktplatz
L education Fahrschule Vollgas !
L construction Baufirma Steinbach
L real_estate Immobilien Rosengarten
L health Zahnarztpraxis Beißer !
L soft_drink Getränkemarkt Durst
L education Sprachschule Lindenhof
L logistics Spedition Kranich
L travel Reisebüro Fernweh
L home_appliances Elektrohaus Vogt
L media Radio Fankurve
L bakery Konditorei Zuckerpass !
L fashion Modehaus Elster
`,
  Italy: `
N bank Banca Monteluce
N insurance Assicura Belvedere
N beer Birra Castelrosso
N soft_drink Aranciata Solemio
N telecom Linea Tricolore
N supermarket Supermercati Girasole
N car_maker Automobili Falcone
N energy Energia Ventosole
N betting Scommesse Gol Sicuro
N fashion Moda Vicolo Stretto
N airline Ali del Tirreno
L fast_food Pizzeria Fuorigioco !
L food Bar Sport da Gino
L tyre_shop Gommista Ruota Libera !
L food Trattoria Zia Pina
L bakery Forno Antico Rosetta
L food Gelateria Dolce Rete !
L fashion Barbiere Zero Capelli !
L pharmacy Farmacia San Rocco
L food Macelleria Bue Grasso
L car_dealer Auto Fratelli Marchi
L real_estate Immobiliare Colleverde
L construction Edilizia Pietraforte
L health Dentista Sorriso Bello
L education Scuola Guida Semaforo
L food Salumeria Il Ghiottone
L travel Viaggi Vento d'Estate
L logistics Trasporti Appennino
L media Radio Tribuna Azzurra
L home_appliances Elettrocasa Bianchi
L fast_food Paninoteca Tripletta !
L food Caffè Calcio d'Angolo !
L bakery Pasticceria Il Bignè
`,
  France: `
N bank Banque Val de Lumière
N insurance Assurances Hirondelle
N beer Bière Trois Clochers
N telecom Hexagone Télécom
N supermarket Marchés du Terroir
N car_maker Automobiles Lavigne
N energy Énergie Soleil Levant
N airline Ailes du Midi
N betting Paris Coup Franc
N fashion Atelier Roseline
L bakery Boulangerie Mie Dorée
L food Bistrot du Hors-Jeu !
L fast_food Kebab du Coup Franc !
L tyre_shop Garage Pneu Crevé !
L fashion Salon Mèche Rebelle !
L food Fromages Tonton Marcel !
L pharmacy Pharmacie du Marché
L education Auto-École Créneau
L fast_food Crêperie La Lucarne !
L food Boucherie Chez Dédé
L real_estate Immobilier Belle Rive
L construction Maçonnerie Durand Fils
L health Dentiste Beau Sourire
L travel Voyages Cap Soleil
L logistics Transports Garonne
L education École de Langues Azur
L supermarket Épicerie du Coin
L media Radio Virage Sud
L home_appliances Électro Maison Blanc
L food Café Le Petit Pont !
L bakery Pâtisserie Chou Chou
L car_dealer Garage Occasions Morel
`,
  Netherlands: `
N bank Polderbank
N insurance Dijkzicht Verzekering
N beer Brouwerij De Molenaar
N telecom Tulpnet Telecom
N supermarket Versmarkt Korenbloem
N energy Windmolen Energie
N airline Lage Landen Air
N betting Wedkantoor De Kruising
N logistics Havenlijn Transport
L bakery Bakker Krentenbol
L fast_food Snackbar De Frikandel
L fast_food Snackbar Buitenspel !
L fashion Kapper Kort & Krachtig !
L tyre_shop Bandencentrale Lek !
L food Slagerij Van Dijk
L food Kaasboer Henk
L pharmacy Apotheek De Linde
L car_dealer Autobedrijf Jansen
L real_estate Makelaar Grachtzicht
L construction Bouwbedrijf De Steiger
L health Tandarts Witte Lach !
L education Rijschool Gas Erop !
L travel Reisbureau Zonzijde
L food Café De Derde Helft !
L food Vishandel Zilte Bries
L media Radio Tribune
L home_appliances Witgoedhuis Vermeer
L education Taalschool Praatgraag
L fast_food Patatzaak Panna !
L bakery Banketbakker Tompouce
`,
  Turkey: `
N bank Anadolu Yıldız Bankası
N insurance Güven Çınar Sigorta
N beer Kartal Bira
N telecom Bozkır Telekom
N supermarket Lale Marketleri
N airline Turna Hava Yolları
N energy Güneş Tepe Enerji
N betting Şans Topu Bahis
N home_appliances Evim Beyaz Eşya
L bakery Fırın Sıcak Simit
L food Kebapçı Hasan Usta
L fashion Berber Makas Ali
L tyre_shop Lastikçi Patlak Teker !
L food Çay Ocağı Ofsayt !
L pharmacy Eczane Şifa
L fast_food Dönerci Doksan Dakika !
L car_dealer Oto Galeri Yılmaz
L construction İnşaat Kaya Yapı
L real_estate Emlak Boğaz Manzara
L health Diş Kliniği Gülüş
L education Sürücü Kursu Yeşil
L food Lokanta Anne Eli
L bakery Baklavacı Tatlı Gol !
L logistics Nakliyat Demir
L travel Tur Mavi Yolculuk
L media Radyo Tribün
L education Dershane Başarı Yolu
L fashion Tekstil Pamuk İpek
L food Kuruyemişçi Fıstık
`,
  Albania: `
N bank Banka Shqiponja
N beer Birra Dajti
N telecom AlbaLink Telekom
N insurance Sigurime Adriatiku
L bakery Furra Buka e Ngrohtë
L pharmacy Farmaci Teuta
L fast_food Byrektore Nëna Lule
L tyre_shop Auto Servis Gjergji
L construction Ndërtim Guri i Bardhë
L travel Agjenci Udhëtimi Deti
L health Dentist Buzëqeshja
L supermarket Market Lagjja Jonë
`,
  Armenia: `
N bank Masis Credit Bank
N telecom Narek Telecom
N insurance Garni Insurance
N beer Arpi Brewery
L bakery Tonir Lavash Bakery
L bakery Anush Pastry
L car_dealer Hayk Auto Centre
L pharmacy Zvart Pharmacy
L travel Dilijan Tours
L construction Tufa Stone Builders
L food Khorovats Corner
L health Nor Dental Clinic
`,
  Australia: `
N bank Kookaburra Bank
N insurance Outback Mutual
N beer Wombat Creek Lager
N telecom Dingo Mobile
L tyre_shop Bazza's Tyres !
L fast_food Davo's Meat Pies !
L food Snag & Sizzle BBQ !
L bakery Surfside Bakery
L pharmacy Wattle Pharmacy
L real_estate Harbour View Realty
L car_dealer Red Dirt Utes
L travel Reef Coast Travel
L construction Coolabah Builders
`,
  Austria: `
N bank Bankhaus Edelweiß
N insurance Tauern Versicherung
N beer Brauerei Gamsbock
N telecom Bergfunk Mobil
L bakery Bäckerei Kipferl
L fast_food Würstelstand Eckball !
L food Café Zur Verlängerung !
L tyre_shop Reifen Huber
L pharmacy Apotheke Zum Steinbock
L car_dealer Autohaus Gruber
L real_estate Immobilien Donaublick
L food Fleischerei Pichler
`,
  Belgium: `
N bank Brabo Bank
N beer Brouwerij Drie Torens
N insurance Assurances du Beffroi
N telecom Belfort Mobile
L fast_food Friterie Chez Jef
L fast_food Frituur De Penalty !
L bakery Bakkerij Suikerbrood
L food Chocolatier Manon
L car_dealer Garage Peeters
L pharmacy Apotheek Sint-Anna
L real_estate Immo Scheldezicht
L food Gaufres Mamie Louise
`,
  Belarus: `
N bank Nioman Bank
N beer Brovar Stary Mlyn
N telecom Polesie Telecom
N insurance Busel Insurance
L bakery Pekarnya Karavai
L pharmacy Apteka Zdorovye
L food Draniki u Babuli
L tyre_shop Shiny i Diski Minsk
L car_dealer Avtosalon Minsk Yug
L construction Stroitel Granit
L food Syrnaya Lavka
L travel Turagentstvo Braslav
`,
  Bulgaria: `
N bank Banka Rodopi
N beer Pivovarna Balkan Lev
N telecom Rila Telecom
N insurance Trakia Zastrahovane
L bakery Furna Topla Pitka
L bakery Banichki Baba Penka
L pharmacy Apteka Zdrave
L tyre_shop Gumi Servis Georgiev
L food Kashtata na Kebapcheto
L construction Stroitelstvo Kamak
L real_estate Imoti Cherno More
L travel Rozova Dolina Tours
`,
  Switzerland: `
N bank Alpstein Privatbank
N insurance Gletscher Assurance
N beer Brasserie du Léman
N telecom Bergnetz Schweiz
L bakery Bäckerei Gipfeli
L food Käserei Loch an Loch !
L food Fondue-Stübli Eigentor !
L food Chocolaterie Sennhof
L car_dealer Garage Bürgi
L pharmacy Apotheke Seefeld
L real_estate Immobilien Rigiblick
L travel Reisebüro Alpenpass
`,
  Chile: `
N bank Banco Cordillera Sur
N beer Cerveza Volcán Blanco
N insurance Seguros Araucaria
N telecom Pacífico Móvil
L bakery Panadería Marraqueta
L fast_food Completos El Hincha !
L fast_food Empanadas Tía Rosa
L tyre_shop Vulca El Parche
L pharmacy Farmacia Los Andes
L beer Botillería El Alargue !
L car_dealer Automotora Maipo
L construction Constructora Lican
L travel Viajes Tierra Austral
`,
  Cameroon: `
N bank Banque Mont Fako
N beer Brasserie Sanaga
N telecom Kamer Mobile
N insurance Assurances Baobab
L bakery Boulangerie Soleil
L food Braise Chez Mama Rose
L tyre_shop Garage Tonton Paul
L pharmacy Pharmacie de l'Étoile
L construction Quincaillerie Ndongo
L bakery Beignets de Tantine
L travel Agence Voyages Sawa
L fashion Couture Élégance Wax
`,
  Colombia: `
N bank Banco Cafetal
N beer Cerveza Cóndor Andino
N insurance Seguros La Ceiba
N airline Aerovías del Trópico
L bakery Panadería El Buñuelo
L fast_food Arepas Doña Gloria
L tyre_shop Montallantas El Rin
L fast_food Fritanga Tiro Libre !
L soft_drink Jugos El Cabezazo !
L pharmacy Droguería La Salud
L food Café Loma Verde
L real_estate Inmobiliaria Guadual
L construction Obras Chicamocha
`,
  Croatia: `
N bank Jadranska Štedionica
N beer Pivovara Velebit
N insurance Osiguranje Maslina
N telecom Dalma Telekom
L bakery Pekara Topli Burek
L food Konoba Kod Barba Ive
L tyre_shop Vulkanizer Guma Plus
L pharmacy Ljekarna Lavanda
L car_dealer Autokuća Horvat
L construction Gradnja Kamen
L travel Agencija Plavi Val
L fast_food Ćevapi Zadnja Minuta !
`,
  Cyprus: `
N bank Troodos Bank
N insurance Akamas Insurance
N beer Kourion Brewery
N telecom Nisos Telecom
L food Halloumi House Grill
L bakery Fournos Yiayia Eleni
L tyre_shop Petros Tyres
L travel Ayia Thalassa Travel
L pharmacy Farmakeio Elpida
L fast_food Souvlaki Stin Gonia
L car_dealer Andreou Motors
L construction Stavros Builders
`,
  "Czech Republic": `
N bank Vltavská Banka
N beer Pivovar Zlatý Jelen
N insurance Pojišťovna Lípa
N telecom Bohemia Mobil
L bakery Pekařství U Rohlíku
L beer Hospoda U Ofsajdu !
L food Řeznictví Novák
L tyre_shop Pneuservis Na Kruháči
L pharmacy Lékárna U Anděla
L car_dealer Autobazar Dvořák
L construction Stavebniny Cihla
L bakery Cukrárna Sladký Gól !
`,
  Denmark: `
N bank Sundby Bank
N beer Bryggeriet Havørn
N insurance Nordlys Forsikring
N telecom Bælt Mobil
L bakery Bageriet Kanelsnegl
L fast_food Pølsevognen Offside !
L tyre_shop Dækcenter Jensen
L pharmacy Apotek Lindegården
L food Smørrebrød Hos Mor
L car_dealer Bilhuset Nørregade
L construction Murermester Holm
L travel Rejsebureau Solkysten
`,
  Algeria: `
N bank Banque Tassili
N insurance Assurances Casbah
N soft_drink Jus Djurdjura
N telecom Sahel Mobile
L bakery Boulangerie El Baraka
L bakery Pâtisserie Makrout
L tyre_shop Pneus Frères Benali
L pharmacy Pharmacie des Oliviers
L fast_food Rôtisserie Poulet Doré
L food Café des Supporters
L construction Quincaillerie Zitouni
L travel Voyages Hoggar
`,
  Egypt: `
N bank Bank Wadi El Nil
N insurance Papyrus Nile Insurance
N telecom Nefer Mobile
N fast_food Koshary El Malek
L bakery Makhbaz Aish Baladi
L fast_food Taameya Amm Ali
L tyre_shop Kawetsh El Ostaz
L pharmacy Saydaleyet El Shefa
L soft_drink Asir Asab El Horreya
L real_estate Maktab Aqarat El Nil
L travel Felucca Nile Tours
L bakery Halawani El Sokar
`,
  Finland: `
N bank Koivula Pankki
N beer Panimo Revontuli
N insurance Vakuutus Kuusikko
N telecom Järvi Mobiili
L bakery Leipomo Korvapuusti
L fast_food Grilli Paitsio !
L tyre_shop Rengasliike Virtanen
L pharmacy Apteekki Mustikka
L car_dealer Autotalo Mäkinen
L construction Rakennus Kallio
L food Sauna & Makkara Baari !
L travel Matkatoimisto Lappi
`,
  Fiji: `
N bank Coral Coast Bank
N insurance Yasawa Insurance
N beer Kava Reef Brewery
N telecom Viti Wave Mobile
L bakery Suva Harbour Bakery
L tyre_shop Nadi Tyre Shop
L fast_food Uncle Jone's Roti
L food Lautoka Sugar Sweets
L travel Reef Runner Tours
L pharmacy Palm Lane Pharmacy
L construction Island Hardware Depot
L car_dealer Taveuni Motors
`,
  Georgia: `
N bank Kartli Bank
N beer Tusheti Brewery
N insurance Kolkheti Insurance
N telecom Iveria Telecom
L fast_food Khachapuri Corner
L bakery Tone Bread Bakery
L travel Batumi Sea Tours
L pharmacy Vardi Pharmacy
L car_dealer Kutaisi Auto House
L construction Svaneti Stone Build
L food Supra Feast House
L tyre_shop Rustavi Tyre Centre
`,
  Ghana: `
N bank Volta Lake Bank
N beer Akwaaba Lager
N telecom Kente Mobile
N insurance Adinkra Assurance
L fast_food Auntie Ama's Waakye
L tyre_shop Kwame's Vulcanizer
L food Chop Bar Golden Goal !
L bakery Fresh Loaf Kumasi
L fashion Makola Fabrics
L travel Accra Coast Travel
L logistics Tema Port Haulage
L pharmacy Ridge Road Pharmacy
`,
  Greece: `
N bank Aigaio Trapeza
N beer Zythopoiia Meltemi
N insurance Asfalistiki Galini
N telecom Kyma Telecom
L bakery Fournos tou Giorgou
L fast_food Souvlaki O Diaititis !
L food Kafeneio To Ofsaint !
L tyre_shop Elastika Papadakis
L pharmacy Farmakeio Ygeia
L food Taverna I Thalassa
L real_estate Mesitiko Nisi
L travel Taxidia Kyklades
`,
  Hungary: `
N bank Duna Menti Bank
N beer Sörfőzde Aranyszarvas
N insurance Biztosító Tölgyfa
N telecom Puszta Mobil
L bakery Pékség Friss Kifli
L fast_food Lángos Büfé Lesállás !
L tyre_shop Gumiszerviz Kovács
L pharmacy Gyógyszertár Kamilla
L car_dealer Autószalon Balaton
L construction Tégla Építőipar
L bakery Cukrászda Dobostorta
L food Csárda a Szögletnél
`,
  Indonesia: `
N bank Bank Rimba Raya
N insurance Asuransi Melati
N soft_drink Teh Kelapa Segar
N telecom Seluler Khatulistiwa
L food Warung Bu Sari
L fast_food Bakso Pak Kumis
L tyre_shop Tambal Ban Pak Budi
L pharmacy Apotek Sehat Selalu
L bakery Toko Roti Manis Legit
L fast_food Nasi Goreng Offside !
L car_dealer Bengkel Motor Jaya
L travel Wisata Pulau Biru
`,
  Israel: `
N bank Galil Bank
N energy Negev Sun Energy
N insurance Carmel Coast Insurance
N telecom Kinneret Mobile
L fast_food Falafel HaPina
L bakery Maafiyat Lechem Cham
L tyre_shop Tzmigei HaDarom
L travel Jaffa Gate Travel
L pharmacy Beit Mirkachat Ora
L supermarket Shuk Fresh Market
L car_dealer Haifa Bay Motors
L tech Tel Aviv Code Garage
`,
  Iran: `
N bank Damavand Peak Bank
N insurance Zagros Insurance
N soft_drink Shiraz Rose Drinks
N telecom Caspian Mobile
L bakery Noon Sangak Bakery
L food Kabab Khaneh Darband
L fashion Tabriz Carpet House
L food Saffron Gate Foods
L construction Isfahan Tile Works
L tyre_shop Alvand Tyre Service
L pharmacy Laleh Pharmacy
L travel Kish Island Tours
`,
  Iceland: `
N bank Jökull Banki
N beer Brugghús Norðurljós
N insurance Fjörður Tryggingar
N telecom Geysir Net
L bakery Bakarí Snúður
L fast_food Pylsuvagninn Hornið
L tyre_shop Dekkjaverkstæði Jóns
L pharmacy Apótek Hafnar
L car_dealer Bílasala Norðurlands
L food Fiskbúðin Þorskur
L travel Ferðir Miðnætursól
L construction Byggingar Hraun
`,
  Japan: `
N bank Hinode Ginko
N beer Kitakaze Biru
N insurance Fujimi Hoken
N telecom Tsubame Mobile
N car_maker Kazan Motors
L bakery Panya Mofu Mofu
L tyre_shop Taiya Senta Yamada
L food Yakitori Tanaka-ya
L food Izakaya Enchosen !
L pharmacy Kusuriya Midori
L food Sushi Dokoro Umi
L education Juku Mirai Gakuin
L real_estate Fudosan Aoba
`,
  Kenya: `
N bank Savanna Trust Bank
N beer Kifaru Lager
N telecom Twiga Mobile
N insurance Mlima Insurance
L bakery Mama Njeri's Chapati
L food Nyama Choma Extra Time !
L tyre_shop Kamau Tyre Centre
L pharmacy Duka la Dawa Afya
L travel Mombasa Dhow Safaris
L construction Rift Valley Builders
L car_dealer Matatu Spares Hub
L bakery Mandazi Morning Bakery
`,
  Kazakhstan: `
N bank Altyn Dala Bank
N insurance Alatau Insurance
N telecom Zhuldyz Telecom
N beer Saryarka Pivo
L bakery Nan Tandyr Bakery
L food Beshbarmak Uyi
L tyre_shop Almaty Shina Service
L pharmacy Darikhana Shipa
L car_dealer Astana Auto Ortalygy
L construction Kurylys Tas
L food Kymyz Dala Farm
L travel Sayakhat Tours
`,
  Malta: `
N bank Gozo Channel Bank
N insurance Bastion Insurance
N beer Birra Luzzu
N telecom Dwejra Mobile
L fast_food Pastizzi Tar-Rokna
L bakery Forn Tal-Ħobż Sħun
L travel Sliema Seafront Travel
L tyre_shop Valletta Tyre House
L pharmacy Spiżerija San Pawl
L food Marsaxlokk Fish Shop
L construction Gozo Stone Works
L car_dealer Zejtun Motors
`,
  Nigeria: `
N bank Zuma Rock Bank
N beer Harmattan Lager
N telecom Naija Connect Mobile
N insurance Iroko Insurance
L fast_food Mama Put Jollof Spot
L fast_food Suya Spot Hat-Trick !
L tyre_shop Oga Tunde Vulcanizer
L real_estate Lekki Bridge Realty
L bakery Agege Fresh Bread
L fashion Kano Fabric House
L pharmacy Wellspring Pharmacy
L logistics Danfo Express Haulage
`,
  Norway: `
N bank Tinden Sparebank
N beer Bryggeri Trollstigen
N insurance Elgheim Forsikring
N telecom Fjelltopp Mobil
L bakery Bakeriet Skolebolle
L fast_food Pølsebua Corner
L tyre_shop Dekk & Felg Hansen
L pharmacy Apotek Måken
L car_dealer Bilforretning Berg
L construction Snekker Furu & Sønn
L food Fiskebutikken Torsk
L bakery Vaffelbua Selvmål !
`,
  Peru: `
N bank Banco Valle Sagrado
N beer Cerveza Apu Dorado
N insurance Seguros Vicuña
N telecom Qori Móvil
L food Cevichería La Volea !
L fast_food Pollería Doña Juana
L bakery Panadería Pan Francés
L tyre_shop Llantería El Chasqui
L pharmacy Botica Santa Ana
L fast_food Chifa Tiro de Esquina !
L travel Turismo Camino Inca
L construction Ferretería El Cóndor
`,
  Poland: `
N bank Bank Bursztynowy
N beer Browar Złoty Kłos
N insurance Ubezpieczenia Bocian
N telecom Telefonia Mazury
L bakery Piekarnia Ciepła Bułka
L food Pierogarnia U Babci
L tyre_shop Wulkanizacja Kowalski
L pharmacy Apteka Pod Lipą
L fast_food Kebab Na Spalonym !
L car_dealer Auto Komis Nowak
L construction Firma Budowlana Dąb
L bakery Cukiernia Pączek
`,
  Paraguay: `
N bank Banco Lapacho
N beer Cerveza Río Paraná
N insurance Seguros Ñandutí
N food Yerba Monte Verde
L bakery Chipería Ña Eustaquia
L tyre_shop Gomería Ruta Uno
L fast_food Asadito del Barrio
L supermarket Despensa La Albirroja
L pharmacy Farmacia Santa Librada
L food Comedor El Travesaño !
L real_estate Inmobiliaria Ypacaraí
L fast_food Lomitería El Penalazo !
`,
  Serbia: `
N bank Morava Banka
N beer Pivara Avala
N insurance Osiguranje Šumadija
N telecom Košava Telekom
L bakery Pekara Vruća Lepinja
L food Roštilj Kod Mileta
L tyre_shop Vulkanizer Točak
L pharmacy Apoteka Kamilica
L beer Kafana Treće Poluvreme !
L car_dealer Auto Plac Jovanović
L construction Gradnja Opeka
L fast_food Burek Kod Golmana !
`,
  Russia: `
N bank Bank Severnaya Zvezda
N beer Pivo Zolotoy Medved
N insurance Bereza Strakhovanie
N telecom Taiga Telecom
N airline Baikal Avia
N energy Sibirskiy Veter Energo
L bakery Pekarnya Tyoply Khleb
L fast_food Pelmennaya U Vratarya !
L tyre_shop Shiny Dyadi Vani
L pharmacy Apteka Romashka
L food Bliny u Babushki
L car_dealer Avtosalon Neva
L construction Stroyka Kirpich
L food Shashlychnaya Ofsayd !
L travel Tury Zolotoe Koltso
L supermarket Produkty u Doma
`,
  "Saudi Arabia": `
N bank Najd Palm Bank
N insurance Sahra Insurance
N telecom Tuwaiq Telecom
N airline Saqr Airways
N soft_drink Asir Al Rumman
L bakery Makhbaz Al Tamees
L food Mataam Kabsa Al Jadd
L tyre_shop Banshar Abu Fahd
L pharmacy Saydaliyat Al Waha
L food Dates House Buraidah
L car_dealer Maarad Al Sayarat Najm
L real_estate Aqarat Al Wurud
L fast_food Shawarma Al Zawiya
`,
  Sweden: `
N bank Björkdala Bank
N beer Norrskens Bryggeri
N insurance Trygghem Försäkring
N telecom Skärgård Mobil
L bakery Bageriet Kanelbullen
L fast_food Korvkiosk Straffspark !
L tyre_shop Däckverkstad Nilsson
L pharmacy Blåklint Apotek
L car_dealer Bilhandlare Lindqvist
L construction Bygg & Snickeri Tall
L food Fiskhandel Västkust
L fast_food Pizzeria Hörnan
L food Fika Hos Farmor
`,
  Slovenia: `
N bank Banka Soča
N beer Pivovarna Kozorog
N insurance Zavarovalnica Lipa
N telecom Kras Telekom
L bakery Pekarna Topla Štruca
L food Gostilna Pri Sodniku !
L tyre_shop Vulkanizerstvo Kolo
L pharmacy Lekarna Žajbelj
L car_dealer Avtohiša Novak
L construction Gradbeništvo Skala
L bakery Slaščičarna Kremšnita
L travel Izleti Zeleni Raj
`,
  Slovakia: `
N bank Banka Dunajec
N beer Pivovar Čierny Orol
N insurance Poisťovňa Javor
N telecom Hron Telekom
L bakery Pekáreň Teplý Rožok
L beer Krčma U Rozhodcu !
L tyre_shop Pneuservis Koleso
L pharmacy Lekáreň Pri Parku
L car_dealer Autobazár Kováč
L construction Stavebniny Tehla
L food Koliba Halušky
L bakery Cukráreň Sladký Roh
`,
  Ukraine: `
N bank Bank Kalyna
N beer Pyvo Zolota Nyva
N telecom Karpaty Telekom
N insurance Leleka Strakhuvannia
L bakery Pekarnia Palianytsia
L food Varenyky u Babusi
L tyre_shop Shynomontazh Koleso
L pharmacy Apteka Kashtan
L car_dealer Avtosalon Dnipro
L construction Budmaister Kamin
L food Kava Dodatkovyi Chas !
L travel Tury Chorne More
`,
  Uruguay: `
N bank Banco Charrúa
N beer Cerveza Faro del Este
N insurance Seguros Ceibo
N food Yerba El Gaucho Viejo
L food Parrilla Medio Tanque
L fast_food Chivitos El Maracanazo !
L tyre_shop Gomería La Rambla
L bakery Bizcochería Don Tito
L pharmacy Farmacia Pocitos
L supermarket Almacén El Clásico
L real_estate Inmobiliaria Punta Sur
L car_dealer Automotora Cerro Largo
`,
  Uzbekistan: `
N bank Registon Bank
N insurance Chinor Sug'urta
N telecom Oltin Vodiy Telecom
N soft_drink Zarafshon Drinks
L bakery Non Tandir Novvoyxona
L food Osh Markazi Palov
L fast_food Somsa Burchak
L pharmacy Dorixona Shifo
L tyre_shop Shina Servis Toshkent
L car_dealer Avto Salon Buxoro
L construction Qurilish Marmar
L travel Sayohat Xiva Tours
`,
  Venezuela: `
N bank Banco Araguaney
N beer Cerveza Tepuy
N insurance Seguros Turpial
N telecom Guacamaya Móvil
L fast_food Arepera La Vinotinto
L bakery Panadería El Cachito
L tyre_shop Cauchera El Pana
L pharmacy Farmacia La Candelaria
L fast_food Empanadas Doña Carmen
L food Tasca El Autogol !
L real_estate Inmobiliaria Ávila
L travel Viajes Los Roques
`,
  "South Africa": `
N bank Protea Hills Bank
N beer Kudu Ridge Lager
N telecom Indaba Mobile
N insurance Table Bay Insurance
L food Oom Piet's Biltong
L fast_food Boerie Roll Boys
L tyre_shop Jozi Tyre & Exhaust
L food Shisa Nyama Vuvuzela !
L bakery Karoo Farm Bakery
L fast_food Bunny Chow Corner
L travel Cape Winelands Tours
L pharmacy Highveld Pharmacy
L car_dealer Soweto Motor Spares
`,
  "United Arab Emirates": `
N bank Bank Al Marjan
N insurance Falcon Dunes Insurance
N airline Nujoom Airways
N telecom Wahat Telecom
L food Karak Chai Corner
L bakery Makhbaz Al Sabah
L tyre_shop Banshar Al Sareea
L pharmacy Saydaliyat Al Noor
L travel Dhow Creek Tours
L real_estate Aqarat Burj Al Bahr
L car_dealer Maarad Al Khaleej Cars
L food Mataam Al Sayyad
`,
};
