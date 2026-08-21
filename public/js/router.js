/**
 * Hash routing.
 *
 * An open item is a parameter on the current view (`#/uniques?item=...`) rather
 * than a route of its own, so a shared link lands the reader on the list they
 * would have been looking at, and closing the panel keeps them there.
 */

export function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [view, query] = raw.split('?');
  return {
    view: view || 'overview',
    item: new URLSearchParams(query || '').get('item')
  };
}

export const viewHash = (view) => `#/${view}`;
export const itemHash = (slug, view = parseHash().view) =>
  `#/${view}?item=${encodeURIComponent(slug)}`;

// Whether the currently open item was pushed by a click here, as opposed to the
// reader arriving on a link. It decides if closing can safely step back.
let pushedByUs = false;

/** Returns false when the URL already points at this item and nothing will change. */
export function goToItem(slug) {
  const target = itemHash(slug);
  if (location.hash === target) return false;
  pushedByUs = true;
  location.hash = target;
  return true;
}

/** Steps back when we can, so closing returns to the exact list position. */
export function leaveItem() {
  if (pushedByUs) {
    pushedByUs = false;
    history.back();
    return;
  }
  location.hash = viewHash(parseHash().view);
}

/** Called by the router whenever the URL carries no item. */
export function forgetPushedItem() {
  pushedByUs = false;
}
