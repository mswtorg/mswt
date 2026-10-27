const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A posted photo list (comma-separated ids): valid uuids only, no repeats, at most `max`. */
export function parsePhotoIds(value: string | undefined, max = 20): string[] {
  return [...new Set((value ?? "").split(",").map((x) => x.trim().toLowerCase()))]
    .filter((x) => UUID.test(x))
    .slice(0, max);
}
