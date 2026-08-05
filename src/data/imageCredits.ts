// Image credits for the demo photographs.
// All images are freely licensed (Public Domain / CC / CC0) via Wikimedia Commons.
// Keyed by image filename (without extension) as referenced in article frontmatter.

export const imageCredits: Record<
  string,
  { label: string; credit: string; license: string; source: string }
> = {
  "doha-skyline": {
    label: "Doha, West Bay skyline",
    credit: "Wikimedia Commons",
    license: "CC BY 4.0",
    source: "File:Doha - West Bay Skyline 01.jpg",
  },
  "nato-hq": {
    label: "NATO headquarters, Brussels",
    credit: "Romaine",
    license: "CC0",
    source: "File:Brussels-NATO headquarters.jpg",
  },
  "nato-summit": {
    label: "NATO defence ministers meeting, Brussels",
    credit: "Lisa Ferdinando, U.S. Department of Defense",
    license: "Public domain",
    source: "File:NATO Defense Ministers Meet at NATO Headquarters (5537970).jpg",
  },
  "nato-flags": {
    label: "NATO flag-raising ceremony, Brussels",
    credit: "Chuck Kennedy, U.S. Department of State",
    license: "Public domain",
    source: "File:Secretary Blinken Participates in a Flag Raising Ceremony for Finland at NATO Headquarters (52807659247).jpg",
  },
  "nato-flag": {
    label: "NATO flag",
    credit: "Wikimedia Commons",
    license: "CC BY-SA 4.0",
    source: "File:020230728 NATO flag on private property.jpg",
  },
  "container-port": {
    label: "Container terminal, Port of Hamburg",
    credit: "Wikimedia Commons",
    license: "CC BY-SA 4.0",
    source: "File:Am Kamerunkai, Container crane, WPAhoi, Hamburg (P1080281).jpg",
  },
  "container-ship": {
    label: "Container ship entering port",
    credit: "Wikimedia Commons",
    license: "CC BY-SA 4.0",
    source: "File:Container ship Express Black Sea in Fremantle Harbour, April 2026 01.jpg",
  },
  "bosphorus": {
    label: "Ortaköy Mosque on the Bosphorus, Istanbul",
    credit: "Giuseppe Pinto",
    license: "CC BY-SA 3.0",
    source: "File:Ortaköy Mosque (160990449).jpeg",
  },
  "hormuz-strait": {
    label: "The Strait of Hormuz, from orbit",
    credit: "European Space Agency",
    license: "Attribution",
    source: "File:Strait of Hormuz.png",
  },
  "eu-parliament": {
    label: "European Parliament hemicycle, Strasbourg",
    credit: "David Iliff",
    license: "CC BY-SA 3.0",
    source: "File:European Parliament Strasbourg Hemicycle - Diliff.jpg",
  },
  "eu-summit": {
    label: "Asia–Europe summit of leaders",
    credit: "Wikimedia Commons",
    license: "CC BY 4.0",
    source: "File:1st Asia Europe Summit (ASEM), Bangkok - Group photo 1.jpg",
  },
  "gov-summit": {
    label: "G7 summit working session",
    credit: "Wikimedia Commons",
    license: "Public domain",
    source: "File:2016 G7 Summit Working Lunch.jpg",
  },
  "cargo-crane": {
    label: "Container crane, Lyttelton",
    credit: "Wikimedia Commons",
    license: "CC0",
    source: "File:Container Crane Lyttelton. (12807777564).jpg",
  },
  "manila": {
    label: "Skyline of Manila",
    credit: "Wikimedia Commons",
    license: "CC BY-SA 4.0",
    source: "File:Skyline in Manila 16.jpg",
  },
  "un-hall": {
    label: "United Nations Headquarters, New York",
    credit: "Wikimedia Commons",
    license: "CC BY 4.0",
    source: "File:Headquarters of the United Nations, New York City, 20231001 1103 1006.jpg",
  },
  "kremlin": {
    label: "The Kremlin, Moscow",
    credit: "Diego Delso",
    license: "CC BY-SA 4.0",
    source: "File:Gran Palacio del Kremlin, Moscú, Rusia, 2016-10-03, DD 28-29 HDR.jpg",
  },
  "palais-nations": {
    label: "Assembly Hall, Palais des Nations, Geneva",
    credit: "Mourad Ben Abdallah",
    license: "CC BY-SA 4.0",
    source: "File:2017 UN Geneva Open Day Assembly Hall.jpg",
  },
  "us-capitol": {
    label: "The United States Capitol, west front",
    credit: "Library of Congress",
    license: "Public domain",
    source: "File:Capitol exterior, west front from terrace LCCN2009631163.jpg",
  },
  "berlaymont": {
    label: "Berlaymont building, Brussels",
    credit: "Wikimedia Commons",
    license: "CC BY 4.0",
    source: "File:Berlaymont EU Building-Brussels.jpg",
  },
  "leopard-tank": {
    label: "Leopard 2 main battle tank",
    credit: "Wikimedia Commons",
    license: "CC BY 4.0",
    source: "File:81032MID Singapore Armed Forces Leopard 2SG Tank.jpg",
  },
  "oil-tanker": {
    label: "Oil tanker at sea",
    credit: "Wikimedia Commons",
    license: "CC BY-SA 4.0",
    source: "File:2022-09-04 01 ACADIAN - IMO 9298715 tanker - St. John's NL Canada.jpg",
  },
  "pipeline": {
    label: "Altona oil refinery",
    credit: "Sgroey",
    license: "CC BY-SA 4.0",
    source: "File:Altona Oil Refinery Victoria.jpg",
  },
  "beijing": {
    label: "Beijing central business district",
    credit: "Wikimedia Commons",
    license: "CC BY-SA 4.0",
    source: "File:Beijing CBD Skyline (20190104160952).jpg",
  },
  "world-map": {
    label: "World map",
    credit: "FelixCountryBalls163",
    license: "CC BY-SA 4.0",
    source: "File:Blank Map of The World (+antartica).png",
  },
};

export const creditFor = (image: string) => {
  const key = image
    .replace(/^\//, "")
    .replace(/\.(jpg|jpeg|png|webp)$/i, "")
    .split("/")
    .pop();
  return imageCredits[key ?? ""];
};
