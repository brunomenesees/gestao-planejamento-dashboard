// gmud-relatorio.js
// Página dedicada ao relatório de GMUD (somente Resolvidos, com GMUD, Categoria=Projetos)

// Configurações
const GMUD_CF_ID = 71; // Numero_GMUD
const PREVISAO_ETAPA_CF_ID = 72; // previsao_etapa
const ORDEM_PLNJ_CF_ID = 50; // referência existente
const SQUAD_CF_ID = 49; // referência existente

// Filtro fixo: Categoria=Projetos (reutiliza filterId usado no dashboard)
const FILTER_ID_PROJETOS = 1477;

function getCustomFieldValueFromIssue(issue, fieldId) {
  const cf = (issue.custom_fields || []).find(cf => cf?.field?.id === fieldId);
  return cf ? cf.value : '';
}

function mapIssueToGMUDRow(issue) {
  return {
    numero: String(issue.id),
    titulo: issue.summary || '',
    numero_gmud: getCustomFieldValueFromIssue(issue, GMUD_CF_ID) || '',
    previsao_etapa: getCustomFieldValueFromIssue(issue, PREVISAO_ETAPA_CF_ID) || '',
    relatedIds: [],
  };
}

function isResolved(issue) {
  const name = (issue.status?.name || '').toLowerCase().trim();
  // Considerar apenas resolved/resolvido; descartar closed/fechado
  if (name === 'closed' || name === 'fechado') return false;
  return name === 'resolved' || name === 'resolvido';
}

function hasGMUD(issue) {
  const gmud = getCustomFieldValueFromIssue(issue, GMUD_CF_ID);
  return !!(gmud && String(gmud).trim());
}

async function authFetchMantis(endpoint, options = {}) {
  console.log('[GMUD] authFetchMantis called with endpoint:', endpoint, 'options:', { ...options, headers: undefined });
  if (!window.authService || !window.authService.isAuthenticated()) {
    window.location.href = '/login.html';
    return Promise.reject(new Error('Não autenticado'));
  }
  // Usa o método autenticado existente para manter consistência com o proxy /api/mantis
  return window.authService.makeAuthenticatedRequest(encodeURIComponent(endpoint), {
    ...options,
  });
}

async function fetchIssuesPage({ page = 1, pageSize = 250, filterId } = {}) {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('page_size', String(pageSize));
  // Removido filter_id para buscar geral (não aplicar filtro do Mantis)
  // Garante que os custom_fields venham no payload (necessário para CF 71/72)
  params.set('include', 'custom_fields');
  const endpoint = `issues?${params.toString()}`;
  console.log('[GMUD] Fetching page:', page, 'pageSize:', pageSize, 'filterId:', filterId || 'none', 'endpoint:', endpoint);
  const resp = await authFetchMantis(endpoint, { method: 'GET' });
  console.log('[GMUD] Page response meta:', resp ? { keys: Object.keys(resp || {}), total_results: resp.total_results, page_count: resp.page_count, received: Array.isArray(resp.issues) ? resp.issues.length : 'N/A' } : 'null');
  return resp || {};
}

