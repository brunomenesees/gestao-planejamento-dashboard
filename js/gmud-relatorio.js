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
    numero_gmud: getCustomFieldValueFromIssue(issue, GMUD_CF_ID) || '',
    previsao_etapa: getCustomFieldValueFromIssue(issue, PREVISAO_ETAPA_CF_ID) || '',
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

async function fetchIssuesPage({ page = 1, pageSize = 250, filterId = FILTER_ID_PROJETOS }) {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('page_size', String(pageSize));
  if (filterId) params.set('filter_id', String(filterId));
  // Garante que os custom_fields venham no payload (necessário para CF 71/72)
  params.set('include', 'custom_fields');
  const endpoint = `issues?${params.toString()}`;
  console.log('[GMUD] Fetching page:', page, 'pageSize:', pageSize, 'filterId:', filterId, 'endpoint:', endpoint);
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
    return convertToBrasiliaTime(dateString);
  } catch {
    return dateString || 'N/A';
  }
}

function renderTable(rows) {
  console.log('[GMUD] Rendering table with rows:', rows.length);
  const tbody = document.querySelector('#tabelaGMUD tbody');
  tbody.innerHTML = '';
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
  for (const row of rows) {
    const tr = document.createElement('tr');

    const tdNumero = document.createElement('td');
    const link = document.createElement('a');
    link.href = window.AppConfig ? window.AppConfig.getMantisViewUrl(row.numero) : `#`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = row.numero;
    tdNumero.appendChild(link);

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
    tr.appendChild(tdData);
    tr.appendChild(tdGMUD);
    tbody.appendChild(tr);
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
  const ultima = document.getElementById('ultimaAtualizacao');
  btn.disabled = true;
  btn.textContent = 'Carregando...';
  try {
    const dataInicialInput = document.getElementById('dataInicial');
    const dataFinalInput = document.getElementById('dataFinal');
    const dataInicial = dataInicialInput.value ? new Date(dataInicialInput.value) : null;
    const dataFinal = dataFinalInput.value ? new Date(dataFinalInput.value) : null;
    console.log('[GMUD] Date filters:', { dataInicial: dataInicialInput.value, dataFinal: dataFinalInput.value });

    let rows = await fetchResolvedWithGMUD();
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

    const now = new Date();
    const formatted = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
    if (ultima) ultima.textContent = `Última atualização: ${formatted}`;
    return rows;
  } catch (e) {
    console.error('Erro ao carregar relatório GMUD:', e);
    alert('Erro ao carregar relatório GMUD. Verifique o console.');
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
});
