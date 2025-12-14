// ============================================
// BOARD ID SERVICE
// ============================================
// Provides stable, URL-safe board IDs (used for Board.id and NIP-33 "d")

/**
 * Create a stable board ID from a validated board name.
 *
 * Expected input is typically already validated/uppercased (CreateBoard),
 * but this function is defensive.
 */
export function makeBoardId(name: string): string {
  const base = (name || '').trim().toLowerCase();

  // Allow a-z, 0-9, underscore; convert everything else to '-'
  const slug = base
    .replace(/[^a-z0-9_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `b-${slug || 'board'}`;
}

/**
 * Make a unique board ID within a known set of existing ids.
 *
 * If `b-<slug>` exists, returns `b-<slug>-2`, `b-<slug>-3`, ...
 */
export function makeUniqueBoardId(name: string, existingIds: Set<string>): string {
  const base = makeBoardId(name);
  if (!existingIds.has(base)) return base;

  let i = 2;
  while (existingIds.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
