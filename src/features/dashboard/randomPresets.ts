const SETTINGS = [
  "Америка 30-х, Нью-Йорк, Чайна-таун",
  "Марсианская колония XXII века",
  "Средневековое портовое королевство",
  "Космическая станция на границе галактики",
  "Постапокалиптическая Москва",
  "Викторианский Лондон с паровыми технологиями",
];

const ATMOSPHERES = [
  "Мрачноватая безысходность, общий упадок, реализм",
  "Научный оптимизм, сдержанная эйфория",
  "Тревожный мистицизм, туман и шёпоты",
  "Тёплая ламповая ностальгия",
  "Грязный неон, напряжённые улицы",
  "Спокойствие перед бурей, скрытое напряжение",
];

const GENRES = [
  "Нуар",
  "Сайберпанк",
  "Космическая опера",
  "Дарк-фэнтези",
  "Постапокалипсис",
  "Мистический триллер",
];

function randomFrom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export interface WorldPreset {
  setting: string;
  atmosphere: string;
  genre: string;
}

export function generateWorldPreset(): WorldPreset {
  return {
    setting: randomFrom(SETTINGS),
    atmosphere: randomFrom(ATMOSPHERES),
    genre: randomFrom(GENRES),
  };
}

export const presetReference: WorldPreset = {
  setting: "Америка 30-х, Нью-Йорк, Чайна-таун",
  atmosphere: "Мрачноватая безысходность, общий упадок, реализм",
  genre: "Нуар",
};

