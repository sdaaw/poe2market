import { el, clear } from './util.js';

/**
 * A sortable table that keeps its own sort state and re-renders in place.
 *
 * columns: { key, label, align, sortable, value(row), render(row, index), hide }
 */
export function createTable({ columns, rows, sortKey, dir = 'desc', onRow, limit = 250 }) {
  const wrap = el('div', { class: 'card card--pad0 scroll-x' });
  const table = el('table', { class: 'table' });
  const thead = el('thead');
  const tbody = el('tbody');
  table.append(thead, tbody);
  wrap.append(table);

  let sort = { key: sortKey, dir };
  let data = rows;

  function headerCell(col) {
    const active = sort.key === col.key;
    const th = el('th', {
      class: [
        col.sortable === false ? '' : 'sortable',
        col.align === 'right' ? 'right' : '',
        active ? 'is-sorted' : '',
        col.hide ? 'hide-sm' : ''
      ]
        .filter(Boolean)
        .join(' ')
    }, [
      col.label,
      col.sortable !== false && el('span', { class: 'arrow', text: active && sort.dir === 'asc' ? '↑' : '↓' })
    ]);

    if (col.sortable !== false) {
      th.addEventListener('click', () => {
        if (sort.key === col.key) sort.dir = sort.dir === 'desc' ? 'asc' : 'desc';
        else sort = { key: col.key, dir: 'desc' };
        render();
      });
    }
    return th;
  }

  function render() {
    clear(thead).append(el('tr', {}, columns.map(headerCell)));
    clear(tbody);

    const col = columns.find((c) => c.key === sort.key);
    const read = col?.value ?? ((r) => r[sort.key]);
    const sorted = [...data].sort((a, b) => {
      const x = read(a);
      const y = read(b);
      const cmp = typeof x === 'string' ? x.localeCompare(y) : (y ?? 0) - (x ?? 0);
      return sort.dir === 'desc' ? cmp : -cmp;
    });

    if (!sorted.length) {
      tbody.append(el('tr', {}, [
        el('td', { colspan: columns.length }, [el('div', { class: 'empty', text: 'Nothing matches those filters.' })])
      ]));
      return;
    }

    sorted.slice(0, limit).forEach((row, i) => {
      const tr = el('tr', { class: onRow ? 'clickable' : '' },
        columns.map((c) =>
          el('td', {
            class: [c.align === 'right' ? 'right' : '', c.hide ? 'hide-sm' : ''].filter(Boolean).join(' ')
          }, [c.render(row, i)])
        )
      );
      if (onRow) tr.addEventListener('click', () => onRow(row));
      tbody.append(tr);
    });

    if (sorted.length > limit) {
      tbody.append(el('tr', {}, [
        el('td', { colspan: columns.length }, [
          el('div', { class: 'empty', text: `Showing the top ${limit} of ${sorted.length} results — narrow the filters to see more.` })
        ])
      ]));
    }
  }

  render();
  wrap.update = (nextRows) => {
    data = nextRows;
    render();
  };
  return wrap;
}
