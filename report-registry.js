// Central report registry for Al Laith Group Finance MIS.
// Add new modules here when their Google Sheet tabs and render functions are ready.
window.ALG_REPORT_REGISTRY = [
  { group: 'Treasury', key: 'cashflow', title: 'Cash Flow' },
  { group: 'Treasury', key: 'liquidity', title: 'Liquidity Excl. Qiddiya' },
  { group: 'Treasury', key: 'bankBalance', title: 'Bank Balance' },
  { group: 'Treasury', key: 'pdcIssued', title: 'PDC Issued' },
  { group: 'Treasury', key: 'bankLoan', title: 'Bank Loan' },
  { group: 'Treasury', key: 'intercompany', title: 'Intercompany' },
  { group: 'Receivables', key: 'receivables', title: 'Receivable Aging' },
  { group: 'Receivables', key: 'collectionTarget', title: 'Collection vs Target' },
  { group: 'Receivables', key: 'qiddiyaReceivable', title: 'Qiddiya Project Receivable' },
  { group: 'Payables / Commitments', key: 'supplierAging', title: 'Supplier Aging' },
  { group: 'Payables / Commitments', key: 'rent', title: 'Rent' },
  { group: 'Payables / Commitments', key: 'insurance', title: 'Insurance' },
  { group: 'Payables / Commitments', key: 'taxes', title: 'Taxes' },
  { group: 'Payables / Commitments', key: 'payroll', title: 'Salaries & Wages' },
  { group: 'Forecasting', key: 'revenueForecastSummary', title: 'Revenue Forecast Summary' },
  { group: 'Forecasting', key: 'revenueForecastDetail', title: 'Revenue Forecast Detail' },
  { group: 'Forecasting', key: 'capex', title: 'CAPEX' },
  { group: 'Forecasting', key: 'projectExpense', title: 'Project Expense Forecast' },
  { group: 'Management Reports', key: 'executiveSummary', title: 'Executive Summary' }
];
