import { computeKPIs, buildTrendSeries } from './utils/stats.js';
import { renderOverview } from './views/overview.js';
import { initIncidentsTable, updateIncidentsTable } from './views/incidentes.js';
import { initJobsView, updateJobsView, ensureJobsRedraw } from './views/jobs.js';
import { jobName } from './utils/jobs_map.js';

const API_URL = '/api';

// Função para fazer requisições autenticadas
async function makeAuthenticatedRequest(url, options = {}) {
  const token = localStorage.getItem('authToken');
  if (!token) {
    throw new Error('Usuário não autenticado. Faça login primeiro.');
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (response.status === 401) {
    // Token expirado ou inválido
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  return response;
}

const state = {
  filtered: [], // resultados acumulados
  utc: false,
  filters: {
    start: null,
    end: null,
    id_job: '',
    text: '',
    severities: new Set(['error', 'warning']),
  },
  loading: false,
  cursor: null,
  pageSize: 10000,
};

// Elements
const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const importProgress = document.getElementById('importProgress');
const progressBar = importProgress.querySelector('.progress-bar');
const toggleUTC = document.getElementById('toggleUTC');
const dateStartEl = document.getElementById('dateStart');
const dateEndEl = document.getElementById('dateEnd');
const idJobSelect = document.getElementById('idJobSelect');
const textSearch = document.getElementById('textSearch');
const sevError = document.getElementById('sevError');
const sevWarning = document.getElementById('sevWarning');
const sevInfo = document.getElementById('sevInfo');
const sevSuccess = document.getElementById('sevSuccess');
const applyFiltersBtn = document.getElementById('applyFilters');
const applyFiltersText = document.getElementById('applyFiltersText');
const applyFiltersSpinner = document.getElementById('applyFiltersSpinner');
const loadMoreBtn = document.getElementById('loadMore');
const loadMoreText = document.getElementById('loadMoreText');
const loadMoreSpinner = document.getElementById('loadMoreSpinner');
const loadMoreInfo = document.getElementById('loadMoreInfo');
const generalLoadingIndicator = document.getElementById('generalLoadingIndicator');
const incidentsLoadingIndicator = document.getElementById('incidentsLoadingIndicator');

// Funções de controle da barra de progresso (para importação)
function showLoadingProgress(message = 'Carregando...') {
  importProgress.classList.remove('d-none');
  progressBar.style.width = '25%';
  progressBar.textContent = message;
  progressBar.classList.remove('bg-danger', 'bg-success');
  progressBar.classList.add('progress-bar-animated', 'progress-bar-striped');
}

function updateLoadingProgress(message, width) {
  progressBar.style.width = `${width}%`;
  progressBar.textContent = message;
}

function hideLoadingProgress() {
  setTimeout(() => {
    importProgress.classList.add('d-none');
    progressBar.classList.remove('progress-bar-animated', 'progress-bar-striped');
    progressBar.style.width = '0%';
  }, 500);
}

// Funções de controle dos indicadores visuais de carregamento
function showApplyFiltersLoading() {
  if (applyFiltersText && applyFiltersSpinner) {
    applyFiltersText.textContent = 'Carregando...';
    applyFiltersSpinner.classList.remove('d-none');
    applyFiltersBtn.disabled = true;
  }
}

function hideApplyFiltersLoading() {
  if (applyFiltersText && applyFiltersSpinner) {
    applyFiltersText.textContent = 'Aplicar filtros';
    applyFiltersSpinner.classList.add('d-none');
    applyFiltersBtn.disabled = false;
  }
}

function showLoadMoreLoading() {
  if (loadMoreText && loadMoreSpinner) {
    loadMoreText.textContent = 'Carregando...';
    loadMoreSpinner.classList.remove('d-none');
    loadMoreBtn.disabled = true;
  }
}

function hideLoadMoreLoading() {
  if (loadMoreText && loadMoreSpinner) {
    loadMoreText.textContent = 'Carregar mais dados';
    loadMoreSpinner.classList.add('d-none');
    loadMoreBtn.disabled = false;
  }
}

function updateLoadMoreInfo() {
  if (loadMoreInfo) {
    if (state.cursor) {
      const count = state.filtered.length;
      loadMoreInfo.textContent = `${count} registros carregados`;
      loadMoreInfo.classList.remove('d-none');
      loadMoreBtn.classList.remove('d-none');
    } else {
      const count = state.filtered.length;
      if (count > 0) {
        loadMoreInfo.textContent = `Todos os ${count} registros foram carregados`;
        loadMoreInfo.classList.remove('d-none');
      }
      loadMoreBtn.classList.add('d-none');
    }
  }
}

function showGeneralLoading() {
  if (generalLoadingIndicator) {
    generalLoadingIndicator.classList.remove('d-none');
  }
}

function hideGeneralLoading() {
  if (generalLoadingIndicator) {
    generalLoadingIndicator.classList.add('d-none');
  }
}

// Datepickers
let fpStart, fpEnd;
function initDatepickers() {
  const now = new Date();
  const startDefault = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  fpStart = flatpickr(dateStartEl, { enableTime: true, dateFormat: 'Y-m-d H:i', time_24hr: true, defaultDate: startDefault });
  fpEnd = flatpickr(dateEndEl, { enableTime: true, dateFormat: 'Y-m-d H:i', time_24hr: true, defaultDate: now });
}

function bindEvents() {
  fileInput.addEventListener('change', onFileChosen);

  ;['dragenter','dragover'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add('dragover'); }));
  ;['dragleave','drop'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.remove('dragover'); }));
  dropZone.addEventListener('drop', onFileDropped);

  toggleUTC.addEventListener('change', () => {
    state.utc = toggleUTC.checked;
    render();
  });

  applyFiltersBtn.addEventListener('click', async () => {
    // Resetar cursor para nova busca
    state.cursor = null;
    state.filtered = [];
    
    // Atualizar filtros
    state.filters.start = fpStart.selectedDates[0] ? fpStart.selectedDates[0].toISOString() : null;
    state.filters.end = fpEnd.selectedDates[0] ? fpEnd.selectedDates[0].toISOString() : null;
    state.filters.id_job = idJobSelect.value;
    state.filters.text = textSearch.value.trim();

    const sel = new Set();
    if (sevError.checked) sel.add('error');
    if (sevWarning.checked) sel.add('warning');
    if (sevInfo.checked) sel.add('info');
    if (sevSuccess.checked) sel.add('success');
    state.filters.severities = sel;

    showApplyFiltersLoading();
    try {
      await applyFilters();
      render();
      updateLoadMoreInfo();
    } finally {
      hideApplyFiltersLoading();
    }
  });
}

