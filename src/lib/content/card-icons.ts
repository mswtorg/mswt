/** Icons a cause can show beside its title on cards (Content → Causes → Icon). */
export const CARD_ICONS = [
  ["education", "Education (graduation cap)"],
  ["health", "Health (heartbeat)"],
  ["food", "Food (plate and fork)"],
  ["water", "Water (drops)"],
  ["relief", "Disaster relief (life buoy)"],
  ["environment", "Environment (leaf)"],
  ["housing", "Housing (house)"],
  ["women", "Women and community (people)"],
  ["children", "Children (baby)"],
  ["elderly", "Elderly (person)"],
  ["ramadan", "Ramadan (crescent and star)"],
  ["charity", "Charity (hand and heart)"],
  ["heart", "General (heart)"],
] as const;
export type CardIconKey = (typeof CARD_ICONS)[number][0];
export const CARD_ICON_KEYS = CARD_ICONS.map(([k]) => k) as readonly CardIconKey[];
