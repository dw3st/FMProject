/** Small name pools per nationality, used to generate staff deterministically. */
export const STAFF_NAME_POOLS: Record<string, { first: string[]; last: string[] }> = {
  England: {
    first: ["Graham", "Neil", "Stuart", "Gary", "Martin", "Colin", "Dean", "Alan", "Trevor", "Roy"],
    last: ["Hughes", "Palmer", "Wilkinson", "Bradley", "Fletcher", "Harper", "Dawson", "Holt", "Sinclair", "Marsh"],
  },
  Spain: {
    first: ["Javier", "Alberto", "Rafael", "Ignacio", "Sergio", "Fernando", "Raúl", "Andrés", "Emilio", "Pablo"],
    last: ["Ortega", "Navarro", "Castillo", "Romero", "Vidal", "Herrera", "Molina", "Cabrera", "Ibáñez", "Serrano"],
  },
  Brazil: {
    first: ["Marcelo", "Rogério", "Fábio", "Edson", "Leandro", "Cláudio", "Anderson", "Mauro", "Renato", "Vagner"],
    last: ["Teixeira", "Barbosa", "Cardoso", "Nogueira", "Moreira", "Araújo", "Pacheco", "Siqueira", "Borges", "Maia"],
  },
  Germany: {
    first: ["Jürgen", "Matthias", "Stefan", "Holger", "Dieter", "Klaus", "Thomas", "Jörg", "Uwe", "Lars"],
    last: ["Kessler", "Brandt", "Vogel", "Lindner", "Hartmann", "Reuter", "Ziegler", "Keller", "Werner", "Albrecht"],
  },
  Italy: {
    first: ["Marco", "Giorgio", "Stefano", "Luca", "Massimo", "Paolo", "Fabrizio", "Claudio", "Enrico", "Bruno"],
    last: ["Ferrara", "Bellini", "Conti", "Rinaldi", "Moretti", "Gallo", "Fontana", "Greco", "Caruso", "Villa"],
  },
  Portugal: {
    first: ["Nuno", "Rui", "Paulo", "Jorge", "Hélder", "Vítor", "Joaquim", "Tiago", "Miguel", "Fernão"],
    last: ["Magalhães", "Tavares", "Cunha", "Pimentel", "Carvalho", "Rebelo", "Sampaio", "Vasconcelos", "Lopes", "Matos"],
  },
  France: {
    first: ["Thierry", "Laurent", "Didier", "Patrick", "Olivier", "Gérard", "Franck", "Bruno", "Alain", "Hervé"],
    last: ["Dubois", "Lefèvre", "Marchand", "Girard", "Rousseau", "Fournier", "Morel", "Perrin", "Colin", "Garnier"],
  },
  Argentina: {
    first: ["Gustavo", "Diego", "Hernán", "Claudio", "Ariel", "Matías", "Walter", "Néstor", "Osvaldo", "Ramiro"],
    last: ["Acosta", "Benítez", "Giménez", "Ledesma", "Paredes", "Quiroga", "Sosa", "Villalba", "Ferreyra", "Luna"],
  },
};

export const STAFF_NATIONALITIES = Object.keys(STAFF_NAME_POOLS);