async function onFileChosen(e) {
  const file = e.target.files[0];
  if (!file) return;
  await importFile(file);
}

async function onFileDropped(e) {
  const file = e.dataTransfer.files[0];
  if (!file) return;
  await importFile(file);
}

async function importFile(file) {
  const formData = new FormData();
  formData.append('jsonfile', file);

  try {
    state.loading = true;
    importProgress.classList.remove('d-none');
    progressBar.style.width = '25%';
    progressBar.textContent = 'Enviando arquivo...';
    progressBar.classList.remove('bg-danger', 'bg-success');
    progressBar.classList.add('progress-bar-animated', 'progress-bar-striped');

    // Timeout de segurança para detectar se a importação foi concluída
    let importCompleted = false;
    const safetyTimeout = setTimeout(() => {
      if (!importCompleted) {
        console.warn('Timeout de segurança ativado - finalizando importação');
        finalizeImport();
      }
    }, 30000); // 30 segundos de timeout

    const response = await fetch(`${API_URL}/import`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Erro no servidor: ${response.statusText}`);
    }

    const result = await response.json();
    console.log(result.message);
    importCompleted = true;
    clearTimeout(safetyTimeout);

    // Atualizar progresso
    progressBar.style.width = '50%';
    progressBar.textContent = 'Processando dados...';

    // Após importação, recarrega os dados e a UI (sem mostrar progresso adicional)
    try {
      await populateIdJobOptionsSilent();
      
      progressBar.style.width = '75%';
      progressBar.textContent = 'Aplicando filtros...';
      
      await applyFiltersSilent();
      
      progressBar.style.width = '90%';
      progressBar.textContent = 'Renderizando interface...';
      
      renderSilent();

      // Finalizar progresso
      finalizeImport();
    } catch (error) {
      console.warn('Erro durante processamento pós-importação:', error);
      // Mesmo com erro, finalizar a importação se os dados foram carregados
      finalizeImport();
    }

  } catch (err) {
    console.error('Falha ao importar arquivo:', err);
    progressBar.classList.add('bg-danger');
    progressBar.classList.remove('progress-bar-animated', 'progress-bar-striped');
    progressBar.textContent = 'Erro na importação';
    alert('Falha ao importar o arquivo JSON. Verifique o console do servidor.');
  } finally {
    state.loading = false;
  }
}

// Função para finalizar a importação de forma consistente
function finalizeImport() {
  // Verificar se há dados carregados
  const hasData = state.filtered && state.filtered.length > 0;
  
  progressBar.style.width = '100%';
  progressBar.classList.remove('progress-bar-animated', 'progress-bar-striped');
  
  if (hasData) {
    progressBar.classList.add('bg-success');
    progressBar.textContent = `Importação concluída! ${state.filtered.length} registros carregados.`;
  } else {
    progressBar.classList.add('bg-warning');
    progressBar.textContent = 'Importação concluída, mas sem dados visíveis.';
  }

  setTimeout(() => {
    importProgress.classList.add('d-none');
    progressBar.classList.add('progress-bar-animated', 'progress-bar-striped');
    progressBar.classList.remove('bg-success', 'bg-warning');
    progressBar.style.width = '0%';
  }, 3000);
}

// Nova função que usa o mapeamento local de jobs (não faz requisição ao backend)
function populateIdJobOptionsLocal() {
  try {
    // Importar o mapeamento de jobs do módulo local
    import('./utils/jobs_map.js').then(({ JOBS_MAP }) => {
      const jobs = Object.entries(JOBS_MAP)
        .map(([id, name]) => ({ id: parseInt(id), name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', {sensitivity: 'base'}));
      
      idJobSelect.innerHTML = '<option value="">Todos</option>' + 
        jobs.map(j => `<option value="${j.id}">${j.name}</option>`).join('');
      
      console.log(`Dropdown de jobs populado com ${jobs.length} jobs do mapeamento local`);
    });
  } catch (error) {
    console.error("Erro ao carregar jobs do mapeamento local:", error);
  }
}

// Função que busca job IDs via API
async function populateIdJobOptions() {
  try {
    const response = await makeAuthenticatedRequest(`${API_URL}/jobs/stats`);
    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status}`);
    }
    const data = await response.json();
    
    // Limpa opções existentes (exceto "Todos")
    idJobSelect.innerHTML = '<option value="">Todos</option>';
    
    // Adiciona opções dos job IDs
    data.jobIds.forEach(jobId => {
      const option = document.createElement('option');
      option.value = jobId;
      option.textContent = `${jobId} - ${jobName(jobId)}`;
      idJobSelect.appendChild(option);
    });
  } catch (err) {
    console.error('Erro ao carregar job IDs:', err);
  }
}

