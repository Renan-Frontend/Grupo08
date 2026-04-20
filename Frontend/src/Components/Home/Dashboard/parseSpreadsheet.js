import * as XLSX from 'xlsx';

/**
 * Reads a File (.csv, .xlsx, .xls) and returns raw row objects
 * with the original spreadsheet headers as keys.
 *
 * @param {File} file
 * @returns {Promise<Object[]>}
 */
export function parseSpreadsheetRaw(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (!rawRows.length) {
          reject(new Error('Planilha vazia ou sem dados.'));
          return;
        }
        resolve(rawRows);
      } catch (err) {
        reject(new Error('Erro ao ler o arquivo: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Splits a single sheet's raw row-array data into multiple logical tables
 * when they are stacked vertically, separated by blank rows or title rows.
 *
 * @param {Array<Array>} rawArray  - 2D array from sheet_to_json(header:1)
 * @param {string} fallbackName    - sheet name to use as prefix
 * @param {Array<Array>} [fmtArray]  - 2D array with formatted (display) strings (raw:false)
 * @returns {Array<{sheetName: string, headers: string[], rows: Object[], fmtRows?: Object[]}>}
 */
function splitStackedTables(rawArray, fallbackName, fmtArray) {
  const tables = [];
  let currentTitle = null;
  let currentHeaders = null;
  let currentRows = [];
  let currentFmtRows = [];
  let sharedHeaders = null; // headers reused across section splits

  const isBlankRow = (row) =>
    !row || row.length === 0 || row.every((cell) => cell === '' || cell == null);

  const isTitleRow = (row) => {
    if (!row || row.length === 0) return false;
    // A title row has exactly 1 non-empty cell (or very few) and no numeric data
    const nonEmpty = row.filter((cell) => cell !== '' && cell != null);
    if (nonEmpty.length === 0) return false;
    if (nonEmpty.length > 2) return false;
    // Title is typically a single text string
    return nonEmpty.every((cell) => typeof cell === 'string' && cell.trim().length > 0);
  };

  // Detect if a row is a section header inside an existing table:
  // has headers set, row has very few non-empty cells compared to the header count
  const isSectionHeader = (row) => {
    if (!currentHeaders || currentHeaders.length < 3) return false;
    if (!row || row.length === 0) return false;
    const nonEmpty = row.filter((cell) => cell !== '' && cell != null);
    if (nonEmpty.length === 0 || nonEmpty.length > 2) return false;
    // The non-empty cells must be text, not numbers
    if (!nonEmpty.every((cell) => typeof cell === 'string' && cell.trim().length > 0)) return false;
    // Must have significantly fewer filled cells than headers (e.g., 1-2 vs 10+)
    return nonEmpty.length <= 2 && currentHeaders.length >= 4;
  };

  const flushTable = () => {
    if (currentHeaders && currentRows.length > 0) {
      const name = currentTitle || `${fallbackName} ${tables.length + 1}`;
      const rowObjects = currentRows.map((row) => {
        const obj = {};
        currentHeaders.forEach((h, i) => {
          obj[h] = row[i] !== undefined ? row[i] : '';
        });
        return obj;
      });
      const fmtRowObjects = fmtArray ? currentFmtRows.map((row) => {
        const obj = {};
        currentHeaders.forEach((h, i) => {
          obj[h] = row[i] !== undefined ? row[i] : '';
        });
        return obj;
      }) : undefined;
      tables.push({
        sheetName: name,
        headers: [...currentHeaders],
        rows: rowObjects,
        fmtRows: fmtRowObjects,
      });
    }
    currentTitle = null;
    currentRows = [];
    currentFmtRows = [];
    // Don't reset currentHeaders here — it may be reused via sharedHeaders
  };

  for (let i = 0; i < rawArray.length; i++) {
    const row = rawArray[i];

    if (isBlankRow(row)) {
      // Blank row = potential table separator
      if (currentHeaders && currentRows.length > 0) {
        sharedHeaders = null; // blank-row separated = different tables, don't share headers
        flushTable();
        currentHeaders = null;
      }
      continue;
    }

    // Check for section header WITHIN an existing table (like "OPERAÇÃO", "COMERCIAL")
    if (currentHeaders && isSectionHeader(row)) {
      // Save shared headers before flushing
      sharedHeaders = currentHeaders;
      flushTable();
      // Keep headers for next section
      currentHeaders = sharedHeaders;
      const nonEmpty = row.filter((cell) => cell !== '' && cell != null);
      currentTitle = String(nonEmpty[0]).trim();
      console.log('[splitStackedTables] Detected section header:', currentTitle, 'at row', i);
      continue;
    }

    if (!currentHeaders && isTitleRow(row)) {
      // This is a table title like "Operação"
      const nonEmpty = row.filter((cell) => cell !== '' && cell != null);
      currentTitle = String(nonEmpty[0]).trim();
      console.log('[splitStackedTables] Detected title row:', currentTitle, 'at row', i);
      continue;
    }

    if (!currentHeaders) {
      // This row becomes the headers
      currentHeaders = row.map((cell, idx) => {
        const val = String(cell ?? '').trim();
        return val || `Col${idx + 1}`;
      });
      continue;
    }

    // Data row
    currentRows.push(row);
    if (fmtArray) currentFmtRows.push(fmtArray[i] || []);
  }

  // Flush last table
  flushTable();

  console.log('[splitStackedTables] Result:', tables.length, 'tables:', tables.map(t => `${t.sheetName} (${t.rows.length} rows, headers: ${t.headers.slice(0,5).join(', ')}...)`));
  return tables;
}

/**
 * Reads ALL sheets from a File (.csv, .xlsx, .xls) and returns one entry per sheet.
 * If a single sheet contains multiple tables stacked vertically (separated by blank rows),
 * they are automatically split into separate entries.
 * Each entry: { sheetName: string, headers: string[], rows: Object[] }
 *
 * @param {File} file
 * @returns {Promise<Array<{sheetName: string, headers: string[], rows: Object[]}>>}
 */
export function parseAllSheets(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const result = [];
        for (const name of workbook.SheetNames) {
          const sheet = workbook.Sheets[name];

          // First try normal parsing
          const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
          if (!rows.length) continue;

          // Detect if this sheet has multiple stacked tables:
          // Read as raw 2D array and try to split by blank rows or section headers
          const rawArray = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
          // Also read formatted (display) values for lossless round-trip ("76%" stays "76%", "3,2" stays "3,2")
          const fmtArray = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });

          // Always try splitting if sheet has enough rows
          if (rawArray.length > 5) {
            const subTables = splitStackedTables(rawArray, name, fmtArray);
            if (subTables.length > 1) {
              result.push(...subTables);
              continue;
            }
          }

          // Single table in this sheet — also include formatted rows
          const fmtRows = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' });
          result.push({
            sheetName: name,
            headers: Object.keys(rows[0]),
            rows,
            fmtRows,
            rawRows: rawArray,
          });
        }
        if (!result.length) {
          reject(new Error('Planilha vazia ou sem dados.'));
          return;
        }
        resolve(result);
      } catch (err) {
        reject(new Error('Erro ao ler o arquivo: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Reads a File (.csv, .xlsx, .xls) and returns an array of row objects
 * mapped to the given widget columns.
 *
 * @param {File} file
 * @param {Array<{key: string, label: string, type: string}>} columns
 * @returns {Promise<Object[]>}
 */
export function parseSpreadsheet(file, columns) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (!rawRows.length) {
          reject(new Error('Planilha vazia ou sem dados.'));
          return;
        }

        // Build a map from spreadsheet header → column key
        // Tries exact match, then case-insensitive, then partial match
        const sheetHeaders = Object.keys(rawRows[0]);
        const headerMap = {};

        columns.forEach((col) => {
          // Try exact label match
          let match = sheetHeaders.find((h) => h === col.label);
          // Case-insensitive
          if (!match) match = sheetHeaders.find(
            (h) => h.toLowerCase() === col.label.toLowerCase()
          );
          // Try matching key directly
          if (!match) match = sheetHeaders.find(
            (h) => h.toLowerCase() === col.key.toLowerCase()
          );
          // Partial: header contains label word
          if (!match) match = sheetHeaders.find(
            (h) => h.toLowerCase().includes(col.label.toLowerCase())
          );
          if (match) headerMap[match] = col;
        });

        const mapped = rawRows.map((raw) => {
          const row = {};
          Object.entries(raw).forEach(([header, value]) => {
            const col = headerMap[header];
            if (!col) return;
            if (col.type === 'number' || col.type === 'currency') {
              row[col.key] = Number(String(value).replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;
            } else if (col.type === 'boolean') {
              row[col.key] = String(value).toLowerCase() !== 'false' && value !== 0 && value !== '';
            } else {
              row[col.key] = String(value);
            }
          });
          // Fill missing columns with defaults
          columns.forEach((col) => {
            if (!(col.key in row)) {
              if (col.type === 'number' || col.type === 'currency') row[col.key] = 0;
              else if (col.type === 'boolean') row[col.key] = true;
              else row[col.key] = '';
            }
          });
          return row;
        });

        resolve(mapped);
      } catch (err) {
        reject(new Error('Erro ao ler o arquivo: ' + err.message));
      }
    };

    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.readAsArrayBuffer(file);
  });
}

