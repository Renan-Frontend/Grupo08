import XLSX from 'xlsx-js-style';
import JSZip from 'jszip';

/* ── Freeze panes helper (xlsx-js-style CE doesn't support writing freeze panes) ── */
/**
 * Patches an XLSX ArrayBuffer to inject freeze panes into the first sheet.
 * @param {ArrayBuffer} wbout  – XLSX file as ArrayBuffer from XLSX.write
 * @param {number} xSplit      – number of columns to freeze (left)
 * @param {number} ySplit      – number of rows to freeze (top)
 * @returns {Promise<ArrayBuffer>}
 */
async function injectFreezePanes(wbout, xSplit, ySplit) {
  const zip = await JSZip.loadAsync(wbout);
  const sheetPath = 'xl/worksheets/sheet1.xml';
  const sheetFile = zip.file(sheetPath);
  if (!sheetFile) return wbout;

  let xml = await sheetFile.async('string');

  // Build the <pane> element for freeze
  const topLeftCell = XLSX.utils.encode_cell({ r: ySplit, c: xSplit }); // e.g. "D2"
  const paneXml = `<pane xSplit="${xSplit}" ySplit="${ySplit}" topLeftCell="${topLeftCell}" activePane="bottomRight" state="frozen"/>`;

  // Inject into <sheetViews><sheetView ...>
  if (xml.includes('<sheetView')) {
    // Insert pane as first child of <sheetView>
    xml = xml.replace(/<sheetView([^>]*)\/>/, `<sheetView$1>${paneXml}</sheetView>`);
    // If sheetView is not self-closing
    xml = xml.replace(/<sheetView([^>]*)>(?!.*<pane)/, `<sheetView$1>${paneXml}`);
  }

  zip.file(sheetPath, xml);
  return zip.generateAsync({ type: 'arraybuffer' });
}

/* ── Color constants (from modelo Excel) ── */
const HEADER_BG   = 'BDD7EE'; // light blue (theme 4 + tint 0.8)
const SECTION_BG  = '548235'; // dark green for section rows (like OPERAÇÃO, COMERCIAL)
const EMPTY_BG    = 'D9D9D9'; // gray for empty cells
const ZEBRA_BG    = 'F2F2F2'; // very light gray for alternating rows
const GREEN_FG    = '00B050'; // green text for values meeting meta
const RED_FG      = 'FF0000'; // red text for values below meta
const DARK_FG     = '000000'; // black text
const WHITE_FG    = 'FFFFFF';
const BORDER_CLR  = 'B4C6E7'; // light blue border

const thinBorder = {
  top:    { style: 'thin', color: { rgb: BORDER_CLR } },
  bottom: { style: 'thin', color: { rgb: BORDER_CLR } },
  left:   { style: 'thin', color: { rgb: BORDER_CLR } },
  right:  { style: 'thin', color: { rgb: BORDER_CLR } },
};

/**
 * Build styled xlsx and trigger download.
 *
 * @param {Array<Array<any>>} data
 * @param {string}            filename
 * @param {string}            [sheetName]
 * @param {object}            [opts]
 * @param {Set<number>}       [opts.sectionRows]   – row indices (0-based) that are section headers
 * @param {number}            [opts.metaCol]        – column index of META for conditional coloring
 * @param {number}            [opts.dataStartCol]   – first monthly-data column index
 * @param {number}            [opts.dataEndCol]     – last monthly-data column index (exclusive)
 */