async function fetchResolvedWithGMUD({ pageSize = 250 } = {}) {
  console.time('[GMUD] fetchResolvedWithGMUD');
  const MAX_PAGES = 10;
  const MAX_ITEMS = 3000;
  const seenIds = new Set();
  const all = [];

  const first = await fetchIssuesPage({ page: 1, pageSize });
  const firstItems = Array.isArray(first.issues) ? first.issues : [];
  firstItems.forEach(it => { if (!seenIds.has(it?.id)) { seenIds.add(it.id); all.push(it); } });

  const totalPagesRaw = first.page_count || first.total_pages || (first.total_results ? Math.ceil(first.total_results / pageSize) : 1);
  const totalPages = totalPagesRaw ? Math.min(totalPagesRaw, MAX_PAGES) : MAX_PAGES; // quando não há meta, buscamos até MAX_PAGES ou até faltar itens
  console.log('[GMUD] Pagination meta:', { totalPagesRaw, totalPages, firstCount: firstItems.length, accumulated: all.length });

  for (let p = 2; p <= totalPages && all.length < MAX_ITEMS; p++) {
    const r = await fetchIssuesPage({ page: p, pageSize });
    const items = Array.isArray(r.issues) ? r.issues : [];
    for (const it of items) {
      if (all.length >= MAX_ITEMS) break;
      if (!seenIds.has(it?.id)) { seenIds.add(it.id); all.push(it); }
    }
    console.log('[GMUD] Accumulated after page', p, ':', all.length, 'receivedThisPage:', items.length);
    if (items.length < pageSize) {
      console.log('[GMUD] Stopping pagination early due to short page');
      break; // sem mais páginas
    }
  }

  // Client-side filters: somente resolved/resolvido e com GMUD preenchido
  const resolvedOnly = all.filter(it => isResolved(it));
  const gmudOnly = all.filter(it => hasGMUD(it));
  const filtered = all.filter(it => isResolved(it) && hasGMUD(it));
  console.log('[GMUD] Totals:', {
    fetched: all.length,
    resolvedOnly: resolvedOnly.length,
    gmudOnly: gmudOnly.length,
    bothResolvedAndGMUD: filtered.length,
  });
  const gmudSample = gmudOnly.slice(0, 5).map(it => ({ id: it.id, status: (it.status?.name || '').toLowerCase(), gmud: getCustomFieldValueFromIssue(it, GMUD_CF_ID) }));
  console.log('[GMUD] Sample of GMUD issues (id, status, gmud):', gmudSample);
  // Mapeia para as colunas necessárias
  const mapped = filtered.map(mapIssueToGMUDRow);
  console.log('[GMUD] Mapped sample:', mapped.slice(0, 3));
  console.timeEnd('[GMUD] fetchResolvedWithGMUD');
  return mapped;
}

// Busca detalhes da issue para obter relationships
async function fetchIssueDetails(id) {
  const endpoint = `issues/${encodeURIComponent(String(id))}`;
  const resp = await authFetchMantis(endpoint, { method: 'GET' });
  return resp && Array.isArray(resp.issues) ? resp.issues[0] : null;
}

// Extrai IDs relacionados do payload de detalhe (sem hidratar as relacionadas)
function extractRelatedIdsFromDetail(detail) {
  const rels = Array.isArray(detail?.relationships) ? detail.relationships : [];
  const ids = [];
  for (const r of rels) {
    const otherId = r?.issue?.id;
    if (otherId != null) ids.push(otherId);
  }
  return ids;
}

// Enriquecedor: adiciona relatedIds às linhas, com limite de concorrência
async function enrichRowsWithRelationships(rows, { concurrency = 8, maxDetails = 1000 } = {}) {
  console.time('[GMUD] enrichRowsWithRelationships');
  const limited = rows.slice(0, maxDetails);
  let index = 0;
  const results = new Array(rows.length);

  async function worker() {
    while (true) {
      const i = index++;
      if (i >= limited.length) break;
      const row = limited[i];
      try {
        const detail = await fetchIssueDetails(row.numero);
        const relatedIds = extractRelatedIdsFromDetail(detail);
        results[i] = { ...row, relatedIds };
      } catch (e) {
        console.warn('[GMUD] Failed to fetch relationships for', row.numero, e);
        results[i] = { ...row, relatedIds: [] };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, limited.length) }, () => worker());
  await Promise.all(workers);

  // para rows além de maxDetails, copia sem relationships
  for (let i = limited.length; i < rows.length; i++) {
    results[i] = { ...rows[i], relatedIds: [] };
  }
  console.timeEnd('[GMUD] enrichRowsWithRelationships');
  return results;
}

function parseDate(value) {
  if (!value) return null;
  // Tenta parse direto
  const d1 = new Date(value);
  if (!isNaN(d1.getTime())) return d1;
  // Tenta tratar formatos dd/mm/yyyy HH:MM:ss
  const m = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const [_, dd, mm, yyyy, hh = '00', mi = '00', ss = '00'] = m;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
  }
  return null;
}

