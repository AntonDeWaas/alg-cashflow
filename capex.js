// Dynamic CAPEX Summary dashboard module — unified full refresh
// Reads the "Capex Summary" Google Sheet tab and injects its own navigation/view.
// Designed to work without changing app.js or the live HTML structure.

(function () {
  'use strict';

  const MODULE = {
    sheetName: 'Capex Summary',
    viewId: 'capex',
    navLabel: 'Capex',
    data: [],
    lastUpdated: null,
    refreshWrapped: false
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function clean(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function numberValue(value) {
    const text = clean(value);
    if (!text || text === '-' || text === '—') return null;
    const negative = /^\(.*\)$/.test(text);
    const normalized = text
      .replace(/[(),]/g, '')
      .replace(/\bAED\b/gi, '')
      .replace(/['’]000/gi, '')
      .replace(/[^\d.-]/g, '');
    if (!normalized || normalized === '-' || Number.isNaN(Number(normalized))) return null;
    const n = Number(normalized);
    return negative ? -Math.abs(n) : n;
  }

  function formatNumber(value) {
    const n = numberValue(value);
    if (n == null) return esc(value);
    const abs = Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
    return n < 0 ? '(' + abs + ')' : abs;
  }

  function rowHasContent(row) {
    return Array.isArray(row) && row.some(cell => clean(cell) !== '');
  }

  function trimMatrix(rows) {
    if (!Array.isArray(rows)) return [];
    const useful = rows.filter(rowHasContent);
    if (!useful.length) return [];

    let maxCol = 0;
    useful.forEach(row => {
      for (let i = row.length - 1; i >= 0; i--) {
        if (clean(row[i]) !== '') {
          maxCol = Math.max(maxCol, i + 1);
          break;
        }
      }
    });
    return useful.map(row => Array.from({ length: maxCol }, (_, i) => row[i] == null ? '' : row[i]));
  }

  function findHeaderIndex(rows) {
    return rows.findIndex(row => {
      const first = clean(row[0]).toLowerCase();
      const rest = row.slice(1).map(clean);
      const monthCount = rest.filter(v =>
        /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)([-\s']?\d{2,4})?$/i.test(v)
      ).length;
      return /description|capex item|project|investment/i.test(first) && monthCount >= 2;
    });
  }

  function classifyRow(row, index, headerIndex) {
    const label = clean(row[0]);
    const lower = label.toLowerCase();
    const nonEmpty = row.filter(cell => clean(cell) !== '').length;
    const numericCount = row.slice(1).filter(cell => numberValue(cell) != null).length;

    if (index === headerIndex) return 'header';
    if (!label && nonEmpty === 0) return 'blank';
    if (/capital expenditure.*forecast|capex.*investment.*summary/i.test(label)) return 'title';
    if (/^capex summary\b/i.test(label)) return 'summary-title';
    if (/^total capex\b|grand total/i.test(lower)) return 'grand-total';
    if (/\btotal\b/i.test(lower)) return 'subtotal';
    if (/unassigned capex/i.test(lower)) return 'unassigned';

    // A section row normally has only the first cell populated and no numeric values.
    if (label && nonEmpty === 1 && numericCount === 0) return 'section';

    return 'detail';
  }

  function detectTotalColumn(headers) {
    for (let i = headers.length - 1; i >= 0; i--) {
      if (/total|annual|year/i.test(clean(headers[i]))) return i;
    }
    return headers.length - 1;
  }

  function normalizeMatrix(rows) {
    if (!Array.isArray(rows)) return [];
    let first = rows.findIndex(rowHasContent);
    let last = rows.length - 1;
    while (last >= 0 && !rowHasContent(rows[last])) last--;
    if (first < 0 || last < first) return [];

    const slice = rows.slice(first, last + 1);
    let maxCol = 0;
    slice.forEach(row => {
      if (!Array.isArray(row)) return;
      for (let i = row.length - 1; i >= 0; i--) {
        if (clean(row[i]) !== '') {
          maxCol = Math.max(maxCol, i + 1);
          break;
        }
      }
    });
    return slice.map(row => Array.from({ length: maxCol }, (_, i) =>
      Array.isArray(row) && row[i] != null ? row[i] : ''
    ));
  }

  function buildBlock(matrix, summaryIndex, nextSummaryIndex) {
    const summaryLabel = clean(matrix[summaryIndex] && matrix[summaryIndex][0]);
    const yearMatch = summaryLabel.match(/\b(20\d{2})\b/);
    const year = yearMatch ? Number(yearMatch[1]) : null;
    const limit = nextSummaryIndex == null ? matrix.length : nextSummaryIndex;

    let headerIndex = -1;
    for (let i = summaryIndex + 1; i < limit; i++) {
      const candidate = findHeaderIndex([matrix[i]]);
      if (candidate === 0) {
        headerIndex = i;
        break;
      }
    }
    if (headerIndex < 0) return null;

    let bodyEnd = limit;
    while (bodyEnd > headerIndex + 1 && !rowHasContent(matrix[bodyEnd - 1])) bodyEnd--;
    const headers = matrix[headerIndex].map(clean);
    const body = matrix.slice(headerIndex + 1, bodyEnd);

    return {
      year,
      label: summaryLabel || (year ? 'Capex Summary ' + year : 'Capex Summary'),
      matrix,
      headerIndex,
      headers,
      body,
      totalColumn: detectTotalColumn(headers)
    };
  }

  function buildReport(rows) {
    const matrix = normalizeMatrix(rows);
    if (!matrix.length) return null;

    const summaryIndexes = [];
    matrix.forEach((row, index) => {
      if (/^capex summary\b/i.test(clean(row[0]))) summaryIndexes.push(index);
    });

    const blocks = [];
    summaryIndexes.forEach((summaryIndex, i) => {
      const block = buildBlock(matrix, summaryIndex, summaryIndexes[i + 1]);
      if (block) blocks.push(block);
    });

    // Fallback for a sheet with one table but no "Capex Summary YYYY" row.
    if (!blocks.length) {
      const headerIndex = findHeaderIndex(matrix);
      if (headerIndex >= 0) {
        const titleRow = matrix.slice(0, headerIndex).find(row =>
          /capital expenditure|capex/i.test(clean(row[0]))
        );
        blocks.push({
          year: null,
          label: titleRow ? clean(titleRow[0]) : 'Capex Summary',
          matrix,
          headerIndex,
          headers: matrix[headerIndex].map(clean),
          body: matrix.slice(headerIndex + 1),
          totalColumn: detectTotalColumn(matrix[headerIndex].map(clean))
        });
      }
    }

    const titleRow = matrix.find(row =>
      /capital expenditure.*forecast|capex.*investment.*summary/i.test(clean(row[0]))
    );

    return {
      title: titleRow ? clean(titleRow[0]) : 'Capital Expenditure (CAPEX) Summary',
      matrix,
      blocks
    };
  }

  function locateGrandTotal(model) {
    if (!model) return null;
    for (let i = model.body.length - 1; i >= 0; i--) {
      const row = model.body[i];
      if (/^total capex\b|grand total/i.test(clean(row[0]))) return row;
    }
    return null;
  }

  function locateUnassigned(model) {
    if (!model) return null;
    return model.body.find(row => /unassigned capex/i.test(clean(row[0]))) || null;
  }

  function sectionCount(model) {
    if (!model) return 0;
    return model.body.filter((row, i) =>
      classifyRow(row, i + model.headerIndex + 1, model.headerIndex) === 'section'
    ).length;
  }

  function latestPlannedMonth(model, grandTotalRow) {
    if (!model || !grandTotalRow || model.headers.length < 2) return '—';
    const lastMonthIndex = Math.min(model.totalColumn - 1, model.headers.length - 1);
    for (let i = lastMonthIndex; i >= 1; i--) {
      const n = numberValue(grandTotalRow[i]);
      if (n != null && n !== 0) return clean(model.headers[i]) || '—';
    }
    return '—';
  }

  function selectKpiBlock(report) {
    if (!report || !report.blocks.length) return null;
    return report.blocks.find(block => block.year === 2026) || report.blocks[0];
  }

  function renderKpis(model) {
    if (!model) return '';
    const grand = locateGrandTotal(model);
    const unassigned = locateUnassigned(model);
    const total = grand && model.totalColumn >= 0 ? numberValue(grand[model.totalColumn]) : null;
    const unassignedTotal = unassigned && model.totalColumn >= 0
      ? numberValue(unassigned[model.totalColumn])
      : null;
    const assigned = total != null && unassignedTotal != null ? total - unassignedTotal : null;
    const assignedPct = total ? (assigned / total) * 100 : null;
    const yearLabel = model.year || 2026;

    const items = [
      ['Total CAPEX ' + yearLabel, total, "AED '000"],
      ['Assigned CAPEX ' + yearLabel, assigned, assignedPct == null ? 'Project allocation' : assignedPct.toFixed(1) + '% allocated'],
      ['Unassigned CAPEX ' + yearLabel, unassignedTotal, 'Future allocation'],
      ['CAPEX Sections ' + yearLabel, sectionCount(model), latestPlannedMonth(model, grand) + ' latest planned month']
    ];

    return items.map(item => {
      const value = typeof item[1] === 'number'
        ? item[1].toLocaleString('en-US', { maximumFractionDigits: 2 })
        : '—';
      return `
        <div class="card kpi capex-kpi">
          <div class="lbl">${esc(item[0])}</div>
          <div class="val num">${esc(value)}</div>
          <div class="meta">${esc(item[2])}</div>
        </div>`;
    }).join('');
  }

  function renderTable(model) {
    if (!model) return '<div class="empty">No CAPEX data is available.</div>';

    const head = model.headers.map((header, i) =>
      `<th class="${i === 0 ? 'capex-desc-col' : ''} ${i === model.totalColumn ? 'capex-total-col' : ''}">
        ${esc(header || (i === 0 ? 'Description' : ''))}
      </th>`
    ).join('');

    const body = model.body.map((row, bodyIndex) => {
      if (!rowHasContent(row)) return '';
      const absoluteIndex = model.headerIndex + 1 + bodyIndex;
      const kind = classifyRow(row, absoluteIndex, model.headerIndex);

      if (kind === 'section' || kind === 'summary-title') {
        return `<tr class="capex-section-row"><td colspan="${model.headers.length}">${esc(clean(row[0]))}</td></tr>`;
      }

      const cells = model.headers.map((_, colIndex) => {
        const raw = row[colIndex] == null ? '' : row[colIndex];
        const classes = [];
        if (colIndex === 0) classes.push('rowhead', 'capex-desc-col');
        else classes.push('num');
        if (colIndex === model.totalColumn) classes.push('capex-total-col');

        return `<td class="${classes.join(' ')}">${
          colIndex === 0 ? esc(raw) : formatNumber(raw)
        }</td>`;
      }).join('');

      const rowClass = {
        'grand-total': 'capex-grand-total',
        'subtotal': 'capex-subtotal',
        'unassigned': 'capex-unassigned',
        'title': 'capex-title-row',
        'detail': 'capex-detail'
      }[kind] || '';

      return `<tr class="${rowClass}">${cells}</tr>`;
    }).join('');

    return `
      <section class="capex-year-block" data-capex-year="${esc(model.year || '')}">
        <div class="capex-year-heading">${esc(model.label)}</div>
        <div class="capex-table-wrap">
          <table class="capex-table sticky-report">
            <thead><tr>${head}</tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </section>`;
  }

  function render() {
    const root = byId('capexRoot');
    const kpis = byId('capexKpis');
    const subtitle = byId('capexSubtitle');
    if (!root || !kpis) return;

    const report = buildReport(MODULE.data);
    if (!report || !report.blocks.length) {
      kpis.innerHTML = '';
      root.innerHTML = `
        <div class="empty">
          Capex Summary data was not returned by Google Sheets.
          Confirm the Apps Script includes a sheet named exactly <strong>Capex Summary</strong>,
          redeploy it, then click Refresh Google Sheet.
        </div>`;
      return;
    }

    subtitle.textContent = [
      "Source: Google Sheet · Capex Summary",
      MODULE.lastUpdated ? 'Updated ' + MODULE.lastUpdated : '',
      "Values displayed in AED '000"
    ].filter(Boolean).join(' · ');

    const kpiBlock = selectKpiBlock(report);
    kpis.innerHTML = renderKpis(kpiBlock);
    root.innerHTML = report.blocks.map(renderTable).join('');
  }

  function injectStyles() {
    if (byId('capexModuleStyles')) return;
    const style = document.createElement('style');
    style.id = 'capexModuleStyles';
    style.textContent = `
      #view-capex .capex-toolbar{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap}
      #view-capex .capex-actions{display:flex;gap:8px;align-items:center}
      #view-capex .capex-kpi .val{font-size:1.55rem}
      #view-capex .capex-year-block{margin-top:30px}
      #view-capex .capex-year-block:first-child{margin-top:10px}
      #view-capex .capex-year-heading{padding:10px 12px;background:#48c3d3;color:#062a3c;font-weight:900;font-size:1.05rem;border-radius:10px 10px 0 0}
      #view-capex .capex-year-block .capex-table-wrap{border-radius:0 0 10px 10px}
      #view-capex .capex-table-wrap{overflow:auto;max-width:100%;border:1px solid var(--line,#ded8cb);border-radius:10px}
      #view-capex .capex-table{border-collapse:separate;border-spacing:0;width:max-content;min-width:100%;background:#fff}
      #view-capex .capex-table th,#view-capex .capex-table td{white-space:nowrap;padding:9px 11px;border-bottom:1px solid #ece8df}
      #view-capex .capex-table thead th{position:sticky;top:0;z-index:4;background:#0b3767;color:#fff;font-weight:700}
      #view-capex .capex-desc-col{position:sticky;left:0;z-index:2;min-width:285px;max-width:440px;white-space:normal!important;background:inherit}
      #view-capex thead .capex-desc-col{z-index:6;background:#0b3767}
      #view-capex .capex-total-col{font-weight:700;background:#f3ead3}
      #view-capex thead .capex-total-col{background:#173f70}
      #view-capex .capex-section-row td{background:#48c3d3;color:#062a3c;font-weight:800;font-size:1rem;position:relative;z-index:3}
      #view-capex .capex-subtotal td{font-weight:800;background:#f5f5f3;border-top:2px solid #d7d4cc}
      #view-capex .capex-grand-total td{font-weight:900;background:#e8eef7;border-top:3px solid #0b3767}
      #view-capex .capex-unassigned td{background:#d8f4f7}
      #view-capex .capex-detail:nth-child(even) td{background:#f2fbfc}
      #view-capex .capex-detail:nth-child(even) .capex-desc-col{background:#f2fbfc}
      #view-capex .capex-detail:nth-child(odd) .capex-desc-col{background:#fff}
      #view-capex .capex-subtotal .capex-desc-col{background:#f5f5f3}
      #view-capex .capex-grand-total .capex-desc-col{background:#e8eef7}
      #view-capex .capex-unassigned .capex-desc-col{background:#d8f4f7}
      @media (max-width:900px){
        #view-capex .capex-desc-col{min-width:230px;max-width:300px}
      }
    `;
    document.head.appendChild(style);
  }

  function injectUi() {
    injectStyles();

    const nav = byId('nav') || document.querySelector('nav.tabs');
    if (nav && !nav.querySelector('button[data-view="capex"]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.view = 'capex';
      button.textContent = MODULE.navLabel;

      const intercompanyButton = nav.querySelector('button[data-view="intercompany"]');
      if (intercompanyButton) nav.insertBefore(button, intercompanyButton);
      else nav.appendChild(button);
    }

    const main = document.querySelector('main');
    if (main && !byId('view-capex')) {
      const section = document.createElement('section');
      section.className = 'view';
      section.id = 'view-capex';
      section.innerHTML = `
        <div class="card panel">
          <div class="panelhead capex-toolbar">
            <div>
              <h2>Capital Expenditure (CAPEX) Summary</h2>
              <p class="hint" id="capexSubtitle">Source: Google Sheet · Capex Summary</p>
            </div>
            <div class="capex-actions">
              <button class="btn ghost" type="button" id="capexRefreshBtn">Refresh CAPEX</button>
            </div>
          </div>
          <div class="grid kpis" id="capexKpis"></div>
          <div id="capexRoot">
            <div class="empty">Loading Capex Summary…</div>
          </div>
        </div>`;
      main.appendChild(section);
      byId('capexRefreshBtn').addEventListener('click', refresh);
    }
  }

  function getApiUrl() {
    const knownIds = [
      'googleSheetUrl',
      'googleUrl',
      'sheetApiUrl',
      'appsScriptUrl'
    ];
    for (const id of knownIds) {
      const el = byId(id);
      if (el && clean(el.value)) return clean(el.value);
    }

    if (typeof window.getGoogleSheetUrlInput === 'function') {
      try {
        const value = window.getGoogleSheetUrlInput();
        if (clean(value)) return clean(value);
      } catch (_) {}
    }

    const storageKeys = [
      'cf_google_sheet_url',
      'googleSheetUrl',
      'cashflow_google_url',
      'appsScriptUrl'
    ];
    for (const key of storageKeys) {
      try {
        const value = localStorage.getItem(key);
        if (clean(value)) return clean(value);
      } catch (_) {}
    }

    return clean(window.DEFAULT_GOOGLE_SHEET_URL || '');
  }

  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const callbackName = 'capexJsonp_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const separator = url.includes('?') ? '&' : '?';
      const script = document.createElement('script');
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('CAPEX request timed out.'));
      }, 120000);

      function cleanup() {
        clearTimeout(timeout);
        try { delete window[callbackName]; } catch (_) { window[callbackName] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[callbackName] = data => {
        cleanup();
        resolve(data);
      };
      script.onerror = () => {
        cleanup();
        reject(new Error('Could not load the Google Sheet endpoint.'));
      };
      script.src = url + separator + 'callback=' + encodeURIComponent(callbackName) + '&t=' + Date.now();
      document.body.appendChild(script);
    });
  }

  function readCapexSheet(payload) {
    const sheets = payload && (payload.sheets || payload);
    if (!sheets || typeof sheets !== 'object') return [];
    const direct = sheets[MODULE.sheetName];
    if (Array.isArray(direct)) return direct;

    const key = Object.keys(sheets).find(name =>
      clean(name).toLowerCase() === MODULE.sheetName.toLowerCase()
    );
    return key && Array.isArray(sheets[key]) ? sheets[key] : [];
  }

  function applyCapexPayload(payload) {
    const rows = readCapexSheet(payload);
    if (!rows.length) return false;

    MODULE.data = rows;
    MODULE.lastUpdated = payload && payload.lastUpdated
      ? new Date(payload.lastUpdated).toLocaleString()
      : new Date().toLocaleString();

    window.CAPEX_SUMMARY_DATA = MODULE.data;
    render();
    return true;
  }

  function mergeSharedPayload(payload) {
    if (!payload || !payload.sheets) return;
    window.GOOGLE_SHEET_RAW_PAYLOAD =
      window.GOOGLE_SHEET_RAW_PAYLOAD || { sheets: {} };
    window.GOOGLE_SHEET_RAW_PAYLOAD.sheets =
      window.GOOGLE_SHEET_RAW_PAYLOAD.sheets || {};

    Object.assign(
      window.GOOGLE_SHEET_RAW_PAYLOAD.sheets,
      payload.sheets
    );

    if (payload.lastUpdated) {
      window.GOOGLE_SHEET_RAW_PAYLOAD.lastUpdated = payload.lastUpdated;
    }
  }

  async function refresh(options) {
    options = options || {};
    injectUi();

    const root = byId('capexRoot');
    const button = byId('capexRefreshBtn');

    // Reuse the payload already loaded by the main dashboard whenever possible.
    if (!options.force && applyCapexPayload(window.GOOGLE_SHEET_RAW_PAYLOAD)) {
      return true;
    }

    if (root && !options.silent) {
      root.innerHTML = '<div class="empty">Refreshing Capex Summary…</div>';
    }

    if (button) {
      button.disabled = true;
      button.textContent = 'Refreshing CAPEX…';
    }

    try {
      let payload = null;

      // Preferred path: use the common scoped loader from app.js.
      if (typeof window.loadGoogleSheetScope === 'function') {
        try {
          payload = await window.loadGoogleSheetScope(
            'summary-capex',
            { force: true, timeoutMs: 120000 }
          );
        } catch (firstError) {
          await new Promise(resolve => setTimeout(resolve, 1500));
          payload = await window.loadGoogleSheetScope(
            'summary-capex',
            { force: true, timeoutMs: 180000 }
          );
        }
      } else {
        // Compatibility fallback for older app.js versions.
        const url = getApiUrl();
        if (!url) {
          throw new Error('Google Apps Script URL is not configured.');
        }
        const separator = url.includes('?') ? '&' : '?';
        payload = await jsonp(
          url + separator + 'scope=summary-capex'
        );
      }

      mergeSharedPayload(payload);

      if (!applyCapexPayload(payload) &&
          !applyCapexPayload(window.GOOGLE_SHEET_RAW_PAYLOAD)) {
        throw new Error(
          'The Capex Summary sheet was not returned by Google Apps Script.'
        );
      }

      return true;
    } catch (error) {
      if (root) {
        root.innerHTML =
          '<div class="empty">Could not load Capex Summary: ' +
          esc(error && error.message ? error.message : String(error)) +
          '</div>';
      }
      console.error('[CAPEX_MODULE]', error);
      return false;
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Refresh CAPEX';
      }
    }
  }

  function wrapMainRefresh() {
    if (MODULE.refreshWrapped ||
        typeof window.refreshFromGoogleSheet !== 'function') return false;

    const original = window.refreshFromGoogleSheet;
    window.refreshFromGoogleSheet = async function () {
      const result = await original.apply(this, arguments);

      // The main refresh already loads summary-capex. Re-render from the
      // shared payload instead of starting a competing endpoint request.
      applyCapexPayload(window.GOOGLE_SHEET_RAW_PAYLOAD);
      return result;
    };

    MODULE.refreshWrapped = true;
    return true;
  }

  function boot() {
    injectUi();
    render();

    const timer = setInterval(() => {
      injectUi();
      if (wrapMainRefresh()) clearInterval(timer);
    }, 250);

    setTimeout(() => clearInterval(timer), 15000);

    window.addEventListener('googleSheetPayloadReady', function (event) {
      applyCapexPayload(
        event && event.detail
          ? event.detail
          : window.GOOGLE_SHEET_RAW_PAYLOAD
      );
    });

    setTimeout(() => {
      if (!applyCapexPayload(window.GOOGLE_SHEET_RAW_PAYLOAD)) {
        const root = byId('capexRoot');
        if (root) {
          root.innerHTML =
            '<div class="empty">Click <strong>Refresh Google Sheet</strong> ' +
            'or <strong>Refresh CAPEX</strong> to load Capex Summary.</div>';
        }
      }
    }, 600);
  }

  MODULE.refresh = refresh;
  MODULE.render = render;
  window.CAPEX_MODULE = MODULE;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();