/* ── Smart widget detection ─────────────────────────────────────────── */

const WIDGET_SCHEMAS = {
  kpiTable: { keys: ['name', 'meta', 'tendencia', 'media'], labels: ['indicador', 'meta', 'tendência', 'tendencia', 'média', 'media'] },
  revenue: { keys: ['mes', 'valor'], labels: ['mês', 'valor', 'receita', 'faturamento'] },
  sales: { keys: ['mes', 'vendas', 'clientes'], labels: ['mês', 'vendas', 'clientes', 'quantidade'] },
  expenses: { keys: ['mes', 'fixas', 'variaveis'], labels: ['mês', 'fixas', 'variáveis', 'despesas', 'custos'] },
  conversions: { keys: ['mes', 'taxa'], labels: ['mês', 'taxa', 'conversão', '%'] },
  metrics: { keys: ['label', 'value'], labels: ['indicador', 'valor', 'kpi', 'métrica', 'meta'] },
  tasks: { keys: ['status', 'valor'], labels: ['status', 'tarefa', 'quantidade', 'qtd'] },
  pipeline: { keys: ['etapa', 'leads', 'valor'], labels: ['etapa', 'leads', 'funil', 'oportunidade'] },
};

const SHEET_NAME_HINTS = {
  operac: ['kpiTable', 'expenses', 'tasks', 'metrics'],
  comercial: ['kpiTable', 'sales', 'pipeline', 'revenue'],
  financ: ['kpiTable', 'revenue', 'expenses', 'conversions'],
  vendas: ['sales', 'pipeline'],
  receita: ['revenue'],
  faturamento: ['revenue'],
  despesa: ['expenses'],
  custo: ['expenses'],
  tarefa: ['tasks'],
  pipeline: ['pipeline'],
  funil: ['pipeline'],
  kpi: ['metrics'],
  indicador: ['metrics'],
  meta: ['metrics'],
};

