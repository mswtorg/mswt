// Titles skipped when making initials ("Dr. Munira Agbari" → "MA").
const TITLES = new Set(["dr", "mr", "mrs", "ms", "miss", "shri", "smt", "prof", "adv", "late"]);

/** First and last initials of a name, e.g. "Tasneem Kutubuddin" → "TK"; "" for a blank name. */
export function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => w && !TITLES.has(w.replace(/\.$/, "").toLowerCase()));
  const picked = words.length > 1 ? [words[0]!, words.at(-1)!] : words;
  return picked.map((w) => Array.from(w)[0]!.toLocaleUpperCase("en-IN")).join("");
}
