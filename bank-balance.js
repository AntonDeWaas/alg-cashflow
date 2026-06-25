function bankBalanceIsBlank(value) {
  return String(value ?? '').trim() === '';
}

function bankBalanceNumber(value) {
  const text = String(value ?? '').replace(/,/g, '').trim();
  const num = Number(text);
  return isNaN(num) ? 0 : num;
}

function bankBalanceFormat(value) {
  const text = String(value ?? '').trim();
  if (text === '') return '';
  const num = bankBalanceNumber(text);
  if (!isNaN(num) && text.match(/^-?[\d,]+(\.\d+)?$/)) {
    return Math.round(num).toLocaleString();
  }
  return text;
}

function bankBalanceRowClass(label) {
  const text = String(label || '').toLowerCase().trim();

  if (text.includes('total balance')) return 'bank-total-row';
  if (text.includes('net cash balance')) return 'bank-net-row';
  if (text.includes('difference')) return 'bank-difference-row';
  if (text.includes('less:')) return 'bank-deduction-row';

  const bankNames = ['enbd', 'adcb', 'sohar intl', 'snb bank', 'kdb'];
  if (bankNames.includes(text)) return 'bank-section-row';

  return '';
}

function bankBalanceReportDate() {
  const saved = localStorage.getItem('cf_report_date') || '';
  if (!saved) return new Date();

  const parsed = new Date(saved + 'T00:00:00');
  if (!isNaN(parsed)) return parsed;

  return new Date();
}

function bankBalanceCurrentIndexes(months, periods) {
  const indexes = [0];
  const reportDate = bankBalanceReportDate();

  const currentMonth = reportDate.toLocaleString('en-US', { month: 'short' });
  const currentYear = String(reportDate.getFullYear()).slice(-2);
  const currentMonthKey = `${currentMonth}-${currentYear}`;

  let currentWeekIndex = -1;
  let currentTotIndex = -1;

  for (let i = 1; i < months.length; i++) {
    const month = String(months[i] || '').trim();
    const period = String(periods[i] || '').trim().toUpperCase();

    if (!month) continue;

    if (month === currentMonthKey) {
      if (period === 'TOT') {
        currentTotIndex = i;
      } else if (period !== 'FORECAST') {
        currentWeekIndex = i;
      }
    }
  }

  for (let i = 1; i < months.length; i++) {
    const month = String(months[i] || '').trim();
    const period = String(periods[i] || '').trim().toUpperCase();

    if (!month) continue;

    if (month === currentMonthKey) {
      if (i === currentWeekIndex) indexes.push(i);
    } else {
      if (period === 'TOT') indexes.push(i);
    }
  }

  if (currentWeekIndex === -1 && currentTotIndex !== -1) {
    indexes.push(currentTotIndex);
  }

  return indexes;
}

function bankBalanceBuildSummary(bodyRows, selectedIndexes) {
  const banks = ['ENBD', 'ADCB', 'SOHAR INTL', 'SNB BANK', 'KDB'];
  const stopLabels = [
    'TOTAL BALANCE',
    'GROUP CASH FLOW BALANCE',
    'DIFFERENCE',
    'NET CASH BALANCE',
    'UAE',
    'SAUDI',
    'OMAN',
    'UZBEK'
  ];

  const summary = [];

  for (let r = 0; r < bodyRows.length; r++) {
    const label = String(bodyRows[r][0] || '').trim().toUpperCase();
    if (!banks.includes(label)) continue;

    const rows = [];

    for (let x = r + 1; x < bodyRows.length; x++) {
      const nextLabel = String(bodyRows[x][0] || '').trim().toUpperCase();

      if (banks.includes(nextLabel)) break;
      if (stopLabels.includes(nextLabel)) break;
      if (nextLabel.startsWith('LESS:')) break;

      rows.push(bodyRows[x]);
    }

    const totals = selectedIndexes.slice(1).map(i =>
      rows.reduce((sum, row) => sum + bankBalanceNumber(row[i]), 0)
    );

    summary.push({ bank: label, totals });
  }

  return summary;
}