const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

function scoreWidget(widgetId, headers, sheetName) {
  const schema = WIDGET_SCHEMAS[widgetId];
  if (!schema) return 0;
  const headersNorm = headers.map(norm);
  const sheetNorm = norm(sheetName);

  let score = 0;

  // Special detection for kpiTable: INDICADOR + META + many date/month columns
  if (widgetId === 'kpiTable') {
    const hasIndicador = headersNorm.some((h) => h.includes('indicador') || h === 'nome' || h === 'kpi');
    const hasMeta = headersNorm.some((h) => h === 'meta');
    const hasTendencia = headersNorm.some((h) => h.includes('tendencia') || h.includes('tendência') || h.includes('tend'));
    const hasMedia = headersNorm.some((h) => h === 'media' || h === 'média');
    const dateColCount = headers.filter((h) => {
      const s = String(h).trim();
      // Match date patterns: May-23, jul/25, 2023-05-01, Excel serial (4-5 digit number), M/D/YYYY, etc.
      if (/\d{4}[-/]\d{2}/.test(s) || /^[a-zA-Z\u00c0-\u00fa]{3,}[-/\s]\d{2,4}$/i.test(s)
          || /^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{4,5}(\.\d+)?$/.test(s)
          || /^\d{2}[-/]\d{4}$/.test(s) || /^\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}$/.test(s)) return true;
      // Fallback: try JS Date.parse
      const d = new Date(s);
      return !isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100;
    }).length;
    if (hasIndicador && hasMeta && dateColCount >= 3) {
      score += 20; // Very strong match
    } else if ((hasIndicador || hasMeta) && dateColCount >= 3) {
      score += 12;
    } else if (dateColCount >= 6 && headers.length > 10) {
      score += 8;
    }
    // Bonus for having tendência and/or média columns
    if (hasTendencia) score += 3;
    if (hasMedia) score += 3;
  }

  // Match headers against widget labels/keys
  schema.labels.forEach((label) => {
    const labelNorm = norm(label);
    if (headersNorm.some((h) => h === labelNorm || h.includes(labelNorm) || labelNorm.includes(h))) {
      score += 3;
    }
  });
  schema.keys.forEach((key) => {
    const keyNorm = norm(key);
    if (headersNorm.some((h) => h === keyNorm || h.includes(keyNorm))) {
      score += 2;
    }
  });

  // Boost from sheet name
  for (const [hint, preferredWidgets] of Object.entries(SHEET_NAME_HINTS)) {
    if (sheetNorm.includes(hint) && preferredWidgets.includes(widgetId)) {
      score += 5;
    }
  }

  return score;
}