function inDateRangeBrasilia(dateValue, startDate, endDate) {
  if (!startDate && !endDate) return true;
  const d = parseDate(dateValue);
  if (!d) return false;
  // Normaliza para 00:00/23:59 na comparação de datas locais
  const dTime = d.getTime();
  if (startDate) {
    const s = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0).getTime();
    if (dTime < s) return false;
  }
  if (endDate) {
    const e = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59).getTime();
    if (dTime > e) return false;
  }
  return true;
}

function convertToBrasiliaTimeSafe(dateString) {
  try {
    if (dateString == null || String(dateString).trim() === '') return '';
    // Normaliza vários formatos possíveis
    let d = null;
    if (typeof dateString === 'number') {
      const ms = dateString < 1e12 ? dateString * 1000 : dateString; // segundos -> ms
      d = new Date(ms);
    } else {
      const s = String(dateString).trim();
      if (/^\d{10}$/.test(s)) {
        d = new Date(parseInt(s, 10) * 1000);
      } else if (/^\d{13}$/.test(s)) {
        d = new Date(parseInt(s, 10));
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        d = new Date(`${s}T00:00:00`);
      } else if (/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)$/.test(s)) {
        const mm = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)$/);
        d = new Date(`${mm[1]}T${mm[2]}`);
      } else {
        // tenta dd/mm/yyyy opcional HH:MM:SS, ou fallback para Date()
        d = parseDate(s) || new Date(s);
      }
    }
    if (!d || isNaN(d.getTime())) return String(dateString);
    return convertToBrasiliaTime(d.toISOString());
  } catch {
    return dateString || 'N/A';
  }
}

function renderSkeleton(rows = 8) {
  const tbody = document.querySelector('#tabelaGMUD tbody');
  const status = document.getElementById('gmud-status');
  if (status) status.innerHTML = '';
  tbody.innerHTML = '';
  for (let i = 0; i < rows; i++) {
    const tr = document.createElement('tr');
    for (let c = 0; c < 4; c++) {
      const td = document.createElement('td');
      td.innerHTML = '<div style="height:12px;background:linear-gradient(90deg, #eee, #f5f5f5, #eee);border-radius:6px;animation: gmud-shimmer 1.2s infinite;">&nbsp;</div>';
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

// animação de shimmer inline (fallback caso CSS não tenha keyframes)
const styleEl = document.createElement('style');
styleEl.textContent = '@keyframes gmud-shimmer {0%{background-position:-200px 0}100%{background-position:200px 0}}';
document.head.appendChild(styleEl);

function setError(message) {
  const status = document.getElementById('gmud-status');
  if (status) {
    status.innerHTML = `<div style="margin:12px 20px;padding:12px;border:1px solid var(--danger-color);border-left:4px solid var(--danger-color);border-radius:6px;background:#ffebee;color:#b71c1c">${message} <button id="gmud-retry" style="margin-left:8px">Tentar novamente</button></div>`;
    const btnRetry = document.getElementById('gmud-retry');
    btnRetry?.addEventListener('click', () => document.getElementById('btnCarregar')?.click());
  }
}

function attachSortHandlers() {
  const thead = document.querySelector('#tabelaGMUD thead');
  if (!thead) return;
  const sortState = (window.__gmudSortState = window.__gmudSortState || { key: null, dir: 'asc' });
  thead.querySelectorAll('th[data-sort]')?.forEach(th => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-sort');
      if (sortState.key === key) {
        sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
      } else {
        sortState.key = key;
        sortState.dir = 'asc';
      }
      const rows = (window.__gmudRows || []).slice();
      const factor = sortState.dir === 'asc' ? 1 : -1;
      rows.sort((a, b) => {
        if (key === 'numero') return (parseInt(a.numero) - parseInt(b.numero)) * factor;
        if (key === 'titulo') return (String(a.titulo || '').localeCompare(String(b.titulo || ''))) * factor;
        if (key === 'gmud') return (parseInt(a.numero_gmud || '0') - parseInt(b.numero_gmud || '0')) * factor;
        if (key === 'data') {
          const da = parseDate(a.previsao_etapa)?.getTime() || -Infinity;
          const db = parseDate(b.previsao_etapa)?.getTime() || -Infinity;
          return (da - db) * factor;
        }
        return 0;
      });
      updateSortIndicators();
      renderTable(rows);
    });
  });
}

