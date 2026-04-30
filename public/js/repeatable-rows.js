/**
 * Lets the profile editor add additional rows to the repeating fieldsets
 * (achievements, employment history) without a full server round-trip. The
 * server will accept any row index when posting because controllers iterate
 * over numeric keys regardless of order.
 */
(function () {
  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function cloneAndReindex(list, prefix) {
    const rows = list.querySelectorAll('.row');
    const lastRow = rows[rows.length - 1];
    if (!lastRow) return;
    const newRow = lastRow.cloneNode(true);
    const newIndex = rows.length;
    newRow.querySelectorAll('input, select, textarea').forEach((input) => {
      const oldName = input.getAttribute('name') || '';
      const newName = oldName.replace(/\[\d+\]/, `[${newIndex}]`);
      input.setAttribute('name', newName);
      if (input.type !== 'date') {
        input.value = '';
      } else {
        input.value = '';
      }
    });
    list.appendChild(newRow);
  }

  ready(() => {
    document.querySelectorAll('[data-add-row]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const prefix = btn.dataset.addRow;
        const list = document.querySelector(`[data-row-list][data-prefix="${prefix}"]`);
        if (list) cloneAndReindex(list, prefix);
      });
    });
  });
}());