function buildAutoColumnMapping(headers, widgetId) {
  const schema = WIDGET_SCHEMAS[widgetId];
  if (!schema) return {};
  const mapping = {};
  const headersNorm = headers.map(norm);

  schema.keys.forEach((key, i) => {
    const label = schema.labels[i] || key;
    const keyNorm = norm(key);
    const labelNorm = norm(label);

    let match = headers.find((h, idx) => headersNorm[idx] === keyNorm);
    if (!match) match = headers.find((h, idx) => headersNorm[idx] === labelNorm);
    if (!match) match = headers.find((h, idx) =>
      headersNorm[idx].includes(keyNorm) || keyNorm.includes(headersNorm[idx]),
    );
    if (!match) match = headers.find((h, idx) =>
      headersNorm[idx].includes(labelNorm) || labelNorm.includes(headersNorm[idx]),
    );
    if (match) mapping[match] = key;
  });

  // If we matched fewer keys than schema requires and sheet has at least 2 columns,
  // try positional mapping: first col = first key, next numeric cols = numeric keys
  if (Object.keys(mapping).length < 2 && headers.length >= 2) {
    const numericKeys = schema.keys.filter(
      (k, i) => !['text'].includes(getSchemaKeyType(widgetId, k)),
    );
    const textKeys = schema.keys.filter(
      (k) => getSchemaKeyType(widgetId, k) === 'text',
    );
    if (textKeys[0] && !mapping[headers[0]]) {
      mapping[headers[0]] = textKeys[0];
    }
    let ni = 0;
    for (let hi = 1; hi < headers.length && ni < numericKeys.length; hi++) {
      if (!Object.values(mapping).includes(numericKeys[ni])) {
        mapping[headers[hi]] = numericKeys[ni];
      }
      ni++;
    }
  }

  return mapping;
}

function getSchemaKeyType(widgetId, key) {
  const TYPES = {
    revenue: { mes: 'text', valor: 'number' },
    sales: { mes: 'text', vendas: 'number', clientes: 'number' },
    expenses: { mes: 'text', fixas: 'number', variaveis: 'number' },
    conversions: { mes: 'text', taxa: 'number' },
    metrics: { icon: 'text', label: 'text', value: 'text', change: 'text', up: 'boolean' },
    tasks: { icon: 'text', status: 'text', valor: 'number' },
    pipeline: { etapa: 'text', leads: 'number', valor: 'number' },
  };
  return TYPES[widgetId]?.[key] || 'text';
}

/**
 * Auto-detect widget types for multiple sheets,
 * ensuring no two sheets get the same widget type.
 *
 * @param {Array<{sheetName: string, headers: string[], rows: Object[]}>} sheets
 * @returns {{ dashboardName: string, sheets: Array<{sheetName: string, widget: string|null, columnMapping: Object}> }}
 */
export function detectWidgetsForSheets(sheets) {
  const allWidgetIds = Object.keys(WIDGET_SCHEMAS);
  const used = new Set();

  // Score each sheet against each widget
  const sheetScores = sheets.map((s) => {
    const scores = {};
    allWidgetIds.forEach((wid) => {
      scores[wid] = scoreWidget(wid, s.headers, s.sheetName);
    });
    return { ...s, scores };
  });

  // Assign widget types greedily: pick best score, avoid duplicates
  const result = sheetScores.map(() => null);

  // Sort sheets by their max score descending (most confident first)
  const order = sheetScores
    .map((s, i) => ({ index: i, maxScore: Math.max(...Object.values(s.scores)) }))
    .sort((a, b) => b.maxScore - a.maxScore);

  for (const { index } of order) {
    const s = sheetScores[index];
    // Pick best unused widget (kpiTable can be shared across sheets)
    let bestWidget = null;
    let bestScore = 0;
    for (const wid of allWidgetIds) {
      if (used.has(wid) && wid !== 'kpiTable') continue;
      if (s.scores[wid] > bestScore) {
        bestScore = s.scores[wid];
        bestWidget = wid;
      }
    }

    // Fallback: if no score > 0, pick any unused widget that can show tabular data
    if (!bestWidget) {
      const fallbacks = ['revenue', 'sales', 'expenses', 'metrics', 'conversions'];
      bestWidget = fallbacks.find((w) => !used.has(w)) || null;
    }

    if (bestWidget) {
      used.add(bestWidget);
      result[index] = {
        sheetName: s.sheetName,
        widget: bestWidget,
        columnMapping: buildAutoColumnMapping(s.headers, bestWidget),
      };
    } else {
      result[index] = { sheetName: s.sheetName, widget: null, columnMapping: {} };
    }
  }

  return {
    dashboardName: 'Dashboard Importado',
    sheets: result,
  };
}