// Versão silenciosa para uso durante importação
async function populateIdJobOptionsSilent() {
  try {
    const response = await makeAuthenticatedRequest(`${API_URL}/jobs/stats`);
    const data = await response.json();
    const jobs = data.jobIds
      .map(j => ({ id: j, name: jobName(j) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', {sensitivity: 'base'}));
    idJobSelect.innerHTML = '<option value="">Todos</option>' + 
      jobs.map(j => `<option value="${j.id}">${j.name}</option>`).join('');
  } catch (error) {
    console.error("Erro ao carregar stats dos jobs:", error);
  }
}

async function applyFilters() {
  const params = new URLSearchParams();
  if (state.filters.start) params.append('start', state.filters.start);
  if (state.filters.end) params.append('end', state.filters.end);
  if (state.filters.id_job) params.append('id_job', state.filters.id_job);
  if (state.filters.text) params.append('text', state.filters.text);
  if (state.filters.severities.size > 0) {
    params.append('severities', Array.from(state.filters.severities).join(','));
  }
  params.append('limit', String(state.pageSize));
  if (state.cursor) params.append('cursor', state.cursor);

  try {
    state.loading = true;
    
    const response = await makeAuthenticatedRequest(`${API_URL}/jobs?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status} ${response.statusText}`);
    }
    
    const payload = await response.json();
    const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
    if (!state.cursor) state.filtered = rows; else state.filtered = state.filtered.concat(rows);
    state.cursor = payload?.nextCursor || null;
    
    console.log(`Dados carregados: ${rows.length} novos registros, total: ${state.filtered.length}`);
    
  } catch (error) {
    console.error("Erro ao buscar dados:", error);
    state.filtered = [];
    
    // Mostrar erro na interface
    const kpiRow = document.getElementById('kpiRow');
    if (kpiRow) {
      kpiRow.innerHTML = '<div class="col-12"><div class="alert alert-warning">Erro ao carregar dados da API. Verifique se o servidor está rodando.</div></div>';
    }
  } finally {
    state.loading = false;
  }
}

// Versão silenciosa para uso durante importação
async function applyFiltersSilent() {
  const params = new URLSearchParams();
  if (state.filters.start) params.append('start', state.filters.start);
  if (state.filters.end) params.append('end', state.filters.end);
  if (state.filters.id_job) params.append('id_job', state.filters.id_job);
  if (state.filters.text) params.append('text', state.filters.text);
  if (state.filters.severities.size > 0) {
    params.append('severities', Array.from(state.filters.severities).join(','));
  }
  params.append('limit', String(state.pageSize));
  if (state.cursor) params.append('cursor', state.cursor);

  try {
    const response = await makeAuthenticatedRequest(`${API_URL}/jobs?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status} ${response.statusText}`);
    }
    
    const payload = await response.json();
    const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
    if (!state.cursor) state.filtered = rows; else state.filtered = state.filtered.concat(rows);
    state.cursor = payload?.nextCursor || null;
    
  } catch (error) {
    console.error("Erro ao buscar dados:", error);
    state.filtered = [];
  }
}

function render() {
  if (state.loading) return;

  try {
    updateLoadingProgress('Calculando KPIs...', 85);
    
    // Overview
    const kpis = computeKPIs(state.filtered || []);
    const trend = buildTrendSeries(state.filtered || []);
    renderOverview({ kpis, trend, utc: state.utc });

    updateLoadingProgress('Atualizando tabelas...', 95);
    
    // Incidentes table
    updateIncidentsTable(state.filtered || [], { utc: state.utc });

    // Jobs view
    updateJobsView(state.filtered || [], { utc: state.utc });
    
    console.log('Interface renderizada com sucesso');
  } catch (error) {
    console.error('Erro ao renderizar interface:', error);
    // Mostrar mensagem de erro na interface
    const kpiRow = document.getElementById('kpiRow');
    if (kpiRow) {
      kpiRow.innerHTML = '<div class="col-12"><div class="alert alert-danger">Erro ao carregar dados. Verifique o console para mais detalhes.</div></div>';
    }
  }
}

// Versão silenciosa para uso durante importação
function renderSilent() {
  if (state.loading) return;

  try {
    // Overview
    const kpis = computeKPIs(state.filtered || []);
    const trend = buildTrendSeries(state.filtered || []);
    renderOverview({ kpis, trend, utc: state.utc });
    
    // Incidentes table
    updateIncidentsTable(state.filtered || [], { utc: state.utc });

    // Jobs view
    updateJobsView(state.filtered || [], { utc: state.utc });
    
    console.log('Interface renderizada com sucesso');
  } catch (error) {
    console.error('Erro ao renderizar interface:', error);
    // Mostrar mensagem de erro na interface
    const kpiRow = document.getElementById('kpiRow');
    if (kpiRow) {
      kpiRow.innerHTML = '<div class="col-12"><div class="alert alert-danger">Erro ao carregar dados. Verifique o console para mais detalhes.</div></div>';
    }
  }
}

// Verificar se usuário está autenticado
function checkAuthentication() {
  const token = localStorage.getItem('authToken');
  const user = localStorage.getItem('user');
  
  if (!token || !user) {
    // Redirecionar para página de login
    alert('Você precisa estar logado para acessar o Monitor de Jobs. Redirecionando para o login...');
    window.location.href = '/index.html';
    return false;
  }
  
  return true;
}

async function init() {
  // Verificar autenticação primeiro
  if (!checkAuthentication()) {
    return;
  }
  
  try {
    // Mostrar progresso inicial
    showLoadingProgress('Inicializando aplicação...');
    
    // Setup UI
    initDatepickers();
    bindEvents();
    
    updateLoadingProgress('Configurando tabelas...', 50);
    await initIncidentsTable(document.getElementById('incidentsTable'));
    await initJobsView(document.getElementById('jobsTable'));

    // Forçar redraw do Tabulator quando a aba Jobs for exibida
    const jobsTabBtn = document.getElementById('jobs-tab');
    if (jobsTabBtn) {
      jobsTabBtn.addEventListener('shown.bs.tab', () => {
        ensureJobsRedraw();
      });
    }

    updateLoadingProgress('Carregando lista de jobs...', 75);
    // Usar mapeamento local de jobs (não faz requisição ao backend)
    populateIdJobOptionsLocal();
    
    updateLoadingProgress('Concluído!', 100);
    
    // Mostrar interface vazia com mensagem informativa
    const kpiRow = document.getElementById('kpiRow');
    if (kpiRow) {
      kpiRow.innerHTML = `
        <div class="col-12">
          <div class="alert alert-info">
            <h5><i class="bi bi-info-circle"></i> Bem-vindo ao Monitor de Jobs</h5>
            <p>Configure os filtros acima e clique em <strong>"Aplicar filtros"</strong> para carregar os dados.</p>
            <p><small>Dica: Use os filtros de data, job específico ou tipo de severidade para encontrar exatamente o que precisa.</small></p>
          </div>
        </div>
      `;
    }
    
    console.log('Aplicação inicializada. Aguardando aplicação de filtros para carregar dados.');
    
    hideLoadingProgress();

  } catch (err) {
    console.error('Falha ao inicializar:', err);
    
    // Mostrar erro mais específico na interface
    const kpiRow = document.getElementById('kpiRow');
    if (kpiRow) {
      kpiRow.innerHTML = `
        <div class="col-12">
          <div class="alert alert-danger">
            <h5>Erro ao inicializar a aplicação</h5>
            <p>Verifique se as APIs estão funcionando</p>
            <p><small>Erro: ${err.message}</small></p>
          </div>
        </div>
      `;
    }
    
    hideLoadingProgress();
    // Ainda mostrar o alert para o usuário
    alert('Erro ao inicializar a aplicação. Verifique se as APIs estão funcionando.');
  }
}

init();

// Configurar evento do botão Carregar mais
if (loadMoreBtn) {
  loadMoreBtn.addEventListener('click', async () => {
    if (!state.cursor || state.loading) return;
    
    showLoadMoreLoading();
    try {
      await applyFilters();
      render();
      updateLoadMoreInfo();
    } finally {
      hideLoadMoreLoading();
    }
  });
}
