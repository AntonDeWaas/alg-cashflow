/* bank-balance.js - Clean Bank Balance Module V4 */

(function () {
  const BANK_NAMES = ['ENBD', 'ADCB', 'SOHAR INTL', 'SNB BANK', 'KDB'];
  const STOP_LABELS = ['TOTAL BALANCE', 'GROUP CASH FLOW BALANCE', 'DIFFERENCE', 'NET CASH BALANCE', 'UAE', 'SAUDI', 'OMAN', 'UZBEK'];

  function isBlank(v) {
    return String(v ?? '').trim() === '';
  }

  function txt(v) {
    return String(v ?? '').trim();
  }

  function num(v) {
    const n = Number(txt(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  function fmt(v) {
    const s = txt(v);
    if (!s) return '';
    const n = Number(s.replace(/,/g, ''));
    if (Number.isFinite(n) && /^-?[\d,]+(\.\d+)?$/.test(s)) return Math.round(n).toLocaleString();
    return s;
  }

  function parseDate(v) {
    const s = txt(v);
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  }

  function sameDate(a, b) {
    return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function getReportDate() {
    const saved = localStorage.getItem('cf_report_date') || '';
    if (saved) {
      const d = new Date(saved + 'T00:00:00');
      if (!isNaN(d)) return d;
    }
    return new Date();
  }

  function monthKey(d) {
    return `${d.toLocaleString('en-US', { month: 'short' })}-${String(d.getFullYear()).slice(-2)}`;
  }

  function rowClass(label) {
    const t = txt(label).toUpperCase();
    if (BANK_NAMES.includes(t)) return 'bank-section-row';
    if (t.includes('TOTAL BALANCE')) return 'bank-total-row';
    if (t.includes('GROUP CASH FLOW BALANCE') || t.includes('NET CASH BALANCE')) return 'bank-net-row';
    if (t.includes('DIFFERENCE')) return 'bank-difference-row';
    if (t.startsWith('LESS:')) return 'bank-deduction-row';
    return '';
  }

  function getColumns(months, periods, mode) {
    const indexes = [0];
    const reportDate = getReportDate();
    const reportMonth = monthKey(reportDate);

    if (mode === 'weekly') {
      for (let i = 1; i < months.length; i++) {
        if (!isBlank(months[i]) || !isBlank(periods[i])) indexes.push(i);
      }
      return indexes;
    }

    if (mode === 'monthly') {
  // Monthly Total Only behaves like Current Reporting View,
  // but hides the weekly history and shows only:
  // - Completed months = TOT
  // - Current month = current reporting week
  // - Future months = TOT
  mode = 'current';
}

    let currentWeek = -1;
    let fallback = -1;
    let currentTot = -1;

    for (let i = 1; i < months.length; i++) {
      const m = txt(months[i]);
      const p = txt(periods[i]);
      const pu = p.toUpperCase();

      if (!(m === reportMonth || m.startsWith(reportMonth.slice(0, 3)))) continue;

console.log('BANK BALANCE HEADER CHECK', {
  column: i,
  month: m,
  period: p,
  reportMonth: reportMonth,
  reportDate: reportDate.toLocaleDateString('en-GB')
});

   
      if (pu === 'TOT') currentTot = i;
      else if (pu !== 'FORECAST') {
        fallback = i;
        const d = parseDate(p);
        if (d && sameDate(d, reportDate)) {
          currentWeek = i;
          break;
        }
      }
    }

    if (currentWeek === -1) currentWeek = fallback !== -1 ? fallback : currentTot;

    for (let i = 1; i < months.length; i++) {
      const m = txt(months[i]);
      const p = txt(periods[i]).toUpperCase();

      if (!m) continue;

      if (m === reportMonth || m.startsWith(reportMonth.slice(0, 3))) {
        if (i === currentWeek) indexes.push(i);
      } else if (p === 'TOT') {
        indexes.push(i);
      }
    }

    return indexes;
  }

  function cleanRows(data) {
    return (data || []).filter(r => Array.isArray(r) && r.some(c => !isBlank(c)));
  }

  function buildSummary(bodyRows, cols) {
    const summary = [];

    for (let r = 0; r < bodyRows.length; r++) {
      const label = txt(bodyRows[r][0]).toUpperCase();
      if (!BANK_NAMES.includes(label)) continue;

      const rows = [];

      for (let x = r + 1; x < bodyRows.length; x++) {
        const next = txt(bodyRows[x][0]).toUpperCase();

        if (BANK_NAMES.includes(next)) break;
        if (STOP_LABELS.includes(next)) break;
        if (next.startsWith('LESS:')) break;

        if (!isBlank(next)) rows.push(bodyRows[x]);
      }

      summary.push({
        bank: label,
        totals: cols.slice(1).map(i => rows.reduce((s, row) => s + num(row[i]), 0))
      });
    }

    return summary;
  }

  function renderSummary(summary, months, periods, cols) {
    return `
      <h3>Bank Summary</h3>
      <div class="tablewrap bank-balance-tablewrap bank-summary-wrap">
        <table class="bank-balance-table">
          <thead>
            <tr>
              <th class="bank-sticky-col">Bank</th>
              ${cols.slice(1).map(i => `<th>${fmt(months[i])}<br>${fmt(periods[i])}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${summary.map(r => `
              <tr class="bank-summary-row">
                <td class="bank-sticky-col">${r.bank}</td>
                ${r.totals.map(v => `<td class="num">${fmt(v)}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderDetail(bodyRows, months, periods, cols) {
    return `
      <h3>Bank Balance Detail</h3>
      <div class="tablewrap bank-balance-tablewrap">
        <table class="bank-balance-table">
          <thead>
            <tr>
              ${cols.map((i, idx) => `<th class="${idx === 0 ? 'bank-sticky-col' : ''}">${fmt(months[i])}</th>`).join('')}
            </tr>
            <tr>
              ${cols.map((i, idx) => `<th class="${idx === 0 ? 'bank-sticky-col' : ''}">${fmt(periods[i])}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${bodyRows
              .filter(row => cols.some(i => !isBlank(row[i])))
              .map(row => `
                <tr class="${rowClass(row[0])}">
                  ${cols.map((i, idx) => `<td class="${idx === 0 ? 'bank-sticky-col' : 'num'}">${fmt(row[i])}</td>`).join('')}
                </tr>
              `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderBankBalance() {
    const el = document.getElementById('bankBalanceContent');
    if (!el) return;

    const data = window.BANK_BALANCE_DATA || [];
    if (!data.length) {
      el.innerHTML = '<div class="empty">No Bank Balance data loaded. Click Refresh Google Sheet first.</div>';
      return;
    }

    const rows = cleanRows(data);
    const months = rows[0] || [];
    const periods = rows[1] || [];
    const bodyRows = rows.slice(2);
    const mode = document.getElementById('bankBalanceViewMode')?.value || 'current';
    const cols = getColumns(months, periods, mode);
    const summary = buildSummary(bodyRows, cols);
    const reportDate = getReportDate().toLocaleDateString('en-GB');

    el.innerHTML = `
      <div class="toolbar">
        <label class="fld">View
          <select id="bankBalanceViewMode" onchange="renderBankBalance()">
            <option value="current" ${mode === 'current' ? 'selected' : ''}>Current reporting view</option>
            <option value="weekly" ${mode === 'weekly' ? 'selected' : ''}>Weekly detail</option>
            <option value="monthly" ${mode === 'monthly' ? 'selected' : ''}>Monthly total only</option>
          </select>
        </label>
      </div>

      <div class="note">
        Reporting date: <strong>${reportDate}</strong>. Current view shows completed months as TOT, the reporting month as the current week, and future months as TOT.
      </div>

      ${renderSummary(summary, months, periods, cols)}
      ${renderDetail(bodyRows, months, periods, cols)}
    `;
  }

  window.renderBankBalance = renderBankBalance;

  window.BANK_BALANCE_MODULE = {
    title: 'Bank Balance',
    status: 'active',
    render: renderBankBalance
  };
})();