function updateSortIndicators() {
  const thead = document.querySelector('#tabelaGMUD thead');
  if (!thead) return;
  const sortState = (window.__gmudSortState = window.__gmudSortState || { key: null, dir: 'asc' });
  thead.querySelectorAll('th[data-sort]')?.forEach(th => {
    // remove anteriores
    th.querySelectorAll('.sort-indicator').forEach(el => el.remove());
    const key = th.getAttribute('data-sort');
    if (key === sortState.key) {
      const span = document.createElement('span');
      span.className = 'sort-indicator';
      span.textContent = sortState.dir === 'asc' ? '▲' : '▼';
      th.appendChild(span);
    }
  });
}

function renderTable(rows) {
  console.log('[GMUD] Rendering table with rows:', rows.length);
  const tbody = document.querySelector('#tabelaGMUD tbody');
  tbody.innerHTML = '';
  const status = document.getElementById('gmud-status');
  // Alerta sobre itens sem previsao_etapa
  const missingCount = rows.filter(r => !r.previsao_etapa || String(r.previsao_etapa).trim() === '').length;
  let alertDiv = document.getElementById('gmud-missing-date-alert');
  if (!alertDiv) {
    alertDiv = document.createElement('div');
    alertDiv.id = 'gmud-missing-date-alert';
    alertDiv.style.margin = '8px 0';
    alertDiv.style.padding = '8px 12px';
    alertDiv.style.borderRadius = '6px';
    alertDiv.style.background = '#fff4e5';
    alertDiv.style.color = '#8a4b00';
    const tableEl = document.getElementById('tabelaGMUD');
    if (tableEl && tableEl.parentElement) {
      tableEl.parentElement.insertBefore(alertDiv, tableEl);
    }
  }
  alertDiv.style.display = missingCount > 0 ? 'block' : 'none';
  if (missingCount > 0) {
    alertDiv.textContent = `${missingCount} registro(s) sem data de previsão de etapa (CF 72). Será exibido avisos nas linhas correspondentes.`;
  }
  // Estado vazio
  if (!rows || rows.length === 0) {
    if (status) {
      status.innerHTML = '<div style="margin:12px 20px;padding:12px;border:1px dashed var(--border-color);border-radius:8px;background:var(--card-bg);color:var(--secondary-color)">Nenhum resultado encontrado. Ajuste os filtros e clique em Carregar.</div>';
    }
    return;
  } else if (status) {
    status.innerHTML = '';
  }
  for (const row of rows) {
    const tr = document.createElement('tr');

    const tdNumero = document.createElement('td');
    const link = document.createElement('a');
    link.href = window.AppConfig ? window.AppConfig.getMantisViewUrl(row.numero) : `#`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = row.numero;
    tdNumero.appendChild(link);
    // Badge visual de relações com tooltip listando IDs
    if (Array.isArray(row.relatedIds) && row.relatedIds.length > 0) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      const icon = document.createElement('span');
      icon.className = 'icon';
      icon.textContent = '🔗';
      const text = document.createElement('span');
      text.textContent = `Relações: ${row.relatedIds.length}`;
      badge.appendChild(icon);
      badge.appendChild(text);
      badge.style.marginLeft = '6px';
      badge.title = `Relacionadas: ${row.relatedIds.join(', ')}`;
      badge.style.cursor = 'pointer';
      badge.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleRelatedRows(row, tr);
      });
      tdNumero.appendChild(badge);
    }

    // Coluna Título
    const tdTitulo = document.createElement('td');
    tdTitulo.textContent = row.titulo || '';

    const tdData = document.createElement('td');
    if (!row.previsao_etapa || String(row.previsao_etapa).trim() === '') {
      tdData.textContent = 'Sem data (preencher previsao_etapa)';
      tdData.style.color = '#8a4b00';
      tdData.style.fontStyle = 'italic';
      tdData.title = 'Chamado será exibido mesmo sem data de previsão de etapa, pois possui GMUD.';
    } else {
      tdData.textContent = convertToBrasiliaTimeSafe(row.previsao_etapa);
    }

    const tdGMUD = document.createElement('td');
    tdGMUD.textContent = row.numero_gmud || '';

    tr.appendChild(tdNumero);
    tr.appendChild(tdTitulo);
    tr.appendChild(tdData);
    tr.appendChild(tdGMUD);
    tbody.appendChild(tr);
  }
}