function renderBankBalance() {
  const el = document.getElementById('bankBalanceContent');
  if (!el) return;

  const data = window.BANK_BALANCE_DATA || [];

  if (!data.length) {
    el.innerHTML = '<div class="empty">No Bank Balance data loaded. Click Refresh Google Sheet first.</div>';
    return;
  }

  const cleanRows = data.filter(row => row.some(cell => !bankBalanceIsBlank(cell)));

  const headerMonths = cleanRows[0] || [];
  const headerPeriods = cleanRows[1] || [];
  const bodyRows = cleanRows.slice(2);

  const viewMode = document.getElementById('bankBalanceViewMode')?.value || 'current';

  let selectedIndexes = [0];

  if (viewMode === 'weekly') {
    for (let i = 1; i < headerMonths.length; i++) {
      if (!bankBalanceIsBlank(headerMonths[i]) || !bankBalanceIsBlank(headerPeriods[i])) {
        selectedIndexes.push(i);
      }
    }
  }

  if (viewMode === 'monthly') {
    for (let i = 1; i < headerMonths.length; i++) {
      const period = String(headerPeriods[i] || '').trim().toUpperCase();
      if (period === 'TOT') selectedIndexes.push(i);
    }
  }

  if (viewMode === 'current') {
    selectedIndexes = bankBalanceCurrentIndexes(headerMonths, headerPeriods);
  }

  const summary = bankBalanceBuildSummary(bodyRows, selectedIndexes);

  const summaryRows = summary.map(item => `
    <tr>
      <td class="bank-sticky-col">${item.bank}</td>
      ${item.totals.map(v => `<td class="num">${bankBalanceFormat(v)}</td>`).join('')}
    </tr>
  `).join('');

  const detailRows = bodyRows
    .filter(row => selectedIndexes.some(i => !bankBalanceIsBlank(row[i])))
    .map(row => {
      const label = row[0] || '';
      const rowClass = bankBalanceRowClass(label);

      return `
        <tr class="${rowClass}">
          ${selectedIndexes.map((i, index) => `
            <td class="${index === 0 ? 'bank-sticky-col' : 'num'}">
              ${bankBalanceFormat(row[i])}
            </td>
          `).join('')}
        </tr>
      `;
    }).join('');

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
      Current view uses the reporting date from Settings & Data. Completed months show TOT, the current month shows the current week, and future months show TOT.
    </div>

    <h3>Bank Summary</h3>
    <div class="tablewrap bank-balance-tablewrap">
      <table class="bank-balance-table">
        <thead>
          <tr>
            <th class="bank-sticky-col">Bank</th>
            ${selectedIndexes.slice(1).map(i => `<th>${bankBalanceFormat(headerMonths[i])}<br>${bankBalanceFormat(headerPeriods[i])}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${summaryRows}
        </tbody>
      </table>
    </div>

    <h3>Bank Balance Detail</h3>
    <div class="tablewrap bank-balance-tablewrap">
      <table class="bank-balance-table">
        <thead>
          <tr>
            ${selectedIndexes.map((i, index) => `
              <th class="${index === 0 ? 'bank-sticky-col' : ''}">
                ${bankBalanceFormat(headerMonths[i])}
              </th>
            `).join('')}
          </tr>
          <tr>
            ${selectedIndexes.map((i, index) => `
              <th class="${index === 0 ? 'bank-sticky-col' : ''}">
                ${bankBalanceFormat(headerPeriods[i])}
              </th>
            `).join('')}
          </tr>
        </thead>
        <tbody>
          ${detailRows}
        </tbody>
      </table>
    </div>
  `;
}

window.BANK_BALANCE_MODULE = {
  title: 'Bank Balance',
  status: 'active',
  render: renderBankBalance
};
