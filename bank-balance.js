function bankBalanceIsBlank(value) {
  return String(value ?? '').trim() === '';
}

function bankBalanceFormat(value) {
  const text = String(value ?? '').trim();
  if (text === '') return '';

  const num = Number(text.replace(/,/g, ''));
  if (!isNaN(num) && text.match(/^-?[\d,]+(\.\d+)?$/)) {
    return Math.round(num).toLocaleString();
  }

  return text;
}

function bankBalanceRowClass(label) {
  const text = String(label || '').toLowerCase();

  if (text.includes('total balance')) return 'bank-total-row';
  if (text.includes('net cash balance')) return 'bank-net-row';
  if (text.includes('difference')) return 'bank-difference-row';
  if (text.includes('less:')) return 'bank-deduction-row';

  const bankNames = ['enbd', 'adcb', 'sohar', 'snb', 'kdb'];
  if (bankNames.includes(text.trim())) return 'bank-section-row';

  return '';
}

function bankBalanceCurrentIndexes(months, periods) {
  const indexes = [0];
  const today = new Date();
  const currentMonth = today.toLocaleString('en-US', { month: 'short' });
  const currentYear = String(today.getFullYear()).slice(-2);
  const currentMonthKey = `${currentMonth}-${currentYear}`;

  for (let i = 1; i < months.length; i++) {
    const month = String(months[i] || '').trim();
    const period = String(periods[i] || '').trim().toUpperCase();

    if (!month) continue;

    if (month === currentMonthKey) {
      indexes.push(i);
    } else if (period === 'TOT' || period === 'FORECAST') {
      indexes.push(i);
    }
  }

  return indexes;
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
      if (period === 'TOT' || period === 'FORECAST') selectedIndexes.push(i);
    }
  }

  if (viewMode === 'current') {
    selectedIndexes = bankBalanceCurrentIndexes(headerMonths, headerPeriods);
  }

  const tableRows = bodyRows
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
      Current view shows completed months as total, the current month by week, and future months as total/forecast.
    </div>

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
          ${tableRows}
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
