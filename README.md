# Al Laith Group Finance MIS Dashboard

This is the modular Version 5 structure for the Al Laith Group finance dashboard.

## Core files

- `index.html` — dashboard layout and placeholders
- `styles.css` — all styling
- `app.js` — current dashboard logic
- `data-service.js` — Google Sheet data loading
- `liquidity.js` — liquidity excluding Qiddiya logic
- `executive-summary.js` — executive summary logic

## Current modules

- Cash Flow / Consolidated
- Liquidity Excluding Qiddiya
- Group Forecast
- By Business Unit
- Settings & Data
- Help / Calculations

## Planned finance modules now reserved in the structure

### Treasury
- `bank-balance.js` — Bank Balance
- `pdc-issued.js` — PDC Issued
- `bank-loan.js` — Bank Loans
- `intercompany.js` — Intercompany

### Receivables
- `receivables.js` — Receivable Aging
- `collection-target.js` — Collection vs Target
- `qiddiya-receivable.js` — Qiddiya Project Receivable

### Payables / Commitments
- `supplier-aging.js` — Supplier Aging
- `rent.js` — Rent
- `insurance.js` — Insurance
- `taxes.js` — Taxes
- `payroll.js` — Salaries & Wages

### Forecasting
- `revenue-forecast.js` — Revenue Forecast Summary / Detail
- `capex.js` — CAPEX
- `project-expense.js` — Project Expense Forecast

## How to add a new report

1. Add the related Google Sheet tab/range in Apps Script.
2. Add calculation/formatting functions to the related module file.
3. Add a menu/page placeholder in `index.html` if required.
4. Register the report in `report-registry.js`.
5. Test in browser console before uploading to production.

## Important rule

Google Sheet should remain the source of truth for finance calculations. The dashboard should display, filter, group, and explain the data without changing finance logic unless explicitly approved.
