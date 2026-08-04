// Bank Loans dashboard module
// Source: Google Sheet tab "Debt Summary"
(function () {
  'use strict';

  const SHEET_NAMES = ['Debt Summary', 'DEBT SUMMARY', 'Debt summary'];
  const STYLE_ID = 'bank-loan-module-styles';
  let cachedMatrix = null;
  let loadingPromise = null;

  function text(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
      return String(value.value ?? value.displayValue ?? value.formattedValue ?? value.text ?? '').trim();
    }
    return String(value).trim();
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function rowValues(row) {
    return Array.isArray(row) ? row.map(text) : [];
  }

  function nonEmpty(row) {
    return rowValues(row).some(Boolean);
  }

  function joined(row) {
    return rowValues(row).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  function normaliseMatrix(matrix) {
    return (Array.isArray(matrix) ? matrix : []).map(rowValues);
  }

  function findRow(matrix, matcher, fromIndex) {
    const start = Math.max(0, Number(fromIndex) || 0);
    for (let i = start; i < matrix.length; i += 1) {
      if (matcher(joined(matrix[i]), matrix[i], i)) return i;
    }
    return -1;
  }

  function trimRow(row) {
    const values = rowValues(row);
    let end = values.length;
    while (end > 0 && !values[end - 1]) end -= 1;
    return values.slice(0, end);
  }

  function isTotalRow(row) {
    return /^total$/i.test(text(row && row[0]));
  }

  function parseDebtSummary(matrix) {
    const rows = normaliseMatrix(matrix);
    const titleIndex = findRow(rows, value => /executive\s+debt\s+summary/i.test(value));
    const keyIndex = findRow(rows, value => /^key\s+message/i.test(value), titleIndex + 1);
    const repaymentTitleIndex = findRow(rows, value => /debt\s+repayment\s+profile/i.test(value), Math.max(0, keyIndex));

    let facilityHeaderIndex = findRow(
      rows,
      (value, row) => /facility/i.test(value) && /purpose/i.test(value) && row.some(cell => /outstanding/i.test(cell)),
      Math.max(0, titleIndex)
    );

    let repaymentHeaderIndex = findRow(
      rows,
      (value, row) => /^year\b/i.test(value) && row.some(cell => /total\s+principal/i.test(cell)),
      Math.max(0, repaymentTitleIndex)
    );

    if (facilityHeaderIndex < 0) facilityHeaderIndex = titleIndex + 1;
    if (repaymentHeaderIndex < 0) repaymentHeaderIndex = repaymentTitleIndex + 1;

    const facilityRows = [];
    for (let i = facilityHeaderIndex + 1; i < rows.length; i += 1) {
      if (i === keyIndex || i === repaymentTitleIndex) break;
      const row = trimRow(rows[i]);
      if (!row.some(Boolean)) continue;
      facilityRows.push(row);
      if (isTotalRow(row)) break;
    }

    const messages = [];
    if (keyIndex >= 0) {
      const stop = repaymentTitleIndex >= 0 ? repaymentTitleIndex : repaymentHeaderIndex;
      for (let i = keyIndex + 1; i < (stop >= 0 ? stop : rows.length); i += 1) {
        const value = joined(rows[i]);
        if (!value) continue;
        value.split(/\n+/).forEach(part => {
          const clean = part.replace(/^\s*[-•–—]\s*/, '').trim();
          if (clean) messages.push(clean);
        });
      }
    }

    const repaymentRows = [];
    for (let i = repaymentHeaderIndex + 1; i < rows.length; i += 1) {
      const row = trimRow(rows[i]);
      if (!row.some(Boolean)) continue;
      repaymentRows.push(row);
      if (isTotalRow(row)) break;
    }

    return {
      title: titleIndex >= 0 ? joined(rows[titleIndex]) : 'Executive Debt Summary',
      facilityHeaders: trimRow(rows[facilityHeaderIndex] || []),
      facilityRows,
      messages,
      repaymentHeaders: trimRow(rows[repaymentHeaderIndex] || []),
      repaymentRows
    };
  }

  function numberFrom(value) {
    const match = text(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  }

  function findOutstandingTotal(data) {
    const total = data.facilityRows.find(isTotalRow);
    return total && total.length > 3 ? text(total[3]) : '—';
  }

  function findOriginalTotal(data) {
    const total = data.facilityRows.find(isTotalRow);
    return total && total.length > 2 ? text(total[2]) : '—';
  }

  function findPeakRepayment(data) {
    let peak = null;
    data.repaymentRows.forEach(row => {
      if (isTotalRow(row)) return;
      const amount = numberFrom(row[row.length - 1]);
      if (amount !== null && (!peak || amount > peak.amount)) {
        peak = { year: text(row[0]), amount, display: text(row[row.length - 1]) };
      }
    });
    return peak;
  }

  function renderTable(headers, rows, className) {
    if (!headers.length || !rows.length) return '<div class="bl-empty">No table data found.</div>';
    const width = Math.max(headers.length, ...rows.map(row => row.length));
    const normalHeaders = Array.from({ length: width }, (_, i) => headers[i] || '');
    return `
      <div class="bl-table-wrap">
        <table class="bl-table ${className || ''}">
          <thead><tr>${normalHeaders.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(row => {
            const cells = Array.from({ length: width }, (_, i) => row[i] || '');
            return `<tr class="${isTotalRow(row) ? 'bl-total' : ''}">${cells.map((cell, i) => `<td class="${i >= 2 ? 'bl-num' : ''}">${escapeHtml(cell)}</td>`).join('')}</tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .bl-dashboard{display:grid;gap:18px;color:#172033}
      .bl-hero{background:linear-gradient(135deg,#122c5d,#244f91);color:#fff;border-radius:14px;padding:22px 24px;box-shadow:0 8px 24px rgba(19,45,91,.18)}
      .bl-hero h2{margin:0 0 5px;font-size:24px}.bl-hero p{margin:0;opacity:.82}
      .bl-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
      .bl-kpi{background:#fff;border:1px solid #e2e7ef;border-radius:12px;padding:15px 16px;box-shadow:0 4px 14px rgba(30,48,77,.07)}
      .bl-kpi-label{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#667085;font-weight:700}
      .bl-kpi-value{font-size:24px;font-weight:800;color:#0c3569;margin-top:5px}.bl-kpi-note{font-size:12px;color:#7b8494;margin-top:2px}
      .bl-section{background:#fff;border:1px solid #e2e7ef;border-radius:12px;padding:18px;box-shadow:0 4px 14px rgba(30,48,77,.06)}
      .bl-section h3{margin:0 0 14px;color:#102c56;font-size:18px;border-bottom:2px solid #d9e4f5;padding-bottom:9px}
      .bl-table-wrap{overflow:auto}.bl-table{width:100%;border-collapse:separate;border-spacing:0;min-width:720px}
      .bl-table th{background:#3f7fda;color:#fff;text-align:left;padding:10px 11px;font-size:13px;white-space:nowrap}
      .bl-table td{padding:10px 11px;border-bottom:1px solid #e8ecf2;font-size:13px;vertical-align:top}.bl-table tbody tr:hover td{background:#f8fbff}
      .bl-table .bl-num{text-align:right;white-space:nowrap}.bl-table .bl-total td{font-weight:800;background:#eef2f7;border-top:2px solid #cfd6e1}
      .bl-messages{margin:0;padding-left:22px;display:grid;gap:9px}.bl-messages li{line-height:1.45}.bl-messages li::marker{color:#2471c8}
      .bl-status{padding:18px;border:1px dashed #b9c4d3;border-radius:10px;color:#5c6675;background:#f8fafc}.bl-error{color:#9b1c1c;background:#fff4f4;border-color:#f2b8b8}
      .bl-toolbar{display:flex;justify-content:flex-end;margin-bottom:10px}.bl-refresh{border:1px solid #c8d2df;background:#fff;border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer}.bl-refresh:hover{background:#f4f7fb}
      @media(max-width:850px){.bl-kpis{grid-template-columns:1fr}.bl-hero{padding:18px}.bl-section{padding:13px}}
      @media print{.bl-refresh{display:none}.bl-dashboard{gap:10px}.bl-section,.bl-kpi,.bl-hero{box-shadow:none}}
    `;
    document.head.appendChild(style);
  }

  function findContainer() {
    const direct = [
      'bankLoanContent', 'bankLoansContent', 'bank-loan-content', 'bank-loans-content',
      'view-bank-loans', 'view-bankloan', 'view-bank-loan'
    ];
    for (const id of direct) {
      const el = document.getElementById(id);
      if (el) return el;
    }

    const views = Array.from(document.querySelectorAll('.view, section, main > div'));
    const view = views.find(el => /bank\s+loans?/i.test(el.textContent || ''));
    if (!view) return null;

    const card = Array.from(view.querySelectorAll('.card, .panel, article, section, div')).find(el => {
      const heading = el.querySelector && el.querySelector('h1,h2,h3,h4');
      return heading && /^bank\s+loans?$/i.test((heading.textContent || '').trim());
    });
    return card || view;
  }

  function contentHost(container) {
    let host = container.querySelector && container.querySelector('[data-bank-loan-content]');
    if (host) return host;

    host = document.createElement('div');
    host.setAttribute('data-bank-loan-content', 'true');

    const heading = container.querySelector && Array.from(container.querySelectorAll('h1,h2,h3,h4')).find(h => /^bank\s+loans?$/i.test((h.textContent || '').trim()));
    if (heading) {
      let node = heading.nextSibling;
      while (node) {
        const next = node.nextSibling;
        node.remove();
        node = next;
      }
      heading.insertAdjacentElement('afterend', host);
    } else {
      container.innerHTML = '';
      container.appendChild(host);
    }
    return host;
  }

  function renderData(data) {
    injectStyles();
    const container = findContainer();
    if (!container) return false;
    const host = contentHost(container);
    const peak = findPeakRepayment(data);

    host.innerHTML = `
      <div class="bl-dashboard">
        <div class="bl-toolbar"><button type="button" class="bl-refresh" data-bank-loan-refresh>Refresh debt summary</button></div>
        <div class="bl-hero"><h2>${escapeHtml(data.title)}</h2><p>Asset financing facilities and principal repayment profile</p></div>
        <div class="bl-kpis">
          <div class="bl-kpi"><div class="bl-kpi-label">Original facilities</div><div class="bl-kpi-value">${escapeHtml(findOriginalTotal(data))}</div><div class="bl-kpi-note">Total principal contracted</div></div>
          <div class="bl-kpi"><div class="bl-kpi-label">Outstanding balance</div><div class="bl-kpi-value">${escapeHtml(findOutstandingTotal(data))}</div><div class="bl-kpi-note">Per Debt Summary sheet</div></div>
          <div class="bl-kpi"><div class="bl-kpi-label">Peak annual repayment</div><div class="bl-kpi-value">${escapeHtml(peak ? peak.display : '—')}</div><div class="bl-kpi-note">${escapeHtml(peak ? peak.year : 'No repayment rows found')}</div></div>
        </div>
        <section class="bl-section"><h3>Loan Facilities</h3>${renderTable(data.facilityHeaders, data.facilityRows, 'bl-facilities')}</section>
        <section class="bl-section"><h3>Key Messages</h3>${data.messages.length ? `<ul class="bl-messages">${data.messages.map(m => `<li>${escapeHtml(m)}</li>`).join('')}</ul>` : '<div class="bl-empty">No key messages found.</div>'}</section>
        <section class="bl-section"><h3>Debt Repayment Profile</h3>${renderTable(data.repaymentHeaders, data.repaymentRows, 'bl-repayments')}</section>
      </div>`;

    const refresh = host.querySelector('[data-bank-loan-refresh]');
    if (refresh) refresh.addEventListener('click', async () => {
      refresh.disabled = true;
      refresh.textContent = 'Refreshing…';
      try {
        if (typeof window.refreshFromGoogleSheet === 'function') {
          await window.refreshFromGoogleSheet();
          const matrix = matrixFromSharedPayload();
          if (matrix) module.setData(matrix);
          else await module.load(true);
        } else {
          await module.load(true);
        }
      } finally {
        refresh.disabled = false;
        refresh.textContent = 'Refresh debt summary';
      }
    });
    return true;
  }

  function renderStatus(message, error) {
    injectStyles();
    const container = findContainer();
    if (!container) return false;
    const host = contentHost(container);
    host.innerHTML = `<div class="bl-status ${error ? 'bl-error' : ''}">${escapeHtml(message)}</div>`;
    return true;
  }

  function sharedPayload() {
    return window.GOOGLE_SHEET_RAW_PAYLOAD || window.DASHBOARD_DATA_RAW || null;
  }

  function matrixFromSharedPayload(payload) {
    return extractSheet(payload || sharedPayload());
  }

  function getApiUrl() {
    const ids = ['googleSheetUrlSettings', 'googleSheetUrl'];
    for (const id of ids) {
      const input = document.getElementById(id);
      if (input && String(input.value || '').trim()) return String(input.value).trim();
    }
    return String(localStorage.getItem('cf_google_sheet_url') || window.DEFAULT_GOOGLE_SHEET_URL || '').trim();
  }

  function loadJsonp(url) {
    return new Promise((resolve, reject) => {
      const callback = 'bankLoanJsonp_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      const separator = url.includes('?') ? '&' : '?';
      const timer = setTimeout(() => finish(new Error('Google Sheet request timed out.')), 120000);

      function finish(error, data) {
        clearTimeout(timer);
        try { delete window[callback]; } catch (_) { window[callback] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
        error ? reject(error) : resolve(data);
      }

      window[callback] = data => finish(null, data);
      script.onerror = () => finish(new Error('Could not load the Google Sheet API.'));
      script.src = url + separator + 'callback=' + encodeURIComponent(callback) + '&t=' + Date.now();
      document.body.appendChild(script);
    });
  }

  function extractSheet(payload) {
    const sheets = payload && (payload.sheets || payload);
    if (!sheets || typeof sheets !== 'object') return null;
    for (const name of SHEET_NAMES) {
      if (Array.isArray(sheets[name])) return sheets[name];
    }
    const key = Object.keys(sheets).find(name => /^debt\s*summary$/i.test(name.trim()));
    return key && Array.isArray(sheets[key]) ? sheets[key] : null;
  }

  async function fetchMatrix(force) {
    if (!force && cachedMatrix) return cachedMatrix;
    if (!force && loadingPromise) return loadingPromise;

    // First use the payload already loaded by app.js.
    const existing = matrixFromSharedPayload();
    if (existing) {
      cachedMatrix = existing;
      return cachedMatrix;
    }

    // Ask the shared app.js connector for the summary scope.
    // This avoids a duplicate standalone JSONP request.
    if (typeof window.loadGoogleSheetScope === 'function') {
      loadingPromise = window.loadGoogleSheetScope('summary-debt', { force: Boolean(force) })
        .then(payload => {
          const matrix = matrixFromSharedPayload(payload);
          if (!matrix) {
            throw new Error('The shared summary response does not include the "Debt Summary" tab.');
          }
          cachedMatrix = matrix;
          return matrix;
        })
        .finally(() => { loadingPromise = null; });

      return loadingPromise;
    }

    // Safe fallback for older app.js versions: use the configured API with summary scope.
    const url = getApiUrl();
    if (!url) throw new Error('Google Sheet API URL is not configured.');

    const scopedUrl = url + (url.includes('?') ? '&' : '?') + 'scope=summary-debt';
    loadingPromise = loadJsonp(scopedUrl)
      .then(payload => {
        const matrix = extractSheet(payload);
        if (!matrix) {
          throw new Error('The summary response does not include the "Debt Summary" tab.');
        }
        cachedMatrix = matrix;
        return matrix;
      })
      .finally(() => { loadingPromise = null; });

    return loadingPromise;
  }

  const module = {
    title: 'Bank loan and repayment dashboard module',
    status: 'active',
    parse: parseDebtSummary,
    setData(matrix) {
      cachedMatrix = matrix;
      return this.render(matrix);
    },
    render(matrix) {
      const source = matrix || cachedMatrix;
      if (!source) {
        renderStatus('Open the Bank Loans tab or refresh the Google Sheet to load Debt Summary data.');
        return false;
      }
      return renderData(parseDebtSummary(source));
    },
    async load(force) {
      renderStatus('Loading Debt Summary from Google Sheet…');
      try {
        const matrix = await fetchMatrix(Boolean(force));
        this.render(matrix);
      } catch (error) {
        console.error('[BANK_LOAN_MODULE]', error);
        if (cachedMatrix) {
          this.render(cachedMatrix);
          return false;
        }
        renderStatus(error && error.message ? error.message : 'Unable to load Debt Summary.', true);
        return false;
      }
    }
  };

  window.BANK_LOAN_MODULE = module;

  document.addEventListener('click', event => {
    const button = event.target.closest && event.target.closest('button[data-view]');
    if (!button || !/bank[-_ ]?loans?/i.test(String(button.dataset.view || '') + ' ' + (button.textContent || ''))) return;
    setTimeout(() => module.load(false), 0);
  });

  window.addEventListener('googleSheetPayloadReady', event => {
    const matrix = matrixFromSharedPayload(event && event.detail);
    if (!matrix) return;
    cachedMatrix = matrix;
    if (findContainer()) module.render(matrix);
  });

  // Compatibility event for future FIP connector releases.
  window.addEventListener('fip:data-ready', event => {
    const matrix = matrixFromSharedPayload(event && event.detail);
    if (!matrix) return;
    cachedMatrix = matrix;
    if (findContainer()) module.render(matrix);
  });

  function boot() {
    if (!findContainer()) return;
    const matrix = matrixFromSharedPayload();
    if (matrix) {
      cachedMatrix = matrix;
      module.render(matrix);
    } else {
      renderStatus('Debt Summary will load after the next Google Sheet refresh.');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 250));
  else setTimeout(boot, 250);
}());
