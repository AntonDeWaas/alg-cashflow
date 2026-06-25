function renderBankBalance() {
  const el = document.getElementById('bankBalanceContent');
  if (!el) return;

  const data = window.BANK_BALANCE_DATA || [];

  if (!data.length) {
    el.innerHTML = '<div class="empty">No Bank Balance data loaded. Click Refresh Google Sheet first.</div>';
    return;
  }

  el.innerHTML = `
    <div class="note">Bank Balance data loaded from Google Sheet.</div>
    <table>
      <tbody>
        ${data.map(row => `
          <tr>
            ${row.map(cell => `<td>${cell ?? ''}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

window.BANK_BALANCE_MODULE = {
  title: 'Bank Balance',
  status: 'active',
  render: renderBankBalance
};
