/**
 * One floating tooltip, reused by whatever is hovered.
 *
 * A single node moved around costs nothing per row, which matters when the
 * uniques table can hold three hundred of them.
 */
import { el, clear } from './util.js';

const GAP = 14;

let node = null;
let hideTimer = null;

function ensure() {
  if (!node) {
    node = el('div', { class: 'tip', role: 'tooltip', hidden: true });
    document.body.append(node);
  }
  return node;
}

/** Places the tooltip beside the pointer, flipping when it would leave the viewport. */
function place(x, y) {
  const tip = ensure();
  const { width, height } = tip.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;

  let left = x + GAP;
  if (left + width > vw - 8) left = x - width - GAP;
  if (left < 8) left = 8;

  let top = y + GAP;
  if (top + height > vh - 8) top = y - height - GAP;
  if (top < 8) top = 8;

  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

export function showTip(content, x, y) {
  const tip = ensure();
  clearTimeout(hideTimer);
  clear(tip).append(content);
  tip.hidden = false;
  place(x, y);
}

export function moveTip(x, y) {
  if (node && !node.hidden) place(x, y);
}

export function hideTip() {
  if (node) node.hidden = true;
}
