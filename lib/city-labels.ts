/**
 * Пользовательские подписи в концепции «город».
 * Внутренние API, таблицы и типы office_* не меняются.
 */

export const CITY = {
  builderTitle: "City Builder",
  defaultName: "AI Council",
  defaultNameFull: "Город AI Council",
  loading: "Загрузка города…",
  panelLabel: "Город",
  rulesPlaceholder: "Правила и законы города…",
  centerSquare: "Площадь AI Council",
  buildPad: "Городская площадка",
  floorCell: "Участок пола",
  wallSegment: "Участок стены",
  roomNamePrefix: "Здание",
  roomNamePlaceholder: "Название здания",
  cableToBuilding: "Кабель к зданию",
  cableCenterToBuilding: "Кабель: центр → здание",
  outsideCity: "За пределами города",
  agentNotInCity: "Агент не в этом городе",
  buildingNotFound: "Здание не найдено в этом городе",
} as const;

export const OBJECT_LABELS_CITY = {
  desk: "Стол",
  wall: "Стена",
  door: "Дверь",
  cabinet: "Комод",
  board: "Указ",
  room: "Здание",
  tree: "Ель",
  bush: "Куст",
  flower: "Цветы",
} as const;

export type CityObjectLabelKey = keyof typeof OBJECT_LABELS_CITY;