// Expansão de linhas relacionadas (consulta on-demand os detalhes das relacionadas)
async function toggleRelatedRows(parentRow, parentTr) {
  const tbody = document.querySelector('#tabelaGMUD tbody');
  if (!tbody) return;
  const selector = `tr.related-row[data-parent="${parentRow.numero}"], tr.related-header-row[data-parent="${parentRow.numero}"]`;
  const existing = tbody.querySelectorAll(selector);
  if (existing.length > 0) {
    existing.forEach(el => el.remove());
    return;
  }
  if (!Array.isArray(parentRow.relatedIds) || parentRow.relatedIds.length === 0) return;
  // Busca detalhes das relacionadas em paralelo (com limite simples)
  const ids = parentRow.relatedIds.slice(0, 50);
  const details = await Promise.all(ids.map(async (id) => {
    try {
      const det = await fetchIssueDetails(id);
      if (!det) return null;
      return {
        numero: String(det.id),
        titulo: det.summary || '',
        numero_gmud: getCustomFieldValueFromIssue(det, GMUD_CF_ID) || '',
        previsao_etapa: getCustomFieldValueFromIssue(det, PREVISAO_ETAPA_CF_ID) || '',
      };
    } catch (e) {
      console.warn('[GMUD] Falha ao hidratar relacionada', id, e);
      return null;
    }
  }));
  const relatedRows = details.filter(Boolean);
  // Insere header mini e linhas logo após a linha pai
  let anchor = parentTr.nextSibling;
  const headerTr = document.createElement('tr');
  headerTr.className = 'related-header-row';
  headerTr.dataset.parent = parentRow.numero;
  const headerTd = document.createElement('td');
  headerTd.colSpan = 4; // número, título, data, gmud
  headerTd.textContent = `Relacionadas de #${parentRow.numero}`;
  headerTr.appendChild(headerTd);
  tbody.insertBefore(headerTr, anchor);
  anchor = headerTr.nextSibling;
  for (const rr of relatedRows) {
    const tr = document.createElement('tr');
    tr.className = 'related-row';
    tr.dataset.parent = parentRow.numero;

    const tdNumero = document.createElement('td');
    const link = document.createElement('a');
    link.href = window.AppConfig ? window.AppConfig.getMantisViewUrl(rr.numero) : '#';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = rr.numero;
    tdNumero.appendChild(link);

    const tdTitulo = document.createElement('td');
    const titleSpan = document.createElement('span');
    titleSpan.className = 'rel-title';
    titleSpan.textContent = rr.titulo || '';
    tdTitulo.appendChild(titleSpan);

    const tdData = document.createElement('td');
    tdData.textContent = rr.previsao_etapa ? convertToBrasiliaTimeSafe(rr.previsao_etapa) : '';

    const tdGMUD = document.createElement('td');
    tdGMUD.textContent = rr.numero_gmud || '';

    tr.appendChild(tdNumero);
    tr.appendChild(tdTitulo);
    tr.appendChild(tdData);
    tr.appendChild(tdGMUD);

    tbody.insertBefore(tr, anchor);
    anchor = tr.nextSibling;
  }
}

