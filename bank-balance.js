/* bank-balance.js - Clean Bank Balance Module */

(function () {
  const BANK_NAMES = ['ENBD', 'ADCB', 'SOHAR INTL', 'SNB BANK', 'KDB'];

  const STOP_LABELS = [
    'TOTAL BALANCE',
    'GROUP CASH FLOW BALANCE',
    'DIFFERENCE',
    'NET CASH BALANCE',
    'UAE',
    'SAUDI',
    'OMAN',
    'UZBEK'
  ];

  function isBlank(value) {
    return String(value ?? '').trim() === '';
  }

  function cleanText(value) {
    return String(value ?? '').trim();
  }

  function toNumber(value) {
    const text = cleanText(value).replace(/,/g, '');
    if (text === '') return 0;
    const num = Number(text);
    return Number.isFinite(num) ? num : 0;
  }

  function formatValue(value) {
    const text = cleanText(value);
    if (text === '') return '';

    const numericText = text.replace(/,/g, '');
    const num = Number(numericText);

    if (Number.isFinite(num) && /^-?\d+(\.\d+)?$/.test(numericText)) {
      return Math.round(num).toLocaleString();
    }

    return text;
  }
    function parseDateFromText(value) {
    const text = cleanText(value);
    if (!text) return null;

    const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) {
      const d = Number(dmy[1]);
      const m = Number(dmy[2]) - 1;
      const y = Number(dmy[3]);
      const dt = new Date(y, m, d);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }

    return null;
  }

  function sameDate(a, b) {
    return a && b &&
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }

  function reportDate() {
    const saved = localStorage.getItem('cf_report_date') || '';
    if (saved) {
      const parsed = new Date(saved + 'T00:00:00');
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  }

  function reportMonthKey(dt) {
    const month = dt.toLocaleString('en-US', { month: 'short' });
    const year = String(dt.getFullYear()).slice(-2);
    return `${month}-${year}`;
  }

  function rowClass(label) {
    const text = cleanText(label).toUpperCase();

    if (BANK_NAMES.includes(text)) return 'bank-section-row';
    if (text.includes('TOTAL BALANCE')) return 'bank-total-row';
    if (text.includes('GROUP CASH FLOW BALANCE')) return 'bank-net-row';
    if (text.includes('NET CASH BALANCE')) return 'bank-net-row';
    if (text.includes('DIFFERENCE')) return 'bank-difference-row';
    if (text.startsWith('LESS:')) return 'bank-deduction-row';

    return '';
  }
    function currentIndexes(months, periods, viewMode) {

    const indexes = [0];

    if (viewMode === 'weekly') {

      for (let i = 1; i < months.length; i++) {
        if (!isBlank(months[i]) || !isBlank(periods[i])) {
          indexes.push(i);
        }
      }

      return indexes;
    }

    const report = reportDate();
    const currentMonth = reportMonthKey(report);

    for (let i = 1; i < months.length; i++) {

      const month = cleanText(months[i]);
      const period = cleanText(periods[i]).toUpperCase();

      if (!month) continue;

      if (month < currentMonth) {

        if (period === 'TOT')
          indexes.push(i);

      }

      else if (month === currentMonth) {

        if (viewMode === 'monthly') {

          const dt = parseDateFromText(periods[i]);

          if (dt && sameDate(dt, report))
            indexes.push(i);

        }

        else {

          const dt = parseDateFromText(periods[i]);

          if (dt && sameDate(dt, report))
            indexes.push(i);

          else if (period === 'FORECAST')
            indexes.push(i);

          else if (period === 'TOT')
            indexes.push(i);

        }

      }

      else {

        if (period === 'TOT')
          indexes.push(i);

      }

    }

    return indexes;

  }
    function cleanRows(data) {
    return (data || []).filter(row =>
      Array.isArray(row) &&
      row.some(cell => !isBlank(cell))
    );
  }

  function buildBankSummary(bodyRows, selectedIndexes) {
    const summary = [];

    for (let r = 0; r < bodyRows.length; r++) {
      const label = cleanText(bodyRows[r][0]).toUpperCase();

      if (!BANK_NAMES.includes(label)) continue;

      const accountRows = [];

      for (let x = r + 1; x < bodyRows.length; x++) {
        const nextLabel = cleanText(bodyRows[x][0]).toUpperCase();

        if (BANK_NAMES.includes(nextLabel)) break;
        if (STOP_LABELS.includes(nextLabel)) break;
        if (nextLabel.startsWith('LESS:')) break;

        if (!isBlank(nextLabel)) {
          accountRows.push(bodyRows[x]);
        }
      }

      const totals = selectedIndexes.slice(1).map(colIndex =>
        accountRows.reduce((sum, row) => sum + toNumber(row[colIndex]), 0)
      );

      summary.push({
        bank: label,
        totals
      });
    }

    return summary;
  }
    function buildTableHeader(months, periods, selectedIndexes) {
    return `
      <thead>
        <tr>
          ${selectedIndexes.map((i, index) => `
            <th class="${index === 0 ? 'bank-sticky-col' : ''}">
              ${formatValue(months[i])}
            </th>
          `).join('')}
        </tr>
        <tr>
          ${selectedIndexes.map((i, index) => `
            <th class="${index === 0 ? 'bank-sticky-col' : ''}">
              ${formatValue(periods[i])}
            </th>
          `).join('')}
        </tr>
      </thead>
    `;
  }

  function renderSummary(summary, months, periods, selectedIndexes) {
    const rows = summary.map(item => `
      <tr class="bank-summary-row">
        <td class="bank-sticky-col">${item.bank}</td>
        ${item.totals.map(value => `
          <td class="num">${formatValue(value)}</td>
        `).join('')}
      </tr>
    `).join('');

    return `
      <h3>Bank Summary</h3>
      <div class="tablewrap bank-balance-tablewrap bank-summary-wrap">
        <table class="bank-balance-table">
          <thead>
            <tr>
              <th class="bank-sticky-col">Bank</th>
              ${selectedIndexes.slice(1).map(i => `
                <th>${formatValue(months[i])}<br>${formatValue(periods[i])}</th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }
    function renderDetail(bodyRows, months, periods, selectedIndexes) {
    const rows = bodyRows
      .filter(row => selectedIndexes.some(i => !isBlank(row[i])))
      .map(row => {
        const label = cleanText(row[0]);
        const cls = rowClass(label);

        return `
          <tr class="${cls}">
            ${selectedIndexes.map((i, index) => `
              <td class="${index === 0 ? 'bank-sticky-col' : 'num'}">
                ${formatValue(row[i])}
              </td>
            `).join('')}
          </tr>
        `;
      }).join('');

    return `
      <h3>Bank Balance Detail</h3>
      <div class="tablewrap bank-balance-tablewrap">
        <table class="bank-balance-table">
          ${buildTableHeader(months, periods, selectedIndexes)}
          <tbody>
            ${rows}
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

    const viewMode = document.getElementById('bankBalanceViewMode')?.value || 'current';
    const selectedIndexes = currentIndexes(months, periods, viewMode);
    const summary = buildBankSummary(bodyRows, selectedIndexes);
    const report = reportDate().toLocaleDateString('en-GB');

    el.innerHTML = `
      <div class="toolbar">
        <label class="fld">View
          <select id="bankBalanceViewMode" onchange="renderBankBalance()">
            <option value="current" ${viewMode === 'current' ? 'selected' : ''}>Current reporting view</option>
            <option value="weekly" ${viewMode === 'weekly' ? 'selected' : ''}>Weekly detail</option>
            <option value="monthly" ${viewMode === 'monthly' ? 'selected' : ''}>Monthly total only</option>
          </select>
        </label>
      </div>

      <div class="note">
        Reporting date: <strong>${report}</strong>. Current view uses the reporting date from Settings & Data.
      </div>

      ${renderSummary(summary, months, periods, selectedIndexes)}
      ${renderDetail(bodyRows, months, periods, selectedIndexes)}
    `;
  }

  window.renderBankBalance = renderBankBalance;

  window.BANK_BALANCE_MODULE = {
    title: 'Bank Balance',
    status: 'active',
    render: renderBankBalance
  };

})();
