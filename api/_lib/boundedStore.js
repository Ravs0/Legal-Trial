// Small bounded-collection helpers for the in-memory API stores.
//
// These routes are still backed by process-global arrays/maps (a DB is a TODO),
// so an unauthenticated caller could previously grow them without limit on a
// warm serverless instance. Every store now applies a hard cap and evicts the
// oldest entries first.

/** Append while keeping the array at or below `max` entries (oldest evicted). */
export function pushBounded(list, item, max) {
  const cap = Math.max(1, Math.floor(Number(max) || 1));
  list.push(item);
  if (list.length > cap) list.splice(0, list.length - cap);
  return item;
}

/** Drop all but the newest `max` rows belonging to `owner`. */
export function trimOwner(list, owner, max) {
  const cap = Math.max(1, Math.floor(Number(max) || 1));
  let count = 0;
  for (const row of list) if (row && row.owner === owner) count += 1;
  let excess = count - cap;
  for (let i = 0; excess > 0 && i < list.length;) {
    if (list[i] && list[i].owner === owner) {
      list.splice(i, 1);
      excess -= 1;
    } else {
      i += 1;
    }
  }
  return list;
}

/** Cap a Map, evicting the oldest inserted key (Map preserves insertion order). */
export function capMap(map, max) {
  const cap = Math.max(1, Math.floor(Number(max) || 1));
  while (map.size > cap) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
  return map;
}

/** Trim a short, client-supplied id/label; returns null when unusable. */
export function cleanId(value, maxLength = 128) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}