function exportToCSV(rows) {
  const header = ['Numero', 'Data_Producao(previsao_etapa)', 'Numero_GMUD'];
  const lines = [header.join(',')];
  rows.forEach(r => {
    const line = [
      `"${r.numero}"`,
      `"${convertToBrasiliaTimeSafe(r.previsao_etapa)}"`,
      `"${(r.numero_gmud || '').replaceAll('"', '""')}"`
    ].join(',');
    lines.push(line);
  });
  const csv = lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `relatorio_gmud_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function carregarDados() {
  console.log('[GMUD] carregarDados() called');
  const btn = document.getElementById('btnCarregar');
  const btnExport = document.getElementById('btnExportar');
  const ultima = document.getElementById('ultimaAtualizacao');
  btn.disabled = true;
  btn.textContent = 'Carregando...';
  if (btnExport) btnExport.disabled = true;
  renderSkeleton(8);
  try {
    const dataInicialInput = document.getElementById('dataInicial');
    const dataFinalInput = document.getElementById('dataFinal');
    const dataInicial = dataInicialInput.value ? new Date(dataInicialInput.value) : null;
    const dataFinal = dataFinalInput.value ? new Date(dataFinalInput.value) : null;
    console.log('[GMUD] Date filters:', { dataInicial: dataInicialInput.value, dataFinal: dataFinalInput.value });

    let rows = await fetchResolvedWithGMUD();
    // Enriquecimento com relationships (sem hidratar issues relacionadas)
    rows = await enrichRowsWithRelationships(rows, { concurrency: 8, maxDetails: 1000 });
    // Filtra por período em previsao_etapa
    if (dataInicial || dataFinal) {
      // Mantém registros sem previsao_etapa, mesmo com filtro de data
      rows = rows.filter(r => {
        const hasDate = !!(r.previsao_etapa && String(r.previsao_etapa).trim());
        return !hasDate || inDateRangeBrasilia(r.previsao_etapa, dataInicial, dataFinal);
      });
    }
    console.log('[GMUD] Rows after date filter (keeping empty dates):', rows.length);

    renderTable(rows);
    if (btnExport) btnExport.disabled = rows.length === 0;

    const now = new Date();
    const formatted = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
    if (ultima) ultima.textContent = `Última atualização: ${formatted}`;
    return rows;
  } catch (e) {
    console.error('Erro ao carregar relatório GMUD:', e);
    setError('Erro ao carregar relatório GMUD. Verifique o console.');
    return [];
  } finally {
    btn.disabled = false;
    btn.textContent = 'Carregar';
  }
}

function ensureAuth() {
  const token = localStorage.getItem('authToken');
  if (!token) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

window.addEventListener('DOMContentLoaded', () => {
  console.log('[GMUD] DOMContentLoaded on gmud-relatorio');
  if (!ensureAuth()) return;
  const btnCarregar = document.getElementById('btnCarregar');
  const btnExportar = document.getElementById('btnExportar');

  btnCarregar?.addEventListener('click', async () => {
    console.log('[GMUD] Click on Carregar');
    window.__gmudRows = await carregarDados();
  });
  btnExportar?.addEventListener('click', () => {
    console.log('[GMUD] Click on Exportar CSV, rows:', window.__gmudRows ? window.__gmudRows.length : 0);
    exportToCSV(window.__gmudRows || []);
  });
  attachSortHandlers();
  updateSortIndicators();

  // Atualiza offset sticky conforme altura da toolbar
  function updateStickyOffset() {
    const toolbar = document.querySelector('.gmud-toolbar.sticky');
    const h = toolbar ? Math.ceil(toolbar.getBoundingClientRect().height) : 56;
    document.documentElement.style.setProperty('--gmud-sticky-offset', h + 'px');
  }
  updateStickyOffset();
  window.addEventListener('resize', updateStickyOffset);
  // Se toolbar alterar de tamanho dinamicamente
  const tb = document.querySelector('.gmud-toolbar.sticky');
  if (window.ResizeObserver && tb) {
    const ro = new ResizeObserver(() => updateStickyOffset());
    ro.observe(tb);
  }
});