export async function downloadXlsx(data, filename, sheetName = 'Dados', opts = {}) {
  const ws = XLSX.utils.aoa_to_sheet(data);
  const colCount = data.reduce((max, row) => Math.max(max, row.length), 0);
  const rowCount = data.length;

  // ── Auto-fit column widths ──
  const sectionRowsSet = opts.sectionRows || new Set();
  const colWidths = [];
  for (let c = 0; c < colCount; c++) {
    let maxLen = 8;
    for (let r = 0; r < data.length; r++) {
      // Skip section header rows for column width (they span across columns)
      if (sectionRowsSet.has(r)) continue;
      const cell = data[r][c];
      if (cell !== null && cell !== undefined) {
        const len = String(cell).length;
        if (len > maxLen) maxLen = len;
      }
    }
    colWidths.push({ wch: Math.min(maxLen + 4, c === 0 ? 120 : 60) });
  }
  ws['!cols'] = colWidths;

  const sectionRows = opts.sectionRows || new Set();
  const metaCol     = opts.metaCol ?? -1;
  const dataStartCol = opts.dataStartCol ?? -1;
  const dataEndCol   = opts.dataEndCol ?? -1;

  // ── Apply styles per cell ──
  let dataRowIdx = 0; // counter for zebra striping

  for (let R = 0; R < rowCount; R++) {
    const isHeader    = R === 0;
    const isSection   = sectionRows.has(R);
    const isBlank     = !data[R] || data[R].length === 0 || data[R].every(v => v === '' || v == null);

    if (!isHeader && !isSection && !isBlank) dataRowIdx++;

    // Get meta value for conditional coloring
    let metaVal = null;
    if (metaCol >= 0 && !isHeader && !isSection && !isBlank) {
      const mv = data[R]?.[metaCol];
      if (typeof mv === 'number') metaVal = mv;
      else if (typeof mv === 'string') {
        const pctM = mv.match(/^(-?[\d.,]+)\s*%$/);
        const n = pctM ? Number(pctM[1].replace(',', '.')) : Number(String(mv).replace(',', '.'));
        if (!isNaN(n) && mv !== '' && mv !== 'definir') metaVal = n;
      }
    }

    for (let C = 0; C < colCount; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      const cell = ws[addr];

      if (isHeader) {
        cell.s = {
          font: { bold: true, sz: 14, color: { rgb: DARK_FG } },
          fill: { fgColor: { rgb: HEADER_BG } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: false },
          border: thinBorder,
        };
      } else if (isSection) {
        cell.s = {
          font: { bold: true, sz: 14, color: { rgb: DARK_FG } },
          fill: { fgColor: { rgb: EMPTY_BG } },
          alignment: { horizontal: C === 0 ? 'left' : 'center', vertical: 'center' },
          border: thinBorder,
        };
      } else if (isBlank) {
        // leave blank rows unstyled
      } else {
        // Data row
        const isZebra = dataRowIdx % 2 === 0;
        const cellValue = data[R]?.[C];
        const isEmpty = cellValue === '' || cellValue === null || cellValue === undefined;

        // Determine font color for monthly data cells + Média column
        let fontColor = DARK_FG;
        if (metaVal !== null && dataStartCol >= 0 && C >= dataStartCol && C <= dataEndCol && !isEmpty) {
          let numVal = null;
          if (typeof cellValue === 'number') numVal = cellValue;
          else if (typeof cellValue === 'string') {
            const pctC = cellValue.match(/^(-?[\d.,]+)\s*%$/);
            numVal = pctC ? Number(pctC[1].replace(',', '.')) : Number(cellValue.replace(',', '.'));
            if (isNaN(numVal)) numVal = null;
          }
          if (numVal !== null) {
            fontColor = numVal >= metaVal ? GREEN_FG : RED_FG;
          }
        }

        {
          cell.s = {
            font: {
              bold: C === metaCol,
              sz: 12,
              color: { rgb: fontColor },
            },
            fill: undefined,
            alignment: {
              horizontal: C === 0 ? 'left' : 'center',
              vertical: 'center',
            },
            border: thinBorder,
          };
        }
      }
    }
  }

  // Section rows: no merge — title only in column A

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // xlsx-js-style CE does NOT support writing freeze panes natively.
  // Patch the generated XLSX zip to inject <pane> inside <sheetViews>.
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const patched = await injectFreezePanes(wbout, 3, 1); // freeze 3 cols + 1 row
  const blob = new Blob([patched], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

/**
 * Export a full dashboard as styled xlsx (same modelo as the dashboard view export).
 * @param {{ widgets: string[], chartData: object, name: string }} dashboard
 */
export async function exportDashboardXlsx({ widgets = [], chartData = {}, name = 'Dashboard' }) {
  const data = [];
  const sectionRows = new Set();

  const MONTH_MAP = { Jan: 0, Fev: 1, Mar: 2, Abr: 3, Mai: 4, Jun: 5, Jul: 6, Ago: 7, Set: 8, Out: 9, Nov: 10, Dez: 11 };
  const allMonths = new Set();

  if (chartData.kpiTable?.length) {
    chartData.kpiTable.forEach((r) => {
      if (r.months) Object.keys(r.months).forEach((k) => allMonths.add(k));
    });
  }

  const monthlyWidgets = [
    { key: 'revenue', mesKey: 'mes', valueKeys: [{ key: 'valor', label: 'Faturamento (R$)' }] },
    { key: 'sales', mesKey: 'mes', valueKeys: [{ key: 'vendas', label: 'Vendas' }, { key: 'clientes', label: 'Clientes' }] },
    { key: 'conversions', mesKey: 'mes', valueKeys: [{ key: 'taxa', label: 'Taxa de Conversão (%)' }] },
    { key: 'expenses', mesKey: 'mes', valueKeys: [{ key: 'fixas', label: 'Despesas Fixas (R$)' }, { key: 'variaveis', label: 'Despesas Variáveis (R$)' }] },
  ];
  for (const mw of monthlyWidgets) {
    if (chartData[mw.key]?.length) {
      chartData[mw.key].forEach((i) => { if (i[mw.mesKey]) allMonths.add(i[mw.mesKey]); });
    }
  }

  const allMonthKeys = [...allMonths].sort((a, b) => {
    const pa = a.match(/^(\w{3})\/(\d{2,4})$/);
    const pb = b.match(/^(\w{3})\/(\d{2,4})$/);
    if (pa && pb) {
      const ya = Number(pa[2]) < 100 ? Number(pa[2]) + 2000 : Number(pa[2]);
      const yb = Number(pb[2]) < 100 ? Number(pb[2]) + 2000 : Number(pb[2]);
      return ya !== yb ? ya - yb : (MONTH_MAP[pa[1]] ?? 0) - (MONTH_MAP[pb[1]] ?? 0);
    }
    return a.localeCompare(b);
  });

  // ── Collect raw values per month to filter empty months ──
  const monthHasData = {};
  allMonthKeys.forEach((k) => { monthHasData[k] = false; });

  const collectMonthData = (monthValues) => {
    if (!monthValues) return;
    for (const k of allMonthKeys) {
      const v = monthValues[k];
      if (v !== null && v !== undefined && v !== '') monthHasData[k] = true;
    }
  };

  // Scan kpiTable
  if (widgets.includes('kpiTable') && chartData.kpiTable?.length) {
    for (const row of chartData.kpiTable) collectMonthData(row.months);
  }
  // Scan monthly widgets
  for (const mw of monthlyWidgets) {
    if (!widgets.includes(mw.key) || !chartData[mw.key]?.length) continue;
    for (const item of chartData[mw.key]) {
      const m = item[mw.mesKey || 'mes'];
      if (m && monthHasData[m] !== undefined) {
        for (const vk of mw.valueKeys) {
          if (item[vk.key] !== null && item[vk.key] !== undefined && item[vk.key] !== '') {
            monthHasData[m] = true;
          }
        }
      }
    }
  }

  // Only keep months that have at least one value
  const monthKeys = allMonthKeys.filter((k) => monthHasData[k]);

  const metaCol = 1;
  const dataStartCol = 3;
  const dataEndCol = 3 + monthKeys.length;

  // ── Format helper: format based on metaType config ──
  // Converts decimals (abs ≤ 10, i.e. up to 1000%) to percentage when isPct.
  // Larger numbers (raw counts in mixed rows) stay as rounded integers.
  const fmtVal = (v, isPct) => {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'string') {
      if (v === 'definir') return v;
      const n = Number(v.replace(',', '.'));
      if (isNaN(n)) return v;
      v = n;
    }
    if (typeof v !== 'number') return v;
    if (isPct && Math.abs(v) <= 10) {
      const pct = (v * 100);
      return `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(2)}%`;
    }
    // Common numbers: round to nearest integer (no decimals)
    return Math.round(v);
  };

  data.push(['INDICADOR', 'META', 'TENDÊNCIA', ...monthKeys, 'Média']);

  const addRow = (label, meta, tendencia, monthValues, media, isPct, monthsRaw, metaRaw, mediaRaw) => {
    const vals = monthKeys.map((k) => {
      // Prefer raw import value for lossless round-trip
      if (monthsRaw && monthsRaw[k] !== undefined && monthsRaw[k] !== null) {
        return monthsRaw[k];
      }
      const v = monthValues?.[k];
      return v !== null && v !== undefined ? fmtVal(v, isPct) : '';
    });
    // Use raw meta if available (preserves "76%", "3,2", "definir", etc.)
    const metaDisplay = metaRaw !== undefined && metaRaw !== null && metaRaw !== '' ? metaRaw : fmtVal(meta, isPct);
    // Use raw media if available (preserves "14,90%", "3,2", etc.)
    const mediaDisplay = mediaRaw !== undefined && mediaRaw !== null && mediaRaw !== '' ? mediaRaw : fmtVal(media, isPct);
    data.push([label || '', metaDisplay, tendencia || '', ...vals, mediaDisplay]);
  };

  if (widgets.includes('kpiTable') && chartData.kpiTable?.length) {
    let lastSection = null;
    for (const row of chartData.kpiTable) {
      if (row.section && row.section !== lastSection) {
        lastSection = row.section;
        sectionRows.add(data.length);
        data.push([row.section]);
      }
      let isPct;
      if (row.metaType) {
        isPct = row.metaType === 'percent';
      } else {
        // Infer from meta value for old data without metaType
        const m = typeof row.meta === 'number' ? row.meta : null;
        isPct = m !== null && m > 0 && m <= 1;
      }
      addRow(row.name, row.meta, row.tendencia, row.months || {}, row.media, isPct, row.monthsRaw, row.metaRaw, row.mediaRaw);
    }
  }

  const mwSections = [
    { key: 'revenue', title: 'FATURAMENTO', valueKeys: [{ key: 'valor', label: 'Faturamento (R$)' }] },
    { key: 'sales', title: 'VENDAS E CLIENTES', valueKeys: [{ key: 'vendas', label: 'Vendas' }, { key: 'clientes', label: 'Clientes' }] },
    { key: 'conversions', title: 'TAXA DE CONVERSÃO', valueKeys: [{ key: 'taxa', label: 'Taxa de Conversão (%)' }] },
    { key: 'expenses', title: 'DESPESAS', valueKeys: [{ key: 'fixas', label: 'Despesas Fixas (R$)' }, { key: 'variaveis', label: 'Despesas Variáveis (R$)' }] },
  ];
  for (const { key, title, valueKeys } of mwSections) {
    if (!widgets.includes(key) || !chartData[key]?.length) continue;
    sectionRows.add(data.length);
    data.push([title]);
    for (const vk of valueKeys) {
      const monthVals = {};
      chartData[key].forEach((i) => { if (i.mes) monthVals[i.mes] = i[vk.key]; });
      const nums = Object.values(monthVals).filter((v) => typeof v === 'number');
      const avg = nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : '';
      addRow(vk.label, '', '', monthVals, avg);
    }
  }

  const nonMonthly = [
    { key: 'metrics', title: 'MÉTRICAS KPI', rows: () => (chartData.metrics || []).map((i) => [i.label || '', i.value || '', i.change || '', ...monthKeys.map(() => ''), i.up ? '↑' : '↓']) },
    { key: 'tasks', title: 'TAREFAS', rows: () => (chartData.tasks || []).map((i) => [i.status || '', i.valor ?? '', '', ...monthKeys.map(() => ''), '']) },
    { key: 'pipeline', title: 'PIPELINE DE VENDAS', rows: () => (chartData.pipeline || []).map((i) => [i.etapa || '', i.leads ?? '', i.valor ?? '', ...monthKeys.map(() => ''), '']) },
  ];
  for (const { key, title, rows } of nonMonthly) {
    if (!widgets.includes(key) || !chartData[key]?.length) continue;
    sectionRows.add(data.length);
    data.push([title]);
    for (const r of rows()) data.push(r);
  }

  const safeName = name.replace(/[^a-zA-Z0-9À-ÿ _-]/g, '') || 'Dashboard';
  await downloadXlsx(data, `${safeName}.xlsx`, safeName.slice(0, 31), {
    sectionRows,
    metaCol,
    dataStartCol,
    dataEndCol,
  });
}
export function downloadXlsxTable(data, filename, sheetName = 'Dados') {
  const ws = XLSX.utils.aoa_to_sheet(data);
  const colCount = data.reduce((max, row) => Math.max(max, row.length), 0);

  const colWidths = [];
  for (let c = 0; c < colCount; c++) {
    let maxLen = 8;
    for (const row of data) {
      const cell = row[c];
      if (cell !== null && cell !== undefined) {
        const len = String(cell).length;
        if (len > maxLen) maxLen = len;
      }
    }
    colWidths.push({ wch: Math.min(maxLen + 3, 60) });
  }
  ws['!cols'] = colWidths;

  for (let R = 0; R < data.length; R++) {
    const isHeader = R === 0;
    const isZebra = !isHeader && R % 2 === 0;
    for (let C = 0; C < colCount; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      const cell = ws[addr];

      if (isHeader) {
        cell.s = {
          font: { bold: true, sz: 14, color: { rgb: DARK_FG } },
          fill: { fgColor: { rgb: HEADER_BG } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: thinBorder,
        };
      } else {
        cell.s = {
          font: { sz: 12, color: { rgb: DARK_FG } },
          fill: isZebra ? { fgColor: { rgb: ZEBRA_BG } } : undefined,
          alignment: {
            horizontal: 'center',
            vertical: 'center',
          },
          border: thinBorder,
        };
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}
