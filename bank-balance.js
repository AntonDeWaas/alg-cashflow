function renderBankBalance() {
  const el = document.getElementById('bankBalanceContent');
  if (!el) return;

  const data = window.BANK_BALANCE_DATA || [];

  if (!data.length) {
    el.innerHTML = '<div class="empty">No Bank Balance data loaded. Click Refresh Google Sheet first.</div>';
    return;
  }

  const cleanRows = data.filter(row => row.some(cell => String(cell || '').trim() !== ''));

  const headerMonths = cleanRows[0] || [];
  const headerPeriods = cleanRows[1] || [];
  const bodyRows = cleanRows.slice(2);

  const viewMode = document.getElementById('bankBalanceViewMode')?.value || 'weekly';

  let selectedIndexes = [0];

  for (let i = 1; i < headerMonths.length; i++) {
    const period = String(headerPeriods[i] || '').trim().toUpperCase();

    if (viewMode === 'monthly') {
      if (period === 'TOT' || period === 'FORECAST') selectedIndexes.push(i);
    } else {
      selectedIndexes.push(i);
    }
  }

  const tableRows = bodyRows
    .filter(row => selectedIndexes.some(i => String(row[i] || '').trim() !== ''))
    .map(row => `
      <tr>
        ${selectedIndexes.map(i => `<td>${row[i] ?? ''}</td>`).join('')}
      </tr>
    `).join('');

  el.innerHTML = `
    <div class="toolbar">
      <label class="fld">View
        <select id="bankBalanceViewMode" onchange="renderBankBalance()">
          <option value="weekly" ${viewMode === 'weekly' ? 'selected' : ''}>Weekly detail</option>
          <option value="monthly" ${viewMode === 'monthly' ? 'selected' : ''}>Monthly total only</option>
        </select>
      </label>
    </div>

    <div class="note">Bank Balance data loaded from Google Sheet.</div>

    <div class="tablewrap">
      <table>
        <thead>
          <tr>
            ${selectedIndexes.map(i => `<th>${headerMonths[i] ?? ''}</th>`).join('')}
          </tr>
          <tr>
            ${selectedIndexes.map(i => `<th>${headerPeriods[i] ?? ''}</th>`).join('')}
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
