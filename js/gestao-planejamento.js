// Dados globais - inicializados vazios
let demandasData = [];
// Seleção de tickets para edição massiva
let selectedTickets = new Set();
let currentPage = 1;
let rowsPerPage = 20;
let filteredData = [];
let hiddenColumns = new Set();

// Feature flag: edição inline nas colunas Equipe/Analista/Responsável Atual
// Mantenha como false para desabilitar cliques e forçar uso do modal unificado
const ENABLE_INLINE_EDIT = false;

// Marcações de itens atualizados recentemente (janela de tempo)
const RECENT_WINDOW_MS = 60 * 60 * 1000; // 60 minutos
let recentlyUpdated = {};
try {
    recentlyUpdated = JSON.parse(sessionStorage.getItem('recentlyUpdated') || '{}') || {};
} catch {}

function markRecentlyUpdated(numeros) {
    const now = Date.now();
    numeros.forEach(n => { if (n) recentlyUpdated[String(n)] = now; });
    try { sessionStorage.setItem('recentlyUpdated', JSON.stringify(recentlyUpdated)); } catch {}
    try { numeros.forEach(n => applyRecentStyleToRow(String(n))); } catch {}
}

function isRecentlyUpdated(numero) {
    const n = String(numero);
    // Marcações da sessão (imediatas após ações locais)
    const tSess = recentlyUpdated[n];
    const inSession = !!tSess && (Date.now() - tSess) <= RECENT_WINDOW_MS;
    // Timestamp vindo da API (última atualização do ticket)
    let inApi = false;
    try {
        const d = Array.isArray(demandasData) ? demandasData.find(x => x && x.numero === n) : null;
        if (d && d.ultima_atualizacao_ts) {
            const diff = Date.now() - Number(d.ultima_atualizacao_ts);
            inApi = Number.isFinite(diff) && diff <= RECENT_WINDOW_MS;
        }
    } catch {}
    return inSession || inApi;
}

function cleanupRecentlyUpdated() {
    const now = Date.now();
    let changed = false;
    for (const [n, t] of Object.entries(recentlyUpdated)) {
        if (!t || (now - t) > RECENT_WINDOW_MS) {
            delete recentlyUpdated[n];
            changed = true;
        }
    }
    if (changed) {
        try { sessionStorage.setItem('recentlyUpdated', JSON.stringify(recentlyUpdated)); } catch {}
    }
}
setInterval(cleanupRecentlyUpdated, 60000);

function ensureRecentStyle() {
    if (document.getElementById('recent-updated-style')) return;
    const style = document.createElement('style');
    style.id = 'recent-updated-style';
    style.textContent = `
      tr.recently-updated { background: #fff9e6 !important; box-shadow: inset 3px 0 0 #f1b200; }
      .badge-updated { display:inline-block; margin-left:6px; padding:2px 6px; font-size:10px; font-weight:600; color:#835400; background:#ffe08a; border-radius:10px; }
    `;
    document.head.appendChild(style);
}

// Aplica destaque imediatamente na linha já renderizada, se existir
function applyRecentStyleToRow(numero) {
    ensureRecentStyle();
    const row = document.querySelector(`tr[data-demanda="${numero}"]`);
    if (!row) return;
    row.classList.add('recently-updated');
    // Procura o link do número para anexar o badge
    const link = row.querySelector('a[href*="view.php"], a');
    if (link && !row.querySelector('.badge-updated')) {
        const badge = document.createElement('span');
        badge.className = 'badge-updated';
        badge.textContent = 'Atualizado';
        link.parentElement.appendChild(badge);
    }
}

// Colunas que devem ser ocultas por padrão
const DEFAULT_HIDDEN_COLUMNS = new Set([
    'categoria',      // Categoria
    'solicitante',    // Solicitante  
    'estado',         // Situação
    'tempoTotal'      // Tempo decorrido
]);

// Variáveis globais para ordenação
let sortColumn = 'default'; // Padrão: Ordem_plnj ASC, Atualizado DESC, Núm DESC
let sortDirection = 1;

// Variável global para armazenar os status selecionados
let selectedStatusFilter = new Set(['concluído', 'em andamento', 'pendente', 'cancelado', 'aberto', 'atribuído', 'confirmado', 'novo', 'admitido', 'retorno']);

// Variável global para armazenar os projetos selecionados
let selectedProjetoFilter = new Set();

// Variável global para armazenar os squads selecionados
let selectedSquadFilter = new Set();

// Lista de status disponíveis para o dropdown (lista fixa)
const STATUS_OPTIONS = [
    ' ',
    'Aguardando Deploy',
    'Ajuste Especificação',
    'Ajustes',
    'Análise Suporte',
    'Code Review',
    'Desenvolvimento',
    'Despriorizado',
    'Especificação',
    'Revisão Especificação',
    'Fila ABAP',
    'Fila Analytics',
    'Fila Especificação',
    'Fila WEB',
    'Testes',
    'Pendência',
    'Pendência Cliente',
    'Validação Cliente'
];
// Lista de opções para os novos modais de atualização
const SQUAD_OPTIONS = [
    "AMS", "Analytics", "ABAP", "Infra", "LowCode", "PMO",
    "Requisitos", "Python", "SAP", "Web"
];

// TODO: Substituir com a lista real de analistas
const ANALISTA_RESPONSAVEL_OPTIONS = [
    " ","bruno.tavares", "daniel.paraizo", "elaine.santos", "gabriel.matos", "gustavo.magalhaes", 
    "thiago.caldeira", "tiago.nogueira", "vinicius.vieira", "viviane.silva"
];

// TODO: Substituir com a lista real de responsáveis
const RESPONSAVEL_ATUAL_OPTIONS = [
    " ","Bruno Tavares", "Daniel Paraizo", "Elaine Santos", "Gabriel Matos", "Giovanni Mussolini", 
    "Gustavo Magalhaes", "Rafael Montesso", "Sylvio Neto", "Thiago Caldeira", "Tiago Nogueira", 
    "Vinicius Vieira", "Viviane Silva"
];


// Mapeamento de projetos para nomes amigáveis
const mapeamentoProjetos = {
    "0012618: Suporte interno XCELiS": "Suporte Interno Xcelis",
    "12365392645 - Novartis - Torre de Controle": "Novartis - Torre de Controle",
    "3043692983 - PVM - CONTROL TOWER": "PVM - CONTROL TOWER",
    "7986703478 - ARCELORMITTAL - CENTRAL DE TRAFEGO": "ARCELORMITTAL - CENTRAL DE TRAFEGO",
    "8240852371 - SYNGENTA - MONITORAMENTO E PORTAL TRACKING": "SYNGENTA - MONITORAMENTO E PORTAL TRACKING",
    "11596273519 - C&A - CESSÃO TMS SAAS": "C&A - CESSÃO TMS SAAS",
    "Abertura Suporte": "Abertura Suporte",
    "Alertas Zabbix": "Alertas Zabbix"
    // ... manter o resto do mapeamento ...
};

// Função para obter o nome amigável do projeto
function getNomeAmigavelProjeto(nomeOriginal) {
    return mapeamentoProjetos[nomeOriginal] || nomeOriginal;
}

// === Carregamento de dados: API Mantis primeiro, CSV/IndexedDB como fallback ===
function getCustomFieldValue(issue, fieldId) {
    const cf = (issue.custom_fields || []).find(cf => cf?.field?.id === fieldId);
    return cf ? cf.value : '';
}

function mapIssueToDemanda(issue) {
    return {
        numero: String(issue.id),
        categoria: issue.category?.name || '',
        projeto: getNomeAmigavelProjeto(issue.project?.name || ''),
        atribuicao: issue.handler?.name || '',
        estado: (issue.status?.name || '').toLowerCase().trim(),
        data_abertura: issue.created_at || '',
        ultima_atualizacao: issue.updated_at || '',
        // Timestamp bruto para lógica de destaque recente (híbrido API + sessão)
        ultima_atualizacao_ts: (function() {
            const raw = issue.updated_at || issue.last_updated || '';
            const ts = Date.parse(raw);
            return Number.isFinite(ts) ? ts : null;
        })(),
        resumo: issue.summary || '',
        ordem_plnj: getCustomFieldValue(issue, 50) || '', // CF ID 50 informado para Ordem Planejamento
        data_prometida: issue.due_date || '', // se usar custom field, ajustar aqui
        squad: getCustomFieldValue(issue, 49) || '',
        resp_atual: getCustomFieldValue(issue, 69) || '',
        solicitante: issue.reporter?.name || '',
        status: getCustomFieldValue(issue, 70) || '',
        numero_gmud: getCustomFieldValue(issue, 71) || '',
        previsao_etapa: getCustomFieldValue(issue, 72) || ''
    };
}

async function fetchIssuesPage({ page = 1, pageSize = 100, projectId, filterId, categoryId, categoryName }) {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(pageSize));
    if (projectId) params.set('project_id', String(projectId));
    if (filterId) params.set('filter_id', String(filterId));
    if (categoryId) params.set('category_id', String(categoryId));
    if (categoryName) params.set('category', String(categoryName));
    const endpoint = `issues?${params.toString()}`;
    const resp = await mantisRequest(endpoint, { method: 'GET' });
    return resp; // esperado: { issues: [...], total_results, page_count, current_page }
}

async function fetchAllIssuesFromMantis({ projectId, filterId, categoryId, categoryName, pageSize = 250 } = {}) {
    try {
        const MAX_PAGES = 10;     // limite solicitado
        const MAX_ITEMS = 3000;   // limite solicitado
        const seenIds = new Set();
        const first = await fetchIssuesPage({ page: 1, pageSize, projectId, filterId, categoryId, categoryName });
        if (!first || !Array.isArray(first.issues)) return [];
        // Debug minimal para inspecionar metadados de paginação (uma vez)
        try {
            console.log('Mantis first page meta:', {
                keys: Object.keys(first || {}),
                total_results: first.total_results,
                page_count: first.page_count,
                total_pages: first.total_pages,
                current_page: first.current_page || first.page,
                received_count: first.issues?.length
            });
        } catch {}

        const totalResults = first.total_results || first.total || first.total_count;
        const totalPagesRaw = first.page_count || first.total_pages || (totalResults ? Math.ceil(totalResults / pageSize) : 0);
        const totalPages = totalPagesRaw ? Math.min(totalPagesRaw, MAX_PAGES) : 0;
        const allIssues = [];
        // adiciona com deduplicação
        for (const it of first.issues) {
            const id = it?.id;
            if (!seenIds.has(id)) { seenIds.add(id); allIssues.push(it); }
        }

        if (totalPages && totalPages > 1) {
            const pages = [];
            for (let p = 2; p <= totalPages && pages.length < (MAX_PAGES - 1); p++) pages.push(p);
            // Concorrência limitada em lote de páginas (3 simultâneas)
            await runWithConcurrency(pages, async (p) => {
                const r = await fetchIssuesPage({ page: p, pageSize, projectId, filterId, categoryId, categoryName });
                if (r && Array.isArray(r.issues)) {
                    let added = 0;
                    for (const it of r.issues) {
                        if (allIssues.length >= MAX_ITEMS) break;
                        const id = it?.id;
                        if (!seenIds.has(id)) { seenIds.add(id); allIssues.push(it); added++; }
                    }
                    try { console.log(`Mantis page ${p}: received=${r.issues.length}, added_unique=${added}, total=${allIssues.length}`); } catch {}
                }
            }, 3);
        } else {
            // Fallback: paginar até esgotar, caso a API não informe totalPages
            let page = 2;
            let noNewCount = 0;
            while (page <= MAX_PAGES && allIssues.length < MAX_ITEMS) {
                const r = await fetchIssuesPage({ page, pageSize, projectId, filterId, categoryId, categoryName });
                const items = (r && Array.isArray(r.issues)) ? r.issues : [];
                if (!items.length) { try { console.log(`Mantis page ${page}: vazia, parando.`); } catch {}; break; }
                const before = allIssues.length;
                for (const it of items) {
                    if (allIssues.length >= MAX_ITEMS) break;
                    const id = it?.id;
                    if (!seenIds.has(id)) { seenIds.add(id); allIssues.push(it); }
                }
                const added = allIssues.length - before;
                try { console.log(`Mantis page ${page}: received=${items.length}, added_unique=${added}, total=${allIssues.length}`); } catch {}
                if (added === 0) {
                    noNewCount++;
                    if (noNewCount >= 2) { try { console.log('Sem novos itens em 2 páginas consecutivas, parando.'); } catch {}; break; }
                } else {
                    noNewCount = 0;
                }
                if (items.length < pageSize) { try { console.log('Última página detectada pelo tamanho.'); } catch {}; break; }
                page++;
            }
        }

        // Filtrar por estado nativo: excluir Resolvido/Fechado
        const filteredIssues = allIssues.filter(issue => {
            const name = (issue.status?.name || '').toLowerCase().trim();
            return name !== 'resolved' && name !== 'fechado' && name !== 'closed' && name !== 'resolvido';
        });
        const mapped = filteredIssues.map(mapIssueToDemanda);
        try {
            console.log('Mantis pagination summary:', {
                pageSize,
                fetched_total: allIssues.length,
                filtered_total: filteredIssues.length,
                mapped_total: mapped.length
            });
        } catch {}
        return mapped;
    } catch (e) {
        console.warn('Falha ao carregar issues via API Mantis, usando fallback:', e);
        return [];
    }
}

async function loadInitialData({ forceRefresh = false } = {}) {
    let overlayShown = false;
    try {
        // 1) Cache-first: tenta carregar do IndexedDB para evitar recarregar no F5
        if (!forceRefresh) {
            const cached = await getChamados();
            if (Array.isArray(cached) && cached.length > 0) {
                demandasData = cached;
                try { console.log('Carregados via IndexedDB (demanda count):', demandasData.length); } catch {}

                // Renderiza imediatamente com os dados em cache
                selectedProjetoFilter = new Set(demandasData.map(c => c.projeto).filter(Boolean));
                selectedSquadFilter = new Set();
                if (hiddenColumns.size === 0) hiddenColumns = new Set(DEFAULT_HIDDEN_COLUMNS);
                updateFilterOptions();
                filterData();

                // Mantém a última atualização exibida (vinda do localStorage se existir)
                const ultimaData = localStorage.getItem('ultimaAtualizacao');
                if (ultimaData) {
                    const el = document.getElementById('ultimaAtualizacao');
                    if (el) el.textContent = `Última atualização: ${ultimaData}`;
                }
                return; // Evita chamada de rede no carregamento inicial
            }
        }
        
        // Exibir overlay de carregamento apenas em primeiro carregamento sem cache (evita duplicar com atualizarDados)
        if (!forceRefresh) {
            showLoading('Carregando dados...');
            overlayShown = true;
        }

        // 2) Se não houver cache (ou forço refresh), busca na API
        const apiData = await fetchAllIssuesFromMantis({ filterId: 1477 }); // Categoria=Projetos
        if (apiData && apiData.length > 0) {
            await saveChamados(apiData); // Persiste para próximos reloads
            demandasData = apiData;
            try { console.log('Carregados via API (demanda count):', demandasData.length); } catch {}

            const now = new Date();
            const formattedDate = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
            const el = document.getElementById('ultimaAtualizacao');
            if (el) el.textContent = `Última atualização: ${formattedDate}`;
            localStorage.setItem('ultimaAtualizacao', formattedDate);
        } else {
            // 3) Último recurso: tenta novamente cache (pode ter vindo de CSV previamente)
            const data = await getChamados();
            demandasData = Array.isArray(data) ? data : [];
            try { console.log('Carregados via IndexedDB (demanda count):', demandasData.length); } catch {}
        }

        // Prosseguir com a pipeline da UI
        if (demandasData && demandasData.length > 0) {
            selectedProjetoFilter = new Set(demandasData.map(c => c.projeto).filter(Boolean));
            selectedSquadFilter = new Set();
            if (hiddenColumns.size === 0) hiddenColumns = new Set(DEFAULT_HIDDEN_COLUMNS);
            updateFilterOptions();
            filterData();
            const ultimaData = localStorage.getItem('ultimaAtualizacao');
            if (ultimaData) {
                const el = document.getElementById('ultimaAtualizacao');
                if (el) el.textContent = `Última atualização: ${ultimaData}`;
            }
        } else {
            // Sem dados ainda – usuário pode usar CSV manualmente
            updateDashboard();
            mostrarNotificacao('Nenhum dado disponível. Importe um CSV ou use o botão Atualizar.', 'aviso');
        }
    } catch (error) {
        console.error('Erro ao carregar dados iniciais:', error);
        updateDashboard();
        mostrarNotificacao('Erro ao carregar dados. Tente importar via CSV como fallback.', 'erro');
    } finally {
        if (overlayShown) {
            hideLoading();
        }
    }
}

// Inicialização do dashboard
document.addEventListener('DOMContentLoaded', async function() {
    // Configurar tema e navegação SEMPRE (usados em todas as páginas)
    setupTheme();
    setupNavigation();

    // Só executa a lógica do dashboard se existir o elemento principal
    if (document.getElementById('dashboard') || document.getElementById('chamadosTable')) {
        
        // Adicionado: Verificação de autenticação para a página do dashboard
        const token = localStorage.getItem('authToken');
        if (!token) {
            console.log("Usuário não autenticado. Redirecionando para a página de login.");
            window.location.href = 'login.html';
            return; // Impede a execução do resto do código do dashboard
        }

        try {
            await loadInitialData(); // Carrega os dados do IndexedDB

            setupFileInput();
            setupSearch();
            setupFilters();
            setupPagination();
            setupNotifications();
            await atualizarContadorNotificacoes();
            setupExport();
            const exportDetalhamentoBtn = document.getElementById('exportDetalhamentoCSV');
            if (exportDetalhamentoBtn) {
                exportDetalhamentoBtn.addEventListener('click', exportDetalhamentoToCSV);
            }
            initCharts();
            addTableSortListeners();
            // Ativa o checkbox "Selecionar todos" e edição massiva
            setupMassSelectionControls();
            setupColumnToggle();
            
            // Aplica a visibilidade das colunas imediatamente
            applyColumnVisibility();
            
            const refreshButton = document.getElementById('refreshButton');
            if (refreshButton) {
                console.debug('Ligando handler do botão de atualização');
                refreshButton.addEventListener('click', async (ev) => {
                    ev.preventDefault();
                    try {
                        console.debug('Clique no botão de atualização (handler direto)');
                        await atualizarDados();
                    } catch (e) {
                        console.error('Erro no handler de atualização:', e);
                    }
                });
            }
        } catch (error) {
            console.error('Erro crítico durante a inicialização do dashboard:', error);
            mostrarNotificacao('Ocorreu um erro ao carregar o dashboard. Verifique o console.', 'erro');
        }

        setInterval(() => {
            if (demandasData && demandasData.length > 0) {
                console.log('Atualizando tabela automaticamente...');
                updateTable();
            }
        }, 60000);
    }
});

// Fallback: event delegation para garantir captura do clique no botão de atualização
document.addEventListener('click', async (ev) => {
    const btn = ev.target && (ev.target.id === 'refreshButton' ? ev.target : ev.target.closest && ev.target.closest('#refreshButton'));
    if (btn) {
        ev.preventDefault();
        try {
            console.debug('Clique no botão de atualização (delegated)');
            await atualizarDados();
        } catch (e) {
            console.error('Erro no delegated handler de atualização:', e);
        }
    }
});

function setupNotifications() {
    if (!("Notification" in window)) {
        console.log("Este navegador não suporta notificações de desktop.");
        return;
    }

    if (Notification.permission !== "denied" && Notification.permission !== "granted") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                new Notification("Notificações Ativadas!", { body: "Você será avisado sobre as demandas importantes." });
            }
        });
    }
}

function setupTheme() {
    const themeToggle = document.getElementById('themeToggle');
    const icon = themeToggle.querySelector('i');
    
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    icon.className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        icon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    });
}

function setupNavigation() {
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.querySelector('.toggle-sidebar');
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    
    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
    });
    
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const href = link.getAttribute('href');
            if (href) {
                window.location.href = href;
            }
        });
    });
}

function setupFileInput() {
    const fileInput = document.getElementById('fileInput');
    const loadingSpan = document.getElementById('csv-loading');

    if (!fileInput) return;

    fileInput.addEventListener('change', async (e) => {
        try {
            const file = e.target.files[0];
            if (!file) return;

            loadingSpan.style.display = 'inline-block';
            
            const reader = new FileReader();
            
            reader.onload = async (event) => {
                try {
                    const csvData = event.target.result;
                    Papa.parse(csvData, {
                        header: true,
                        skipEmptyLines: true,
                        complete: async function(results) {
                            const normalizedData = processAndNormalizeData(results.data);
                            await saveChamados(normalizedData);
                            await loadInitialData(); // Recarrega os dados do DB para a UI

                            // O restante da lógica de UI já é chamado por loadInitialData
                            
                            const now = new Date();
                            const formattedDate = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
                            document.getElementById('ultimaAtualizacao').textContent = `Última atualização: ${formattedDate}`;
                            localStorage.setItem('ultimaAtualizacao', formattedDate);
                            
                            mostrarNotificacao('Dados carregados e salvos com sucesso!', 'sucesso');
                            loadingSpan.style.display = 'none';
                        },
                        error: function(error) {
                            console.error('Erro ao processar CSV:', error);
                            loadingSpan.style.display = 'none';
                            mostrarNotificacao('Erro ao processar o arquivo CSV', 'erro');
                        }
                    });
                } catch (error) {
                    console.error('Erro ao processar arquivo:', error);
                    loadingSpan.style.display = 'none';
                    mostrarNotificacao('Erro ao processar o arquivo', 'erro');
                }
            };

            reader.onerror = () => {
                console.error('Erro ao ler arquivo');
                loadingSpan.style.display = 'none';
                mostrarNotificacao('Erro ao ler o arquivo', 'erro');
            };

            reader.readAsText(file, 'ISO-8859-1');
        } catch (error) {
            console.error('Erro ao processar arquivo:', error);
            loadingSpan.style.display = 'none';
            mostrarNotificacao('Erro ao processar o arquivo', 'erro');
        }
    });
}

function processAndNormalizeData(data) {
    try {
        const processedData = data.map(row => {
            const newRow = {};
            // Standardize keys
            for (const key in row) {
                if (Object.prototype.hasOwnProperty.call(row, key)) {
                    const newKey = key.trim(); // Keep original case for mapping, just trim whitespace
                    newRow[newKey] = row[key];
                }
            }

            // Manual mapping for known columns
            const ticketNumber = newRow['Núm'] || newRow['numero'] || newRow['Ticket'] || newRow['ID'];
            if (!ticketNumber) {
                return null; // Skip rows without a ticket number
            }

            const demanda = {
                numero: ticketNumber,
                categoria: newRow['Categoria'] || '',
                projeto: getNomeAmigavelProjeto(newRow['Projeto']) || '',
                atribuicao: newRow['Atribuído a'] || '',
                estado: (newRow['Estado'] || '').toLowerCase().trim(),
                data_abertura: newRow['Data de Envio'] || '',
                ultima_atualizacao: newRow['Atualizado'] || '',
                resumo: newRow['Resumo'] || '',
                ordem_plnj: newRow['Ordem_Plnj'] || '',
                data_prometida: newRow['Data_Prometida'] || '',
                squad: newRow['Squad'] || '',
                resp_atual: newRow['Resp_atual'] || '',
                solicitante: newRow['Solicitante'] || '',
                status: newRow['Status'] || ''
            };

            return demanda;
        }).filter(Boolean); // Remove null entries

        if (processedData.length === 0 && data.length > 0) {
            mostrarNotificacao('Nenhum dado válido foi encontrado no arquivo CSV. Verifique se o arquivo contém uma coluna de identificação para os tickets (ex: "Núm", "Ticket", "ID") e se ela está preenchida.', 'aviso');
        }
        
        return processedData;

    } catch (error) {
        console.error('Erro ao processar dados:', error);
        mostrarNotificacao('Ocorreu um erro ao processar os dados do arquivo. Verifique o console para mais detalhes.', 'erro');
        return [];
    }
}

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    
    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase().trim();
        
        let searchFilteredData;
        if (searchTerm === '') {
            searchFilteredData = [...demandasData];
        } else {
            searchFilteredData = demandasData.filter(demanda => {
                if (demanda.numero && demanda.numero.toLowerCase().includes(searchTerm)) {
                    return true;
                }
                
                return Object.values(demanda).some(value => {
                    if (typeof value === 'string') {
                        return value.toLowerCase().includes(searchTerm);
                    }
                    return false;
                });
            });
        }
        
        // Aplicar a regra especial para categoria "Suporte Informatica" também na busca
        filteredData = searchFilteredData.filter(demanda => {
            // Regra especial para categoria "Suporte Informatica"
            // Só incluir se tiver um responsável atual definido (campo resp_atual)
            // Caso não tenha um resp_atual definido e/ou esteja em branco/nulo, não deve ser contabilizado
            if (demanda.categoria && demanda.categoria.toLowerCase().trim() === 'suporte informatica') {
                if (!demanda.resp_atual || demanda.resp_atual.trim() === '') {
                    return false; // Excluir chamados de Suporte Informatica sem responsável atual
                }
            }
            return true;
        });
        
        currentPage = 1;
        updateDashboard();
    });
}

function setupFilters() {
    const filterIds = [
        'filter-status',
        'filter-estado',
        'filter-categoria',
        'filter-resp_atual',
        'filter-atribuicao',
        'filter-data-inicial',
        'filter-data-final'
    ];
    
    filterIds.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', filterData);
        }
    });

    const squadSelect = document.getElementById('filter-squad');
    if (squadSelect) {
        if (!squadSelect.choicesInstance) {
            squadSelect.choicesInstance = new Choices(squadSelect, {
                removeItemButton: true,
                searchEnabled: true,
                placeholder: true,
                placeholderValue: 'Equipe',
                shouldSort: true,
                position: 'bottom',
                itemSelectText: '',
            });
        }
        squadSelect.addEventListener('change', () => {
            const selected = Array.from(squadSelect.selectedOptions).map(opt => opt.value).filter(Boolean);
            selectedSquadFilter = new Set(selected);
            filterData();
        });
    }
}

function updateFilterOptions() {
    const filters = {
        status: new Set(),
        estado: new Set(),
        categoria: new Set(),
        resp_atual: new Set(),
        atribuicao: new Set(),
        squad: new Set(),
    };

    const filterLabels = {
        status: 'Status',
        estado: 'Estado',
        categoria: 'Categoria',
        resp_atual: 'Responsável Atual',
        atribuicao: 'Analista Responsável',
        squad: 'Equipe'
    };
    
    demandasData.forEach(demanda => {
        Object.keys(filters).forEach(key => {
            if (key === 'status') {
                // Para o campo status, usar o valor do campo 'Status' do CSV
                if (demanda.status) {
                    filters[key].add(demanda.status);
                }
            } else if (demanda[key]) {
                filters[key].add(demanda[key]);
            }
        });
    });
    Object.entries(filters).forEach(([key, values]) => {
        const selectId = `filter-${key}`;
        const select = document.getElementById(selectId);
        if (select) {
            const selectedValue = select.value;
            if (key === 'squad') {
                if (select.choicesInstance) {
                    select.choicesInstance.clearChoices();
                    select.choicesInstance.setChoices(
                        Array.from(values).sort().map(value => ({ value, label: value, selected: selectedSquadFilter.has(value) })),
                        'value', 'label', false
                    );
                } else {
                    select.innerHTML = `<option value="">${filterLabels[key]}</option>`;
                    Array.from(values).sort().forEach(value => {
                        const option = document.createElement('option');
                        option.value = value;
                        option.textContent = value;
                        select.appendChild(option);
                    });
                }
            } else {
                select.innerHTML = `<option value="">${filterLabels[key]}</option>`;
                Array.from(values).sort().forEach(value => {
                    const option = document.createElement('option');
                    option.value = value;
                    option.textContent = value;
                    select.appendChild(option);
                });
                select.value = selectedValue;
            }
        }
    });
}

function filterData() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const filters = {
        status: document.getElementById('filter-status').value,
        estado: document.getElementById('filter-estado').value,
        categoria: document.getElementById('filter-categoria').value,
        resp_atual: document.getElementById('filter-resp_atual').value,
        atribuicao: document.getElementById('filter-atribuicao').value,
        dataInicial: document.getElementById('filter-data-inicial').value,
        dataFinal: document.getElementById('filter-data-final').value
    };
    
    // Debug: início do filtro
    if (window.DEBUG_DASHBOARD) {
        try {
            console.log('[filterData] start', {
                demandasCount: Array.isArray(demandasData) ? demandasData.length : 0,
                selectedStatus: Array.from(selectedStatusFilter || []),
                filters
            });
        } catch {}
    }
    
    const demandasCountBeforeFilter = demandasData.length;
    filteredData = demandasData.filter(demanda => {
        // Regra especial para categoria "Suporte Informatica"
        // Só incluir se tiver um responsável atual definido (campo resp_atual)
        // Caso não tenha um resp_atual definido e/ou esteja em branco/nulo, não deve ser contabilizado
        if (demanda.categoria && demanda.categoria.toLowerCase().trim() === 'suporte informatica') {
            if (!demanda.resp_atual || demanda.resp_atual.trim() === '') {
                return false; // Excluir chamados de Suporte Informatica sem responsável atual
            }
        }

        // Se nenhum projeto estiver selecionado, não filtra por projeto
        if (selectedProjetoFilter.size > 0 && !selectedProjetoFilter.has(demanda.projeto)) {
            return false;
        }

        if (selectedSquadFilter.size > 0 && !selectedSquadFilter.has(demanda.squad)) {
            return false;
        }

        if (searchTerm && !Object.values(demanda).some(value => 
            String(value).toLowerCase().includes(searchTerm)
        )) return false;
        
        const filtrosBasicos = Object.entries(filters).every(([key, value]) => {
            if (!value) return true;
            if (key === 'dataInicial' || key === 'dataFinal') return true;
            if (key === 'status') {
                return demanda.status === value;
            }
            return demanda[key] === value;
        });
        if (!filtrosBasicos) return false;
        
        if (filters.dataInicial || filters.dataFinal) {
            if (!demanda.data_abertura) return false;

            const dataDemanda = parseDateBR(demanda.data_abertura);
            if (!dataDemanda) return false;

            dataDemanda.setHours(0, 0, 0, 0);

            if (filters.dataInicial) {
                const dataInicial = new Date(filters.dataInicial + 'T00:00:00');
                if (dataDemanda < dataInicial) return false;
            }
            if (filters.dataFinal) {
                const dataFinal = new Date(filters.dataFinal + 'T00:00:00');
                if (dataDemanda > dataFinal) return false;
            }
        }
        return true;
    });
    
    currentPage = 1;
    // Debug: resultado do filtro
    if (window.DEBUG_DASHBOARD) {
        try {
            console.log('[filterData] end', {
                filteredCount: Array.isArray(filteredData) ? filteredData.length : 0
            });
        } catch {}
    }
    updateDashboard();
}

function compareCol(a, b, col) {
    if (col === 'dataAbertura') {
        const dateA = parseDateBR(a.data_abertura);
        const dateB = parseDateBR(b.data_abertura);

        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        
        return dateA - dateB;
    }

    if (col === 'ordem_plnj') {
        const valorA = parseInt(a[col], 10) || 0;
        const valorB = parseInt(b[col], 10) || 0;
        return valorA - valorB;
    }
    
    if (col === 'tempoTotal') {
        const valorA = parseFloat(a[col]) || 0;
        const valorB = parseFloat(b[col]) || 0;
        return valorA - valorB;
    }
    
    const valorA = a[col] || '';
    const valorB = b[col] || '';
    return valorA.localeCompare(valorB);
}

function setupPagination() {
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    const rowsSelect = document.getElementById('registrosPorPagina');
    
    prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            updateDashboard();
        }
    });
    
    nextBtn.addEventListener('click', () => {
        const maxPage = Math.ceil(filteredData.length / rowsPerPage);
        if (currentPage < maxPage) {
            currentPage++;
            updateDashboard();
        }
    });
    
    if (rowsSelect) {
    rowsSelect.addEventListener('change', (e) => {
        rowsPerPage = parseInt(e.target.value);
        currentPage = 1;
        updateDashboard();
    });
    }
}

function updateDashboard() {
    if (!demandasData || demandasData.length === 0) {
        updateKPIs();
        updateTable();
        updatePaginationControls();
        return;
    }

    updateKPIs();
    updateCharts();
    updateTable();
    updatePaginationControls();
}

function updateKPIs() {
    if (!demandasData || demandasData.length === 0) {
        document.querySelector('#kpi-total-chamados .kpi-value-modern').textContent = '0';
        document.querySelector('#kpi-abertos-hoje .kpi-value-modern').textContent = '0';
        document.querySelector('#kpi-resolvidos-hoje .kpi-value-modern').textContent = '0';
        document.querySelector('#kpi-ytd .kpi-value-modern').textContent = '0';
        document.querySelector('#kpi-fila .kpi-value-modern').textContent = '0';
        document.querySelector('#kpi-variacao .kpi-value-modern').textContent = '0%';
        return;
    }

    const dadosParaAnalise = filteredData;
    
    const totalDemandas = dadosParaAnalise.length;
    
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const demandasAbertasHoje = dadosParaAnalise.filter(demanda => {
        if (!demanda.data_abertura) return false;
        const dataAbertura = parseDateBR(demanda.data_abertura);
        if (!dataAbertura) return false;
        dataAbertura.setHours(0, 0, 0, 0);
        return dataAbertura.getTime() === hoje.getTime();
    }).length;

    const demandasResolvidasHoje = dadosParaAnalise.filter(demanda => {
        if (!demanda.data_fechamento) return false;
        const dataFechamento = parseDateBR(demanda.data_fechamento);
        if (!dataFechamento) return false;
        dataFechamento.setHours(0, 0, 0, 0);
        return dataFechamento.getTime() === hoje.getTime();
    }).length;

    const demandasNaFila = dadosParaAnalise.filter(demanda => {
        return ['iniciado', 'aberto', 'vencido', 'atenção'].includes(demanda.estado);
    });

    const demandasYTD = dadosParaAnalise.filter(demanda => {
        if (!demanda.data_abertura) return false;
        const dataAbertura = parseDateBR(demanda.data_abertura);
        if (!dataAbertura) return false;
        dataAbertura.setHours(0, 0, 0, 0);
        return dataAbertura.getTime() < hoje.getTime();
    }).length;

    const variacaoAno = totalDemandas > 0 ? ((demandasYTD - totalDemandas) / totalDemandas) * 100 : 0;

    document.querySelector('#kpi-total-chamados .kpi-value-modern').textContent = totalDemandas;
    document.querySelector('#kpi-abertos-hoje .kpi-value-modern').textContent = demandasAbertasHoje;
    document.querySelector('#kpi-resolvidos-hoje .kpi-value-modern').textContent = demandasResolvidasHoje;
    document.querySelector('#kpi-ytd .kpi-value-modern').textContent = demandasYTD;
    document.querySelector('#kpi-fila .kpi-value-modern').textContent = demandasNaFila.length;
    document.querySelector('#kpi-variacao .kpi-value-modern').textContent = variacaoAno.toFixed(0) + '%';
}

function parseDateBR(dataStr) {
    if (!dataStr || dataStr === 'N/A') return null;

    // Handle YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(dataStr.trim())) {
        const dataObj = new Date(dataStr.trim() + 'T00:00:00');
        if (!isNaN(dataObj.getTime())) {
            return dataObj;
        }
    }

    if (dataStr.includes('T') && dataStr.includes('-')) {
        const dataISO = new Date(dataStr);
        if (!isNaN(dataISO.getTime())) {
            return dataISO;
        }
    }

    try {
        const parts = dataStr.trim().split(' ');
        const datePart = parts[0];
        const timePart = parts[1] || '00:00:00';

        const [day, month, year] = datePart.split('/').map(Number);
        const [hours, minutes, seconds] = timePart.split(':').map(Number);

        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
            const dataObj = new Date(year, month - 1, day, hours || 0, minutes || 0, seconds || 0);
            if (!isNaN(dataObj.getTime())) return dataObj;
        }
    } catch (e) { /* Ignora o erro e prossegue para o log final */ }

    console.log(`Falha ao converter a string de data: ${dataStr}`);
    return null;
}

function updateCharts() {
    updateDemandasPorMes();
    updateDemandasPorStatus();
    updateDemandasPorProjeto();
    updateDemandasPorSquad();
    updateDemandasPorAtribuicao();
    updateHorasPorPrioridade();
    updateDemandasPorHora();
    updateHorasPorAtribuicao();
}

function applyChartFilter(filterKey, value) {
    const select = document.getElementById(`filter-${filterKey}`);
    if (select) {
        if (select.value === value) {
            select.value = '';
        } else {
            select.value = value;
        }
        filterData();
    }
}

function addChartClickEvents() {
    if (window.demandasPorStatusChart) {
        window.demandasPorStatusChart.options.onClick = function(evt, elements) {
            if (elements.length > 0) {
                const idx = elements[0].index;
                const label = this.data.labels[idx];
                applyChartFilter('estado', label);
            }
        };
        window.demandasPorStatusChart.update();
    }
    if (window.demandasPorProjetoChart) {
        window.demandasPorProjetoChart.options.onClick = function(evt, elements) {
            if (elements.length > 0) {
                const tree = this.data.datasets[0].tree;
                const idx = elements[0].index;
                const label = tree[idx]?.label?.replace(/ \(.+\)$/, '');
                applyChartFilter('projeto', label);
            }
        };
        window.demandasPorProjetoChart.update();
    }
    if (window.demandasPorPrioridadeChart) {
        window.demandasPorPrioridadeChart.options.onClick = function(evt, elements) {
            if (elements.length > 0) {
                const idx = elements[0].index;
                const label = this.data.labels[idx];
                applyChartFilter('status', label);
            }
        };
        window.demandasPorPrioridadeChart.update();
    }
    if (window.demandasPorSquadChart) {
        window.demandasPorSquadChart.options.onClick = function(evt, elements) {
            if (elements.length > 0) {
                const idx = elements[0].index;
                const label = this.data.labels[idx]?.replace(/ \(.+\)$/, '');
                applyChartFilter('squad', label);
            }
        };
        window.demandasPorSquadChart.update();
    }
    if (window.demandasPorAtribuicaoChart) {
        window.demandasPorAtribuicaoChart.options.onClick = function(evt, elements) {
            if (elements.length > 0) {
                const idx = elements[0].index;
                const label = this.data.labels[idx];
                applyChartFilter('atribuicao', label);
            }
        };
        window.demandasPorAtribuicaoChart.update();
    }
}

function updateDemandasPorMes() {
    const canvas = document.getElementById('chamadosPorMes');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (window.demandasPorMesChart) {
        window.demandasPorMesChart.destroy();
    }
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    const data = Array(12).fill(0);
    filteredData.forEach(c => {
        if (c.data_abertura) {
            const dataAbertura = parseDateBR(c.data_abertura);
            if (dataAbertura) {
                const mes = dataAbertura.getMonth();
                data[mes]++;
            }
        }
    });
    
    window.demandasPorMesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: meses,
            datasets: [{
                label: 'Demandas Abertas',
                data: data,
                backgroundColor: 'rgba(52, 152, 219, 0.8)',
                borderColor: '#3498db',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Demandas abertas por mês',
                    font: {
                        size: 16
                    }
                },
                legend: {
                    display: true
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function updateDemandasPorStatus() {
    const canvas = document.getElementById('chamadosPorStatus');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (window.demandasPorStatusChart) {
        window.demandasPorStatusChart.destroy();
    }
    const status = [...new Set(filteredData.map(c => c.estado))];
    
    const data = status.map(s => ({
        status: s,
        count: filteredData.filter(c => c.estado === s).length
    }));
    
    window.demandasPorStatusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(d => d.status),
            datasets: [{
                data: data.map(d => d.count),
                backgroundColor: [
                    '#3498db', '#2ecc71', '#e74c3c', '#f1c40f', '#9b59b6',
                    '#1abc9c', '#d35400', '#34495e', '#7f8c8d', '#16a085'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Demandas por Status',
                    font: {
                        size: 16
                    }
                },
                legend: {
                    display: true,
                    position: 'right'
                }
            }
        }
    });
}

function updateDemandasPorProjeto() {
    const canvas = document.getElementById('chamadosPorProjeto');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (window.demandasPorProjetoChart) {
        window.demandasPorProjetoChart.destroy();
    }
    const projetos = [...new Set(filteredData.map(c => c.projeto).filter(p => p && p !== 'indefinido'))];
    const data = projetos.map(p => ({
        projeto: p,
        count: filteredData.filter(c => c.projeto === p).length
    }));
    window.demandasPorProjetoChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => `${d.projeto} (${d.count})`),
            datasets: [{
                label: 'Demandas por Projeto',
                data: data.map(d => d.count),
                backgroundColor: '#3498db'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                title: {
                    display: true,
                    text: 'Demandas por Projeto',
                    font: {
                        size: 16
                    }
                },
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Quantidade de Demandas'
                    }
                }
            }
        }
    });
}

function updateDemandasPorSquad() {
    const canvas = document.getElementById('chamadosPorSquad');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (window.demandasPorSquadChart) {
        window.demandasPorSquadChart.destroy();
    }
    const squads = [...new Set(filteredData.map(c => c.squad).filter(s => s && s !== 'indefinido'))];
    
    const data = squads.map(s => ({
        squad: s,
        count: filteredData.filter(c => (c.squad || '').toLowerCase().trim() === s.toLowerCase().trim() && c.data_abertura).length
    }));
    
    window.demandasPorSquadChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => `${d.squad} (${d.count})`),
            datasets: [{
                label: 'Demandas por Squad',
                data: data.map(d => d.count),
                backgroundColor: '#3498db'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                title: {
                    display: true,
                    text: 'Demandas por Squad',
                    font: {
                        size: 16
                    }
                },
                legend: {
                    display: false
                }
            }
        }
    });
}

function updateDemandasPorStatus() {
    const canvas = document.getElementById('chamadosPorPrioridade');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (window.demandasPorPrioridadeChart) {
        window.demandasPorPrioridadeChart.destroy();
    }
    const status = [...new Set(filteredData.map(c => c.status))];
    
    const data = status.map(s => ({
        status: s,
        count: filteredData.filter(c => c.status === s).length
    }));
    
    window.demandasPorPrioridadeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.status),
            datasets: [{
                label: 'Demandas por Status',
                data: data.map(d => d.count),
                backgroundColor: '#3498db'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Demandas por Status',
                    font: {
                        size: 16
                    }
                }
            },
            indexAxis: 'y'
        }
    });
}

function updateDemandasPorHora() {
    const canvas = document.getElementById('chamadosPorHora');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (window.demandasPorHoraChart) {
        window.demandasPorHoraChart.destroy();
    }
    const horas = Array.from({length: 24}, (_, i) => i.toString().padStart(2, '0'));
    
    const data = horas.map(h => ({
        hora: h,
        count: filteredData.filter(c => {
            if (!c.data_abertura) return false;
            const partes = String(c.data_abertura).split(' ');
            if (partes.length < 2) return false;
            const horaDemanda = partes[1].split(':')[0];
            return horaDemanda === h;
        }).length
    }));
    
    window.demandasPorHoraChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: horas.map(h => `${h}:00`),
            datasets: [{
                label: 'Média de Demandas',
                data: data.map(d => d.count),
                backgroundColor: '#3498db'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Média de Demandas por Hora',
                    font: {
                        size: 16
                    }
                }
            }
        }
    });
}

function updateDemandasPorAtribuicao() {
    const canvas = document.getElementById('chamadosPorAtribuicao');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (window.demandasPorAtribuicaoChart) {
        window.demandasPorAtribuicaoChart.destroy();
    }
    const atribuicoes = [...new Set(filteredData.map(c => c.atribuicao))];
    
    const data = atribuicoes.map(a => ({
        atribuicao: a,
        count: filteredData.filter(c => c.atribuicao === a && c.data_abertura).length
    }));
    
    window.demandasPorAtribuicaoChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.atribuicao),
            datasets: [{
                label: 'Demandas por Atribuição',
                data: data.map(d => d.count),
                backgroundColor: '#3498db'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Demandas por atribuição',
                    font: {
                        size: 16
                    }
                }
            }
        }
    });
}

function updateHorasPorPrioridade() {
    const canvas = document.getElementById('horasPorPrioridade');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (window.horasPorPrioridadeChart) {
        window.horasPorPrioridadeChart.destroy();
    }
    const prioridades = [...new Set(filteredData.map(c => c.prioridade))];
    
    const data = prioridades.map(p => {
        const demandasPrioridade = filteredData.filter(c => c.prioridade === p);
        const totalHoras = demandasPrioridade.reduce((sum, c) => {
            return sum + (parseFloat(c.tempo_total_prioridade) || 0);
        }, 0);
        
        return {
            prioridade: p,
            totalHoras: totalHoras
        };
    });
    
    window.horasPorPrioridadeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.prioridade),
            datasets: [{
                label: 'Total de Horas',
                data: data.map(d => d.totalHoras),
                backgroundColor: '#3498db'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Total de Horas por Prioridade',
                    font: {
                        size: 16
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Horas'
                    }
                }
            }
        }
    });
}

function updateHorasPorAtribuicao() {
    const canvas = document.getElementById('horasPorAtribuicao');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (window.horasPorAtribuicaoChart) {
        window.horasPorAtribuicaoChart.destroy();
    }
    const atribuicoes = [...new Set(filteredData.map(c => c.atribuicao).filter(a => a && a !== 'indefinido'))];
    const data = atribuicoes.map(a => {
        const demandasAtribuicao = filteredData.filter(c => (c.atribuicao || '').toLowerCase().trim() === a.toLowerCase().trim());
        const totalHoras = demandasAtribuicao.reduce((sum, c) => {
            const horas = parseFloat(c.tempo_total_prioridade);
            return sum + (isNaN(horas) ? 0 : horas);
        }, 0);
        return {
            atribuicao: a,
            totalHoras: totalHoras
        };
    }).filter(d => d.totalHoras > 0);
    window.horasPorAtribuicaoChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => `${d.atribuicao} (${d.totalHoras.toFixed(1)}h)`),
            datasets: [{
                label: 'Total de Horas por Atribuição',
                data: data.map(d => d.totalHoras),
                backgroundColor: '#9b59b6'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                title: {
                    display: true,
                    text: 'Total de Horas por Atribuição',
                    font: {
                        size: 16
                    }
                },
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Horas'
                    }
                }
            }
        }
    });
}

function updateTable() {
    const tbody = document.querySelector('#chamadosTable tbody');
    if (!tbody) return;

    ensureRecentStyle();
    cleanupRecentlyUpdated();

    tbody.innerHTML = '';
    
    console.log('updateTable - demandasData:', demandasData);
    console.log('updateTable - demandasData.length:', demandasData ? demandasData.length : 0);
    
    if (!demandasData || demandasData.length === 0) {
        console.log('Nenhum dado encontrado para exibir');
        
        // Criar uma linha de teste para demonstrar o dropdown
        const testRow = document.createElement('tr');
        testRow.setAttribute('data-demanda', 'TESTE');
        
        // Criar células vazias para todas as colunas
        for (let i = 0; i < 14; i++) {
            const td = document.createElement('td');
            td.className = 'col-center';
            td.textContent = i === 0 ? 'TESTE-001' : (i === 2 ? 'Projeto Teste' : (i === 3 ? 'Descrição Teste' : ''));
            testRow.appendChild(td);
        }
        
        // Adicionar célula com dropdown de status
        const statusTd = document.createElement('td');
        statusTd.className = 'col-center';
        createStatusDropdown(statusTd, 'Desenvolvimento', 'TESTE-001');
        testRow.appendChild(statusTd);
        
        tbody.appendChild(testRow);
        
        const pageInfo = document.getElementById('pageInfo');
        if (pageInfo) {
            pageInfo.textContent = 'Página 1 de 1 (Dados de Teste)';
        }
        return;
    }
    
    const dataToShow = filteredData;
    
    // Determina se devemos aplicar filtro de estado baseado em interseção com o dataset
    const estadosNoDataset = new Set(dataToShow.map(d => d.estado).filter(Boolean));
    const shouldFilterByEstado = selectedStatusFilter && selectedStatusFilter.size > 0 && Array.from(selectedStatusFilter).some(s => estadosNoDataset.has(s));
    const filteredByStatus = shouldFilterByEstado
        ? dataToShow.filter(demanda => selectedStatusFilter.has(demanda.estado))
        : dataToShow;
    
    if (window.DEBUG_DASHBOARD) {
        try {
            console.log('[updateTable] rows before status filter:', dataToShow.length, 'after:', filteredByStatus.length, { shouldFilterByEstado, estadosNoDataset: Array.from(estadosNoDataset).slice(0, 10) });
        } catch {}
    }

    filteredByStatus.sort((a, b) => {
        if (sortColumn === 'default') {
            // Ordenação padrão: Ordem_plnj ASC, Atualizado DESC, Núm DESC
            const ordemPlnjA = a.ordem_plnj || '';
            const ordemPlnjB = b.ordem_plnj || '';
            if (ordemPlnjA !== ordemPlnjB) {
                const numA = parseInt(ordemPlnjA, 10) || 0;
                const numB = parseInt(ordemPlnjB, 10) || 0;
                if (numA !== numB) {
                    return numA - numB;
                }
            }

            const atualizadoA = parseDateBR(a.ultima_atualizacao);
            const atualizadoB = parseDateBR(b.ultima_atualizacao);
            if (atualizadoA && atualizadoB) {
                if (atualizadoA.getTime() !== atualizadoB.getTime()) {
                    return atualizadoB - atualizadoA;
                }
            } else if (atualizadoA) {
                return -1;
            } else if (atualizadoB) {
                return 1;
            }

            const numA = parseInt(a.numero) || 0;
            const numB = parseInt(b.numero) || 0;
            return numB - numA;
        }

        if (sortColumn === 'numero') {
            const numA = parseInt(a.numero) || 0;
            const numB = parseInt(b.numero) || 0;
            return (numA - numB) * sortDirection;
        }
        return compareCol(a, b, sortColumn) * sortDirection;
    });
    
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const pageData = filteredByStatus.slice(start, end);
    
    // Atualizar estado do botão massivo conforme seleção
    const massEditBtn = document.getElementById('massEditBtn');
    if (massEditBtn) {
        massEditBtn.disabled = selectedTickets.size === 0;
    }

    pageData.forEach(demanda => {
        const row = document.createElement('tr');
        row.setAttribute('data-demanda', demanda.numero);
        row.className = 'status-dropdown-row';

        // Marcação de linha inteira se o status (custom CF 70) estiver vazio
        const isStatusEmptyForRow = String(demanda.status || '').trim() === '';
        if (isStatusEmptyForRow) {
            row.classList.add('status-empty-row');
        }

        // Coluna de seleção
        const selectTd = document.createElement('td');
        selectTd.className = 'col-center';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'ticket-select-cb';
        cb.dataset.numero = demanda.numero;
        cb.checked = selectedTickets.has(demanda.numero);
        cb.addEventListener('change', () => {
            toggleSelectTicket(demanda.numero, cb.checked);
            // Atualiza header checkbox (selecionar todos) estado
            syncSelectAllCheckboxForPage();
        });
        selectTd.appendChild(cb);
        row.appendChild(selectTd);

        const colunas = [
            demanda.numero || '',
            demanda.categoria || '',
            getNomeAmigavelProjeto(demanda.projeto) || '',
            decodificarTexto(demanda.resumo) || '',
            demanda.squad || '',
            demanda.atribuicao || '',
            demanda.resp_atual || '',
            demanda.solicitante || '',
            demanda.estado || '',
            formatarDataAmigavel(demanda.data_abertura) || '',
            formatarDataAmigavel(demanda.data_prometida) || '',
            formatarDataAmigavel(demanda.ultima_atualizacao) || '',
            demanda.ordem_plnj || '',
            demanda.previsao_etapa || '',
            demanda.status || '',
            formatarHorasMinutos(calcularTempoTotal(demanda)) || ''
        ];
        colunas.forEach((valor, index) => {
            const td = document.createElement('td');
            if (index === 2 || index === 3) { // Alinhar colunas de texto à esquerda
                td.className = 'col-left';
            } else {
                td.className = 'col-center';
            }

            if (index === 0 && valor) {
                const link = document.createElement('a');
                link.href = window.AppConfig.getMantisViewUrl(valor);
                link.textContent = valor;
                link.target = '_blank';
                link.style.color = '#0066cc';
                link.style.textDecoration = 'none';
                link.style.cursor = 'pointer';
                
                link.addEventListener('mouseover', () => {
                    link.style.textDecoration = 'underline';
                });
                link.addEventListener('mouseout', () => {
                    link.style.textDecoration = 'none';
                });
                
                td.appendChild(link);

                if (isRecentlyUpdated(demanda.numero)) {
                    const badge = document.createElement('span');
                    badge.className = 'badge-updated';
                    badge.textContent = 'Atualizado';
                    td.appendChild(badge);
                }
            } else if (index === 3) { // Descrição com tooltip
                td.textContent = valor;
                td.setAttribute('title', decodificarTexto(demanda.resumo) || '');
            } else if (index === 4) { // Equipe
                td.textContent = valor;
                if (ENABLE_INLINE_EDIT) {
                    td.classList.add('clickable-cell');
                    td.addEventListener('click', () => {
                        console.log('Clicou na célula Equipe:', valor, demanda.numero);
                        createSimpleUpdateModal(demanda.numero, valor, 'Atualizar Equipe', SQUAD_OPTIONS, 49, td);
                    });
                }
            } else if (index === 5) { // Analista Responsavel
                td.textContent = valor;
                if (ENABLE_INLINE_EDIT) {
                    td.classList.add('clickable-cell');
                    td.addEventListener('click', () => {
                        console.log('Clicou na célula Analista Responsável:', valor, demanda.numero);
                        createSimpleUpdateModal(demanda.numero, valor, 'Atualizar Analista Responsável', ANALISTA_RESPONSAVEL_OPTIONS, 65, td);
                    });
                }
            } else if (index === 6) { // Responsavel Atual
                td.textContent = valor;
                if (ENABLE_INLINE_EDIT) {
                    td.classList.add('clickable-cell');
                    td.addEventListener('click', () => {
                        console.log('Clicou na célula Responsável Atual:', valor, demanda.numero);
                        createSimpleUpdateModal(demanda.numero, valor, 'Atualizar Responsável Atual', RESPONSAVEL_ATUAL_OPTIONS, 69, td);
                    });
                }
            } else if (index === 13) { // Previsão Etapa: formatar como dd/mm/yyyy
                const s = String(valor || '').trim();
                let out = '';
                if (s) {
                    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
                        const [y, m, d] = s.split('-');
                        out = `${d}/${m}/${y}`;
                    } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
                        out = s;
                    } else {
                        const ts = Date.parse(s);
                        if (!Number.isNaN(ts)) {
                            const d = new Date(ts);
                            const dd = String(d.getDate()).padStart(2, '0');
                            const mm = String(d.getMonth() + 1).padStart(2, '0');
                            out = `${dd}/${mm}/${d.getFullYear()}`;
                        } else {
                            out = s;
                        }
                    }
                }
                td.textContent = out;
            } else if (index === 14) { // Status (custom CF 70): mostrar traço quando vazio (ajustado após inserir Previsão Etapa)
                const isEmpty = String(valor).trim() === '';
                td.textContent = isEmpty ? '—' : valor;
            } else {
                td.textContent = valor;
            }
            row.appendChild(td);
        });

        // Adicionar a nova célula de Ações com o botão Editar
        const actionsTd = document.createElement('td');
        actionsTd.className = 'col-center';

        const editButton = document.createElement('button');
        editButton.textContent = 'Editar';
        editButton.className = 'edit-btn'; // Adicionar uma classe para estilização
        editButton.addEventListener('click', () => {
            console.log('Botão Editar clicado para a demanda:', demanda);
            createUnifiedEditModal(demanda);
        });

        actionsTd.appendChild(editButton);
        row.appendChild(actionsTd);

        if (isRecentlyUpdated(demanda.numero)) {
            row.classList.add('recently-updated');
        }
        tbody.appendChild(row);
    });

    // Sincroniza estado do checkbox Selecionar Todos após render da página
    syncSelectAllCheckboxForPage();

    const totalPages = Math.ceil(filteredByStatus.length / rowsPerPage);
    currentPage = Math.min(currentPage, totalPages);
    if (currentPage < 1) currentPage = 1;
    
    updatePaginationControls();
    applyColumnVisibility();
}



function updatePaginationControls() {
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    const pageInfo = document.getElementById('pageInfo');
    
    const dataToShow = filteredData;
    const filteredByStatus = dataToShow.filter(demanda => {
        return selectedStatusFilter.has(demanda.estado);
    });
    
    const maxPage = Math.ceil(filteredByStatus.length / rowsPerPage);
    
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === maxPage;
    
    pageInfo.textContent = `Página ${currentPage} de ${maxPage}`;
}

function setupExport() {
    const exportExcel = document.getElementById('exportExcel');
    const exportCSV = document.getElementById('exportCSV');
    
    if (exportExcel) {
        exportExcel.addEventListener('click', () => {
            exportToExcel();
        });
    }
    
    if (exportCSV) {
        exportCSV.addEventListener('click', () => {
            exportToCSV();
        });
    }
}

function exportToExcel() {
    if (filteredData.length === 0) {
        mostrarNotificacao('Não há dados para exportar.', 'aviso');
        return;
    }
    
    const ws = XLSX.utils.json_to_sheet(filteredData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Demandas");
    XLSX.writeFile(wb, "demandas.xlsx");
}

function exportToCSV() {
    if (filteredData.length === 0) {
        mostrarNotificacao('Não há dados para exportar.', 'aviso');
        return;
    }
    
    const csv = Papa.unparse(filteredData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'demandas.csv';
    link.click();
}

function initCharts() {
    updateDemandasPorMes();
    updateDemandasPorStatus();
    updateDemandasPorProjeto();
    updateDemandasPorSquad();
    updateDemandasPorAtribuicao();
    updateHorasPorPrioridade();
    updateDemandasPorHora();
    updateHorasPorAtribuicao();
}

function addTableSortListeners() {
    const ths = document.querySelectorAll('#chamadosTable th[data-sort]');
    
    ths.forEach(th => {
        th.addEventListener('click', () => {
            const sortKey = th.getAttribute('data-sort');
            if (sortColumn === sortKey) {
                sortDirection *= -1;
            } else {
                sortColumn = sortKey;
                sortDirection = 1;
            }
            updateTable();
        });
    });
}

// ===== Seleção massiva: setup e utilitários =====
function setupMassSelectionControls() {
    const selectAll = document.getElementById('selectAllTickets');
    const massEditBtn = document.getElementById('massEditBtn');
    if (selectAll) {
        selectAll.addEventListener('change', () => {
            toggleSelectAllOnCurrentPage(selectAll.checked);
        });
    }
    if (massEditBtn) {
        massEditBtn.addEventListener('click', () => {
            if (selectedTickets.size === 0) return;
            createMassEditModal(Array.from(selectedTickets));
        });
    }
}

function toggleSelectAllOnCurrentPage(checked) {
    // Opera sobre os checkboxes atualmente renderizados (página visível)
    const cbs = document.querySelectorAll('#chamadosTable tbody .ticket-select-cb');
    cbs.forEach(cb => {
        cb.checked = checked;
        const numero = cb.dataset.numero;
        if (checked) {
            selectedTickets.add(numero);
        } else {
            selectedTickets.delete(numero);
        }
    });
    const massEditBtn = document.getElementById('massEditBtn');
    if (massEditBtn) massEditBtn.disabled = selectedTickets.size === 0;
    syncSelectAllCheckboxForPage();
}

function toggleSelectTicket(numero, isSelected) {
    if (isSelected) selectedTickets.add(numero); else selectedTickets.delete(numero);
    const massEditBtn = document.getElementById('massEditBtn');
    if (massEditBtn) massEditBtn.disabled = selectedTickets.size === 0;
}

function syncSelectAllCheckboxForPage() {
    const selectAll = document.getElementById('selectAllTickets');
    if (!selectAll) return;
    const cbs = Array.from(document.querySelectorAll('#chamadosTable tbody .ticket-select-cb'));
    const totalOnPage = cbs.length;
    const selectedOnPage = cbs.filter(cb => cb.checked).length;
    if (totalOnPage === 0) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
        return;
    }
    selectAll.checked = selectedOnPage === totalOnPage;
    selectAll.indeterminate = selectedOnPage > 0 && selectedOnPage < totalOnPage;
}

// Concorrência limitada
async function runWithConcurrency(items, worker, limit = 3) {
    const results = [];
    let i = 0;
    const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
        while (true) {
            const idx = i++;
            if (idx >= items.length) break;
            try {
                results[idx] = await worker(items[idx], idx);
            } catch (e) {
                results[idx] = { ok: false, error: e };
            }
        }
    });
    await Promise.all(runners);
    return results;
}

function getDemandaByNumero(numero) {
    return demandasData.find(d => d.numero === numero);
}

function calcularTempoTotal(demanda) {
    if (!demanda.data_abertura) return 0;
    const dataAbertura = parseDateBR(demanda.data_abertura);
    const dataFechamento = demanda.data_fechamento ? parseDateBR(demanda.data_fechamento) : new Date();
    if (!dataAbertura || !dataFechamento) return 0;
    return (dataFechamento - dataAbertura) / (1000 * 60 * 60); // em horas
}

function formatarDataAmigavel(dataStr) {
    if (!dataStr) return '';
    const data = parseDateBR(dataStr);
    if (!data) return '';
    return data.toLocaleDateString('pt-BR');
}

function formatarHorasMinutos(horas) {
    if (horas === null || isNaN(horas)) return '-';
    const h = Math.floor(horas);
    const m = Math.round((horas - h) * 60);
    return `${h}h ${m}m`;
}

function decodificarTexto(texto) {
    try {
        return decodeURIComponent(escape(texto));
    } catch (e) {
        return texto;
    }
}

async function atualizarContadorNotificacoes() {
    // Lógica para atualizar o contador de notificações, se necessário.
}

// Função para atualizar o campo "Última atualização" de uma demanda específica
async function updateDemandaLastUpdated(ticketNumber) {
    try {
        const now = new Date();
        const formattedDate = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')}`;
        
        // Atualizar no banco de dados local
        const db = await openDB();
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        // Buscar a demanda atual
        const getRequest = store.get(ticketNumber);
        
        return new Promise((resolve, reject) => {
            getRequest.onsuccess = () => {
                const demanda = getRequest.result;
                if (demanda) {
                    // Atualizar o campo ultima_atualizacao
                    demanda.ultima_atualizacao = formattedDate;
                    // Atualizar timestamp bruto para lógica híbrida
                    demanda.ultima_atualizacao_ts = now.getTime();
                    
                    // Salvar de volta no banco
                    const putRequest = store.put(demanda);
                    
                    putRequest.onsuccess = () => {
                        console.log(`Campo ultima_atualizacao atualizado para ticket ${ticketNumber}: ${formattedDate}`);
                        
                        // Atualizar também os dados em memória
                        const demandaIndex = demandasData.findIndex(d => d.numero === ticketNumber);
                        if (demandaIndex !== -1) {
                            demandasData[demandaIndex].ultima_atualizacao = formattedDate;
                            // Garantir que o timestamp também é refletido em memória
                            demandasData[demandaIndex].ultima_atualizacao_ts = demanda.ultima_atualizacao_ts;
                        }
                        
                        // Atualizar a exibição da última atualização global
                        updateGlobalLastUpdated(formattedDate);
                        
                        // Recarregar a tabela para mostrar a nova data
                        filterData();
                        
                        resolve(formattedDate);
                    };
                    
                    putRequest.onerror = () => {
                        console.error('Erro ao salvar demanda atualizada no banco de dados');
                        reject(new Error('Erro ao salvar demanda atualizada'));
                    };
                } else {
                    console.warn(`Demanda ${ticketNumber} não encontrada no banco de dados local`);
                    resolve(null);
                }
            };
            
            getRequest.onerror = () => {
                console.error('Erro ao buscar demanda no banco de dados');
                reject(new Error('Erro ao buscar demanda'));
            };
        });
    } catch (error) {
        console.error('Erro ao atualizar ultima_atualizacao:', error);
        throw error;
    }
}

// Função para atualizar a exibição global da "Última atualização"
function updateGlobalLastUpdated(formattedDate) {
    const ultimaAtualizacaoElement = document.getElementById('ultimaAtualizacao');
    if (ultimaAtualizacaoElement) {
        ultimaAtualizacaoElement.textContent = `Última atualização: ${formattedDate}`;
        localStorage.setItem('ultimaAtualizacao', formattedDate);
    }
}

// Helpers de overlay de carregamento
function showLoading(message = 'Carregando...') {
    const overlay = document.getElementById('loadingOverlay') || document.getElementById('loading-overlay');
    const msg = document.getElementById('loadingOverlayMessage');
    if (msg) msg.textContent = message;
    if (overlay) {
        console.debug('[loading] show');
        overlay.style.display = 'flex';
        overlay.style.zIndex = overlay.style.zIndex || '100000';
        overlay.setAttribute('aria-hidden', 'false');
        // Evita scroll durante o loading
        document.body.style.overflow = 'hidden';
    } else {
        console.warn('[loading] overlay element não encontrado');
    }
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay') || document.getElementById('loading-overlay');
    if (overlay) {
        console.debug('[loading] hide');
        overlay.style.display = 'none';
        overlay.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
}

// Função para atualizar o campo "Última atualização" de uma demanda específica
async function updateDemandaLastUpdated(ticketNumber) {
    try {
        const now = new Date();
        const formattedDate = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')}`;
        
        // Atualizar no banco de dados local
        const db = await openDB();
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        // Buscar a demanda atual
        const getRequest = store.get(ticketNumber);
        
        return new Promise((resolve, reject) => {
            getRequest.onsuccess = () => {
                const demanda = getRequest.result;
                if (demanda) {
                    // Atualizar o campo ultima_atualizacao
                    demanda.ultima_atualizacao = formattedDate;
                    
                    // Salvar de volta no banco
                    const putRequest = store.put(demanda);
                    
                    putRequest.onsuccess = () => {
                        console.log(`Campo ultima_atualizacao atualizado para ticket ${ticketNumber}: ${formattedDate}`);
                        
                        // Atualizar também os dados em memória
                        const demandaIndex = demandasData.findIndex(d => d.numero === ticketNumber);
                        if (demandaIndex !== -1) {
                            demandasData[demandaIndex].ultima_atualizacao = formattedDate;
                        }
                        
                        // Atualizar a exibição da última atualização global
                        updateGlobalLastUpdated(formattedDate);
                        
                        // Recarregar a tabela para mostrar a nova data
                        filterData();
                        
                        resolve(formattedDate);
                    };
                    
                    putRequest.onerror = () => {
                        console.error('Erro ao salvar demanda atualizada no banco de dados');
                        reject(new Error('Erro ao salvar demanda atualizada'));
                    };
                } else {
                    console.warn(`Demanda ${ticketNumber} não encontrada no banco de dados local`);
                    resolve(null);
                }
            };
            
            getRequest.onerror = () => {
                console.error('Erro ao buscar demanda no banco de dados');
                reject(new Error('Erro ao buscar demanda'));
            };
        });
    } catch (error) {
        console.error('Erro ao atualizar ultima_atualizacao:', error);
        throw error;
    }
}

// Função para atualizar a exibição global da "Última atualização"
function updateGlobalLastUpdated(formattedDate) {
    const ultimaAtualizacaoElement = document.getElementById('ultimaAtualizacao');
    if (ultimaAtualizacaoElement) {
        ultimaAtualizacaoElement.textContent = `Última atualização: ${formattedDate}`;
        localStorage.setItem('ultimaAtualizacao', formattedDate);
    }
}

async function atualizarDados() {
    const btn = document.getElementById('refreshButton');
    const icon = btn ? btn.querySelector('i') : null;
    try {
        console.debug('[atualizarDados] início');
        showLoading('Atualizando dados...');
        // Feedback visual do botão
        if (btn) btn.disabled = true;
        if (icon) icon.classList.add('fa-spin');

        // Reutiliza o pipeline já consolidado
        await loadInitialData({ forceRefresh: true });
        console.debug('[atualizarDados] loadInitialData(forceRefresh) concluído. demandasData:', Array.isArray(demandasData) ? demandasData.length : 'n/a');

        mostrarNotificacao('Dados atualizados da API Mantis.', 'sucesso');
    } catch (error) {
        console.error('Erro ao atualizar os dados:', error);
        mostrarNotificacao('Erro ao atualizar os dados.', 'erro');
    } finally {
        // Restaurar estado visual do botão
        if (icon) icon.classList.remove('fa-spin');
        if (btn) btn.disabled = false;
        hideLoading();
        console.debug('[atualizarDados] fim');
    }
}

function setupColumnToggle() {
    const toggleButton = document.getElementById('toggle-columns-btn');
    const panel = document.getElementById('column-selection-panel');
    const checkboxesContainer = document.getElementById('column-checkboxes');

    if (!toggleButton || !panel || !checkboxesContainer) return;

    // Inicializa as colunas ocultas por padrão
    if (hiddenColumns.size === 0) {
        hiddenColumns = new Set(DEFAULT_HIDDEN_COLUMNS);
    }

    toggleButton.addEventListener('click', () => {
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) {
            populateColumnCheckboxes();
        }
    });

    // Fechar o painel se clicar fora dele
    document.addEventListener('click', (event) => {
        if (!panel.contains(event.target) && !toggleButton.contains(event.target)) {
            panel.classList.add('hidden');
        }
    });
}

function populateColumnCheckboxes() {
    const checkboxesContainer = document.getElementById('column-checkboxes');
    const tableHeaders = document.querySelectorAll('#chamadosTable thead th');
    checkboxesContainer.innerHTML = ''; // Limpa checkboxes existentes

    tableHeaders.forEach((th, index) => {
        const columnText = th.textContent.trim();
        const dataSort = th.getAttribute('data-sort');
        if (columnText) { // Garante que não estamos criando checkbox para colunas vazias
            const div = document.createElement('div');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `toggle-col-${index}`;
            checkbox.checked = !hiddenColumns.has(dataSort || columnText); // Verifica se a coluna está oculta
            checkbox.dataset.columnIndex = index;
            checkbox.dataset.columnKey = dataSort || columnText;

            const label = document.createElement('label');
            label.htmlFor = `toggle-col-${index}`;
            label.textContent = columnText;

            div.appendChild(checkbox);
            div.appendChild(label);
            checkboxesContainer.appendChild(div);

            checkbox.addEventListener('change', (event) => {
                const colKey = event.target.dataset.columnKey;
                if (event.target.checked) {
                    hiddenColumns.delete(colKey);
                } else {
                    hiddenColumns.add(colKey);
                }
                applyColumnVisibility();
            });
        }
    });
}

function applyColumnVisibility() {
    const table = document.getElementById('chamadosTable');
    if (!table) return;

    const headers = table.querySelectorAll('thead th');
    headers.forEach((th, index) => {
        const columnKey = th.getAttribute('data-sort') || th.textContent.trim();
        const isHidden = hiddenColumns.has(columnKey);
        
        // Alterna a visibilidade do cabeçalho
        th.style.display = isHidden ? 'none' : '';

        // Alterna a visibilidade das células correspondentes em cada linha
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const cell = row.children[index];
            if (cell) {
                cell.style.display = isHidden ? 'none' : '';
            }
        });
    });
}

// Função para criar dropdown de status editável
function createStatusDropdown(td, currentStatus, ticketNumber) {
    console.log('Criando dropdown para:', currentStatus, 'ticket:', ticketNumber);
    
    // Container principal
    const container = document.createElement('div');
    container.className = 'status-dropdown-container';
    container.style.position = 'relative';
    container.style.display = 'inline-block';
    container.style.width = '100%';

    // Botão que mostra o status atual
    const button = document.createElement('button');
    button.className = 'status-dropdown-btn';
    button.textContent = currentStatus || 'Selecionar Status';
    button.setAttribute('data-original-status', currentStatus || '');
    button.style.cssText = `
        width: 100%;
        padding: 6px 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        background: white;
        cursor: pointer;
        font-size: 12px;
        text-align: left;
        position: relative;
        min-height: 28px;
        display: flex;
        align-items: center;
        justify-content: space-between;
    `;

    // Ícone de seta
    const arrow = document.createElement('span');
    arrow.innerHTML = '▼';
    arrow.style.cssText = `
        font-size: 10px;
        color: #666;
        margin-left: 4px;
    `;
    button.appendChild(arrow);

    // Dropdown menu
    const dropdown = document.createElement('div');
    dropdown.className = 'status-dropdown-menu';
    
    // Função para posicionar o dropdown usando position: fixed
    const positionDropdown = () => {
        const buttonRect = button.getBoundingClientRect();
        dropdown.style.cssText = `
            position: fixed;
            top: ${buttonRect.bottom + 5}px;
            left: ${buttonRect.left}px;
            width: ${buttonRect.width}px;
            background: white;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            z-index: 999999;
            max-height: 200px;
            overflow-y: auto;
            display: none;
        `;
    };
    
    // Posicionar inicialmente
    positionDropdown();

    // Criar opções do dropdown
    console.log('Criando opções do dropdown, total:', STATUS_OPTIONS.length);
    STATUS_OPTIONS.forEach((status, index) => {
        console.log('Criando opção', index + 1, ':', status);
        const option = document.createElement('div');
        option.className = 'status-option';
        option.textContent = status;
        option.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            border-bottom: 1px solid #f0f0f0;
            font-size: 12px;
            transition: background-color 0.2s;
        `;

        // Destacar a opção atual
        if (status === currentStatus) {
            option.style.backgroundColor = '#e3f2fd';
            option.style.fontWeight = 'bold';
        }

        option.addEventListener('mouseenter', () => {
            option.style.backgroundColor = '#f5f5f5';
        });

        option.addEventListener('mouseleave', () => {
            if (status === currentStatus) {
                option.style.backgroundColor = '#e3f2fd';
            } else {
                option.style.backgroundColor = 'white';
            }
        });

        option.addEventListener('click', (e) => {
            e.stopPropagation(); // Impedir que o clique se propague
            console.log('Opção clicada:', status);
            button.textContent = status;
            button.appendChild(arrow);
            
            // Mostrar botões de ação
            showActionButtons(container, status, ticketNumber);
            
            // Fechar dropdown
            dropdown.style.display = 'none';
            button.style.borderColor = '#4CAF50';
            button.style.backgroundColor = '#f8fff8';
        });

        dropdown.appendChild(option);
    });

    // Eventos do botão
    button.addEventListener('click', (e) => {
        e.stopPropagation();
        console.log('Botão clicado!');
        const isOpen = dropdown.style.display === 'block';
        console.log('Dropdown está aberto?', isOpen);
        
        if (!isOpen) {
            // Reposicionar o dropdown antes de mostrar
            positionDropdown();
            dropdown.style.display = 'block';
            console.log('Dropdown posicionado e exibido');
        } else {
            dropdown.style.display = 'none';
        }
        
        console.log('Novo estado do dropdown:', dropdown.style.display);
        console.log('Dropdown visível?', dropdown.offsetParent !== null);
        console.log('Dropdown rect:', dropdown.getBoundingClientRect());
        arrow.innerHTML = isOpen ? '▼' : '▲';
    });

    // Fechar dropdown ao clicar fora
    document.addEventListener('click', (e) => {
        // Não fechar se o clique foi no modal
        if (e.target.closest('.status-modal')) {
            return;
        }
        
        if (!container.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
            arrow.innerHTML = '▼';
        }
    });

    // Adicionar elementos ao container
    container.appendChild(button);
    td.appendChild(container);
    
    // Adicionar dropdown diretamente ao body para evitar problemas de contexto
    document.body.appendChild(dropdown);
    

    
    console.log('Dropdown adicionado ao DOM. Container:', container);
    console.log('Dropdown element:', dropdown);
}

function mostrarNotificacao(mensagem, tipo = 'info', timeoutMs = 3500) {
    // Toast container
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed;top:16px;right:16px;z-index:100000;display:flex;flex-direction:column;gap:8px;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    const colors = { sucesso: '#2ecc71', erro: '#e74c3c', aviso: '#f39c12', info: '#3498db' };
    const color = colors[tipo] || colors.info;
    toast.style.cssText = `min-width:260px;max-width:420px;background:#fff;border-left:6px solid ${color};box-shadow:0 8px 24px rgba(0,0,0,.15);border-radius:6px;padding:10px 12px;font-size:13px;color:#333;display:flex;align-items:flex-start;gap:8px;`;
    toast.innerHTML = `<div style="margin-top:2px;width:10px;height:10px;border-radius:50%;background:${color}"></div><div>${mensagem}</div>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity .25s'; setTimeout(() => toast.remove(), 300); }, timeoutMs);
}

// ===== Modal de Edição Massiva =====
function createMassEditModal(ticketNumbers) {
    // Overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10000;display:flex;align-items:center;justify-content:center;';
    document.body.appendChild(overlay);

    // Container
    const modal = document.createElement('div');
    modal.className = 'mass-edit-modal';
    modal.style.cssText = 'background:#fff;border-radius:8px;width:95%;max-width:720px;padding:20px;box-shadow:0 10px 30px rgba(0,0,0,.25);';
    overlay.appendChild(modal);

    const selectionText = (ticketNumbers.length === 1)
        ? '1 selecionado'
        : `${ticketNumbers.length} selecionados`;

    modal.innerHTML = `
      <h3>Edição Massiva (${selectionText})</h3>
      <div style="display:grid; grid-template-columns: 28px 1fr 1fr; gap:10px; align-items:center;">
        <div></div><div style=\"font-weight:600;\">Campo</div><div style=\"font-weight:600;\">Valor</div>

        <input type=\"checkbox\" id=\"applyResolved\" />
        <label for=\"applyResolved\">Marcar como Resolvido</label>
        <div></div>

        <input type=\"checkbox\" id=\"applyStatus\" />
        <label for=\"applyStatus\">Status</label>
        <select id=\"massStatus\" disabled></select>

        <input type=\"checkbox\" id=\"applyGmud\" />
        <label for=\"applyGmud\">GMUD</label>
        <input id=\"massGmud\" type=\"text\" placeholder=\"Número GMUD\" disabled />

        <input type=\"checkbox\" id=\"applyPrevisao\" />
        <label for=\"applyPrevisao\">Previsão Etapa</label>
        <input id=\"massPrevisao\" type=\"date\" placeholder=\"Previsão da etapa\" disabled />

        <input type=\"checkbox\" id=\"applyEquipe\" />
        <label for=\"applyEquipe\">Equipe</label>
        <select id=\"massEquipe\" disabled></select>

        <input type=\"checkbox\" id=\"applyRespAtual\" />
        <label for=\"applyRespAtual\">Responsável Atual</label>
        <select id=\"massRespAtual\" disabled></select>

        <input type=\"checkbox\" id=\"applyAnalista\" />
        <label for=\"applyAnalista\">Analista Responsável</label>
        <select id=\"massAnalista\" disabled></select>
      </div>
      <div style="margin-top:12px;">
        <label for="massComment" style="font-weight:600; display:block; margin-bottom:6px;">Comentário (opcional)</label>
        <textarea id="massComment" rows="4" style="width:100%;"></textarea>
      </div>
      <div id="massProgress" style="margin-top:10px; font-size:12px; color:#555;">Pronto</div>
      <div class="modal-footer">
        <button id="massCancel" class="btn btn-cancel">Cancelar</button>
        <button id="massSave" class="btn btn-save">Salvar</button>
      </div>
    `;

    const close = () => { overlay.remove(); };
    modal.querySelector('#massCancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    // Populate selects
    const statusSel = modal.querySelector('#massStatus');
    STATUS_OPTIONS.forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; statusSel.appendChild(o); });
    const equipeSel = modal.querySelector('#massEquipe');
    SQUAD_OPTIONS.sort().forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; equipeSel.appendChild(o); });
    const respSel = modal.querySelector('#massRespAtual');
    RESPONSAVEL_ATUAL_OPTIONS.sort().forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; respSel.appendChild(o); });
    const analistaSel = modal.querySelector('#massAnalista');
    ANALISTA_RESPONSAVEL_OPTIONS.sort().forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; analistaSel.appendChild(o); });

    // Enable/disable
    const pairs = [
        ['applyStatus','massStatus'],
        ['applyGmud','massGmud'],
        ['applyPrevisao','massPrevisao'],
        ['applyEquipe','massEquipe'],
        ['applyRespAtual','massRespAtual'],
        ['applyAnalista','massAnalista']
    ];
    pairs.forEach(([chkId, inputId]) => {
        const chk = modal.querySelector('#' + chkId);
        const inp = modal.querySelector('#' + inputId);
        chk.addEventListener('change', () => { inp.disabled = !chk.checked; });
    });

    // Save handler
    modal.querySelector('#massSave').addEventListener('click', async () => {
        const apply = {
            status: modal.querySelector('#applyStatus').checked,
            resolved: modal.querySelector('#applyResolved').checked,
            gmud: modal.querySelector('#applyGmud').checked,
            previsao: modal.querySelector('#applyPrevisao').checked,
            equipe: modal.querySelector('#applyEquipe').checked,
            respAtual: modal.querySelector('#applyRespAtual').checked,
            analista: modal.querySelector('#applyAnalista').checked,
        };
        const values = {
            status: modal.querySelector('#massStatus').value,
            gmud: modal.querySelector('#massGmud').value,
            previsao: modal.querySelector('#massPrevisao').value,
            equipe: modal.querySelector('#massEquipe').value,
            respAtual: modal.querySelector('#massRespAtual').value,
            analista: modal.querySelector('#massAnalista').value,
            comment: modal.querySelector('#massComment').value?.trim()
        };

        if (!apply.status && !apply.gmud && !apply.previsao && !apply.equipe && !apply.respAtual && !apply.analista && !values.comment) {
            mostrarNotificacao('Selecione pelo menos um campo para aplicar ou insira um comentário.', 'aviso');
            return;
        }

        const progress = modal.querySelector('#massProgress');
        const total = ticketNumbers.length;
        let done = 0;
        progress.textContent = `Processando 0/${total}...`;
        modal.querySelector('#massSave').disabled = true;

        const worker = async (numero) => {
            const base = getDemandaByNumero(numero) || {};
            const patchPayload = {};
            const custom_fields = [];
            if (apply.status) custom_fields.push({ field: { id: 70 }, value: values.status });
            if (apply.gmud) custom_fields.push({ field: { id: 71 }, value: values.gmud });
            if (apply.previsao) custom_fields.push({ field: { id: 72 }, value: values.previsao });
            if (apply.equipe) custom_fields.push({ field: { id: 49 }, value: values.equipe });
            if (apply.respAtual) custom_fields.push({ field: { id: 69 }, value: values.respAtual });
            if (custom_fields.length) patchPayload.custom_fields = custom_fields;
            if (apply.analista) patchPayload.handler = { name: values.analista };

            // Estado nativo: resolved
            if (apply.resolved) {
                patchPayload.status = { name: 'resolved' };
                patchPayload.resolution = { name: 'fixed' };
            }

            let patchOk = true;
            if (Object.keys(patchPayload).length > 0) {
                try {
                    await mantisRequest(`issues/${numero}`, { method: 'PATCH', body: JSON.stringify(patchPayload) });
                } catch (e) {
                    patchOk = false;
                }
            }

            // Montar comentário
            const lines = [];
            if (apply.status) {
                const oldStatus = base.status || '';
                if (patchOk && (!oldStatus || oldStatus !== values.status)) lines.push(`Status: ${values.status}`);
            }
            if (apply.resolved) {
                lines.push('Estado: resolved');
            }
            if (apply.gmud) {
                const oldGmud = base.numero_gmud || '';
                if (patchOk && (!oldGmud || oldGmud !== values.gmud)) lines.push(`GMUD: ${values.gmud}`);
            }
            if (apply.previsao) {
                const oldPrev = base.previsao_etapa || '';
                if (patchOk && (!oldPrev || oldPrev !== values.previsao)) lines.push(`Previsão Etapa: ${values.previsao}`);
            }
            if (values.comment) lines.push(values.comment);

            let postOk = true;
            if (lines.length > 0) {
                try {
                    await mantisRequest(`issues/${numero}/notes`, { method: 'POST', body: JSON.stringify({ text: lines.join('\n'), view_state: { name: 'public' } }) });
                } catch (e) { postOk = false; }
            }

            // Atualiza dados locais e IndexedDB se patch OK
            if (patchOk) {
                const idx = demandasData.findIndex(d => d.numero === numero);
                if (idx !== -1) {
                    if (apply.status) demandasData[idx].status = values.status;
                    if (apply.resolved) demandasData[idx].estado = 'resolved';
                    if (apply.gmud) demandasData[idx].numero_gmud = values.gmud;
                    if (apply.previsao) demandasData[idx].previsao_etapa = values.previsao;
                    if (apply.equipe) demandasData[idx].squad = values.equipe;
                    if (apply.respAtual) demandasData[idx].resp_atual = values.respAtual;
                    if (apply.analista) demandasData[idx].atribuicao = values.analista;
                }
                try {
                    const db = await openDB();
                    const tx = db.transaction([STORE_NAME], 'readwrite');
                    const store = tx.objectStore(STORE_NAME);
                    const getReq = store.get(numero);
                    await new Promise((resolve) => { getReq.onsuccess = resolve; getReq.onerror = resolve; });
                    const demanda = getReq.result || { numero };
                    if (apply.status) demanda.status = values.status;
                    if (apply.resolved) demanda.estado = 'resolved';
                    if (apply.gmud) demanda.numero_gmud = values.gmud;
                    if (apply.previsao) demanda.previsao_etapa = values.previsao;
                    if (apply.equipe) demanda.squad = values.equipe;
                    if (apply.respAtual) demanda.resp_atual = values.respAtual;
                    if (apply.analista) demanda.atribuicao = values.analista;
                    const putReq = store.put(demanda);
                    await new Promise((resolve) => { putReq.onsuccess = resolve; putReq.onerror = resolve; });
                } catch (e) {
                    console.warn('Falha ao atualizar IndexedDB para ticket', numero, e);
                }
                try { await updateDemandaLastUpdated(numero); } catch {}
            }

            done++;
            progress.textContent = `Processando ${done}/${total}...`;
            return { numero, patchOk, postOk };
        };

        const results = await runWithConcurrency(ticketNumbers, worker, 3);
        const okCount = results.filter(r => r && r.patchOk !== false).length;
        const fail = results.filter(r => r && r.patchOk === false);
        progress.textContent = `Concluído. Sucesso: ${okCount} | Falhas: ${fail.length}`;

        try {
            const successful = results.filter(r => r && r.patchOk !== false).map(r => r.numero);
            if (successful.length) markRecentlyUpdated(successful);
        } catch {}
        filterData();
        selectedTickets.clear();
        syncSelectAllCheckboxForPage();
        const massEditBtn = document.getElementById('massEditBtn');
        if (massEditBtn) massEditBtn.disabled = true;
        mostrarNotificacao(`Edição massiva concluída. Sucesso: ${okCount} | Falhas: ${fail.length}`, fail.length ? 'aviso' : 'sucesso');
        setTimeout(() => { close(); }, 1200);
    });
}

/**
 * Atualiza um único campo customizado no Mantis.
 * @param {string} ticketNumber - O número do ticket.
 * @param {number} fieldId - O ID do campo customizado a ser atualizado.
 * @param {string} newValue - O novo valor para o campo.
 * @returns {Promise<boolean>} - Retorna true se a atualização for bem-sucedida, false caso contrário.
 */
async function updateMantisCustomField(ticketNumber, fieldId, newValue) {
    const response = await mantisRequest(
        `issues/${ticketNumber}`,
        {
            method: 'PATCH',
            body: JSON.stringify({
                custom_fields: [
                    { field: { id: fieldId }, value: newValue }
                ]
            })
        }
    );
    return response;
}

/**
 * Atualiza o responsável (handler) de um ticket no Mantis.
 * @param {string} ticketNumber - O número do ticket.
 * @param {string} newHandlerUsername - O nome de usuário do novo responsável.
 * @returns {Promise<boolean>} - Retorna true se a atualização for bem-sucedida, false caso contrário.
 */
async function updateMantisHandler(ticketNumber, newHandlerUsername) {
    const response = await mantisRequest(
        `issues/${ticketNumber}`,
        {
            method: 'PATCH',
            body: JSON.stringify({
                handler: { name: newHandlerUsername }
            })
        }
    );
    return response;
}

/**
 * Cria e exibe um modal simples para atualização de um campo com uma lista de opções.
 * @param {string} ticketNumber - O número do ticket.
 * @param {string} currentValue - O valor atual do campo.
 * @param {string} modalTitle - O título do modal.
 * @param {string[]} optionsList - A lista de opções para o select.
 * @param {number} customFieldId - O ID do campo customizado a ser atualizado.
 * @param {HTMLElement} targetCell - A célula da tabela que será atualizada na UI.
 */
function createSimpleUpdateModal(ticketNumber, currentValue, modalTitle, optionsList, customFieldId, targetCell) {
    console.log('createSimpleUpdateModal chamada:', { ticketNumber, currentValue, modalTitle, optionsList, customFieldId });
    
    // Remove qualquer modal similar que já esteja aberto
    const existingModal = document.querySelector('.simple-update-modal');
    if (existingModal) {
        existingModal.remove();
    }

    // Remove qualquer overlay existente
    const existingOverlay = document.querySelector('.modal-overlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }

    // Cria o overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.6);
        z-index: 10000;
        display: flex;
        justify-content: center;
        align-items: center;
    `;
    document.body.appendChild(overlay);

    const modalContainer = document.createElement('div');
    modalContainer.className = 'simple-update-modal';
    modalContainer.style.cssText = `
        background-color: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.25);
        width: 95%;
        max-width: 720px;
        z-index: 10001;
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        display: flex;
        flex-direction: column;
        gap: 15px;
    `;

    const modalContent = document.createElement('div');
    modalContent.className = 'simple-update-modal-content';
    modalContent.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 15px;
    `;

    modalContent.innerHTML = `
        <h3>${modalTitle}</h3>
        <div class="ticket-info-box">
            <strong>Ticket:</strong> ${ticketNumber}<br>
            <strong>Valor Atual:</strong> ${currentValue || 'N/A'}
        </div>
        <label for="simple-update-select" style="font-weight: 600; color: #555; margin-bottom: 5px; display: block;">Novo Valor:</label>
        <select id="simple-update-select" style="width: 100%; padding: 10px; border-radius: 4px; border: 1px solid #ccc; font-size: 1rem; background-color: #f8f9fa; color: #333;"></select>
        <div class="modal-footer">
            <button class="cancel-btn btn btn-cancel">Cancelar</button>
            <button class="save-btn btn btn-save">Salvar</button>
        </div>
    `;

    const select = modalContent.querySelector('#simple-update-select');
    optionsList.sort().forEach(optionValue => {
        const option = document.createElement('option');
        option.value = optionValue;
        option.textContent = optionValue;
        if (optionValue === currentValue) {
            option.selected = true;
        }
        select.appendChild(option);
    });

    const saveBtn = modalContent.querySelector('.save-btn');
    const cancelBtn = modalContent.querySelector('.cancel-btn');

    // Função para fechar o modal
    const closeModal = () => {
        modalContainer.remove();
        overlay.remove();
    };

    saveBtn.addEventListener('click', async () => {
        const newValue = select.value;
        if (newValue !== currentValue) {
            saveBtn.textContent = 'Salvando...';
            saveBtn.disabled = true;
            
            let success = false;
            if (customFieldId === 65) { // Caso especial para Analista Responsável (handler)
                success = await updateMantisHandler(ticketNumber, newValue);
            } else { // Para outros campos customizados
                success = await updateMantisCustomField(ticketNumber, customFieldId, newValue);
            }

            if (success) {
                targetCell.textContent = newValue;
                // Atualiza o valor nos dados em memória
                const demandaIndex = demandasData.findIndex(d => d.numero === ticketNumber);
                if (demandaIndex !== -1) {
                    const keyMap = {
                        49: 'squad',
                        65: 'atribuicao',
                        69: 'resp_atual',
                        72: 'previsao_etapa'
                    };
                    const dataKey = keyMap[customFieldId];
                    if(dataKey) {
                        demandasData[demandaIndex][dataKey] = newValue;
                    }
                }
                
                // Atualizar também no banco de dados local
                try {
                    const db = await openDB();
                    const transaction = db.transaction([STORE_NAME], 'readwrite');
                    const store = transaction.objectStore(STORE_NAME);
                    
                    const getRequest = store.get(ticketNumber);
                    getRequest.onsuccess = () => {
                        const demanda = getRequest.result;
                        if (demanda) {
                            const keyMap = {
                                49: 'squad',
                                65: 'atribuicao',
                                69: 'resp_atual',
                                72: 'previsao_etapa'
                            };
                            const dataKey = keyMap[customFieldId];
                            if(dataKey) {
                                demanda[dataKey] = newValue;
                                
                                // Salvar de volta no banco
                                const putRequest = store.put(demanda);
                                putRequest.onsuccess = () => {
                                    console.log(`Campo ${dataKey} atualizado para ticket ${ticketNumber}: ${newValue}`);
                                    
                                    // Recarregar a tabela para mostrar as mudanças
                                    filterData();
                                };
                            }
                        }
                    };
                } catch (error) {
                    console.error('Erro ao atualizar campo no banco de dados local:', error);
                }
                
                mostrarNotificacao(`Campo "${modalTitle.replace('Atualizar ', '')}" do ticket ${ticketNumber} atualizado com sucesso.`, 'sucesso');
                closeModal();
            } else {
                mostrarNotificacao('Falha ao atualizar. Verifique o console.', 'erro');
                saveBtn.textContent = 'Salvar';
                saveBtn.disabled = false;
            }
        } else {
            closeModal();
        }
    });

    cancelBtn.addEventListener('click', closeModal);
    
    // Fechar modal ao clicar no overlay
    overlay.addEventListener('click', closeModal);

    modalContainer.appendChild(modalContent);
    document.body.appendChild(modalContainer);
    
    // Focar no campo de observação
    setTimeout(() => {
        modalContent.querySelector('#simple-update-select').focus();
    }, 100);

    console.log('Modal criado e adicionado ao DOM');
}

async function updateTicketField(ticketNumber, fieldKey, value) {
    const ORDEM_PLNJ_CF_ID = (window.AppConfig && window.AppConfig.CF_ORDEM_PLNJ_ID) || 50; // informado: ID 50
    const token = window.AppConfig.MANTIS_API_TOKEN;
    const issueUrl = window.AppConfig.getMantisApiUrl(`issues/${ticketNumber}`);
    
    const fieldIdMap = {
        'squad': 49, // Substitua pelo ID correto se necessário
        'atribuicao': 65, // Substitua pelo ID correto se necessário
        'resp_atual': 69, // Substitua pelo ID correto se necessário
    };

    const fieldId = fieldIdMap[fieldKey];
    if (!fieldId) {
        console.error(`Chave de campo inválida: ${fieldKey}`);
        return false;
    }

    const body = {
        custom_fields: [{
            field: { id: fieldId },
            value: value
        }]
    };

    try {
        const response = await fetch(issueUrl, {
            method: 'PATCH',
            headers: { 'Authorization': token, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error(`Erro ao atualizar campo ${fieldKey}:`, errorData);
            return false;
        }

        await updateDemandaLastUpdated(ticketNumber);
        return true;

    } catch (error) {
        console.error(`Erro de rede ao atualizar campo ${fieldKey}:`, error);
        return false;
    }
}

// Função para mostrar modal de confirmação com observação customizada
function showActionButtons(container, newStatus, ticketNumber) {
    console.log('showActionButtons chamada:', newStatus, ticketNumber);

    // Remover modais existentes se houver
    const existingModal = document.querySelector('.confirmation-modal');
    if (existingModal) {
        existingModal.remove();
    }

    // Criar o contêiner do modal
    const modalContainer = document.createElement('div');
    modalContainer.className = 'confirmation-modal';
    modalContainer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    // Criar o conteúdo do modal
    const modalContent = document.createElement('div');
    modalContent.className = 'confirmation-modal-content';
    modalContent.style.cssText = `
        background: white;
        padding: 24px;
        border-radius: 8px;
        box-shadow: 0 5px 20px rgba(0,0,0,0.3);
        width: 90%;
        max-width: 480px;
        text-align: left;
        position: relative;
        animation: slide-down 0.3s ease-out;
    `;

    // Título do modal
    const modalTitle = document.createElement('h3');
    modalTitle.textContent = 'Confirmar Alteração de Status';
    modalTitle.style.cssText = `
        margin-top: 0;
        margin-bottom: 20px;
        color: #333;
        font-size: 1.4rem;
        font-weight: 600;
        border-bottom: 1px solid #eee;
        padding-bottom: 15px;
    `;

    // Informações do Ticket
    const ticketInfo = document.createElement('div');
    ticketInfo.className = 'ticket-info-box';
    ticketInfo.innerHTML = `<p><strong>Ticket:</strong> ${ticketNumber}</p><p><strong>Status Selecionado:</strong> ${newStatus}</p>`;
    ticketInfo.style.cssText = `
        background-color: #f8f9fa;
        border-left: 5px solid #3498db;
        padding: 15px 20px;
        margin-bottom: 20px;
        border-radius: 5px;
        font-size: 1rem;
    `;

    // Container para Status e GMUD
    const statusGmudContainer = document.createElement('div');
    statusGmudContainer.style.cssText = `
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        margin-bottom: 15px;
    `;

    // Campo Status (somente leitura)
    const statusGroup = document.createElement('div');
    statusGroup.innerHTML = `
        <label for="status-input" style="display: block; margin-bottom: 8px; font-weight: 600; color: #555;">Status:</label>
        <input type="text" id="status-input" value="${newStatus}" readonly style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; background-color: #e9ecef; cursor: not-allowed; box-sizing: border-box;">
    `;

    // Campo GMUD
    const gmudGroup = document.createElement('div');
    gmudGroup.innerHTML = `
        <label for="gmud-input" style="display: block; margin-bottom: 8px; font-weight: 600; color: #555;">GMUD:</label>
        <input type="text" id="gmud-input" placeholder="Ex: 12345" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
    `;

    statusGmudContainer.appendChild(statusGroup);
    statusGmudContainer.appendChild(gmudGroup);

    // Campo Observação
    const observacaoGroup = document.createElement('div');
    observacaoGroup.style.position = 'relative';
    observacaoGroup.innerHTML = `
        <label for="observacao-input" style="display: block; margin-bottom: 8px; font-weight: 600; color: #555;">Observação (opcional):</label>
        <textarea id="observacao-input" placeholder="Digite uma observação ou contexto adicional..." maxlength="500" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; min-height: 90px; resize: vertical; box-sizing: border-box;"></textarea>
        <div id="char-counter" style="position: absolute; bottom: 15px; right: 15px; font-size: 0.8rem; color: #888;">0/500</div>
    `;

    // Campo Preview
    const previewGroup = document.createElement('div');
    previewGroup.style.marginBottom = '25px';
    previewGroup.innerHTML = `
        <label for="preview-output" style="display: block; margin-bottom: 8px; font-weight: 600; color: #555;">Preview do texto que será enviado:</label>
        <textarea id="preview-output" readonly style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; background-color: #e9ecef; min-height: 70px; resize: none; box-sizing: border-box;">${newStatus}</textarea>
    `;

    // Lógica de atualização
    const gmudInput = gmudGroup.querySelector('#gmud-input');
    const observacaoTextarea = observacaoGroup.querySelector('#observacao-input');
    const previewTextarea = previewGroup.querySelector('#preview-output');
    const charCounter = observacaoGroup.querySelector('#char-counter');

    const updatePreview = () => {
        const gmud = gmudInput.value.trim();
        const observacao = observacaoTextarea.value.trim();
        let previewText = newStatus;
        if (gmud) {
            previewText += ` - GMUD: ${gmud}`;
        }
        if (observacao) {
            previewText += `\n${observacao}`;
        }
        previewTextarea.value = previewText;
    };

    observacaoTextarea.addEventListener('input', () => {
        const count = observacaoTextarea.value.length;
        charCounter.textContent = `${count}/500`;
        updatePreview();
    });

    gmudInput.addEventListener('input', updatePreview);

    // Botões
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
        display: flex;
        justify-content: flex-end;
        gap: 12px;
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.className = 'cancel-btn';
    cancelBtn.style.cssText = `
        padding: 12px 24px;
        border: none;
        border-radius: 5px;
        background-color: #6c757d;
        color: white;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: background-color 0.2s;
    `;

    cancelBtn.addEventListener('mouseenter', () => {
        cancelBtn.style.backgroundColor = '#5a6268';
    });
    cancelBtn.addEventListener('mouseleave', () => {
        cancelBtn.style.backgroundColor = '#6c757d';
    });

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Salvar';
    saveBtn.className = 'save-btn';
    saveBtn.style.cssText = `
        padding: 12px 24px;
        border: none;
        border-radius: 5px;
        background-color: #3498db;
        color: white;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: background-color 0.2s;
    `;

    saveBtn.addEventListener('mouseenter', () => {
        saveBtn.style.backgroundColor = '#218838';
    });

    saveBtn.addEventListener('mouseleave', () => {
        saveBtn.style.backgroundColor = '#3498db';
    });

    // Eventos dos botões
    saveBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        
        const gmudValue = gmudInput.value.trim();
        const note = previewTextarea.value;
        let success = await postToMantis(ticketNumber, note, newStatus, gmudValue);

        if (success) {
            // Marcar como atualizado recentemente
            try { markRecentlyUpdated([ticketNumber]); } catch {}
            // Atualizar o texto do botão na interface
            container.querySelector('.status-dropdown-btn').textContent = newStatus;
            
            // Atualizar o campo status no banco de dados local
            try {
                const db = await openDB();
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                
                const getRequest = store.get(ticketNumber);
                getRequest.onsuccess = () => {
                    const demanda = getRequest.result;
                    if (demanda) {
                        // Atualizar o campo status
                        demanda.status = newStatus;
                        
                        // Salvar de volta no banco
                        const putRequest = store.put(demanda);
                        putRequest.onsuccess = () => {
                            console.log(`Campo status atualizado para ticket ${ticketNumber}: ${newStatus}`);
                            
                            // Atualizar também os dados em memória
                            const demandaIndex = demandasData.findIndex(d => d.numero === ticketNumber);
                            if (demandaIndex !== -1) {
                                demandasData[demandaIndex].status = newStatus;
                            }
                            
                            // Recarregar a tabela para mostrar o novo status
                            filterData();
                        };
                    }
                };
            } catch (error) {
                console.error('Erro ao atualizar status no banco de dados local:', error);
            }
            
            modalContainer.remove();
            mostrarNotificacao(`Ticket ${ticketNumber} atualizado com sucesso.`, 'sucesso');
        } else {
             mostrarNotificacao(`Falha ao atualizar o ticket ${ticketNumber}.`, 'erro');
        }
    });

    cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        modalContainer.remove();
    });

    // Fechar modal ao clicar fora
    modalContainer.addEventListener('click', (e) => {
        if (e.target === modalContainer) {
            cancelBtn.click();
        }
    });

    // Fechar modal com ESC
    const handleEscKey = (e) => {
        if (e.key === 'Escape') {
            cancelBtn.click();
            document.removeEventListener('keydown', handleEscKey);
        }
    };
    document.addEventListener('keydown', handleEscKey);

    // Montar o modal
    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(saveBtn);

    modalContent.appendChild(modalTitle);
    modalContent.appendChild(ticketInfo);
    modalContent.appendChild(statusGmudContainer);
    modalContent.appendChild(observacaoGroup);
    modalContent.appendChild(previewGroup);
    modalContent.appendChild(buttonContainer);

    modalContainer.appendChild(modalContent);
    document.body.appendChild(modalContainer);
    
    // Focar no campo de observação
    setTimeout(() => {
        observacaoTextarea.focus();
    }, 100);

    console.log('Modal de confirmação adicionado ao body');
}

// Função para mostrar feedback de salvamento
function showSaveFeedback(container, success) {
    const feedback = document.createElement('div');
    
    // Função para posicionar o feedback
    const positionFeedback = () => {
        const button = container.querySelector('.status-dropdown-btn');
        const buttonRect = button.getBoundingClientRect();
        feedback.style.cssText = `
            position: fixed;
            top: ${buttonRect.bottom + 5}px;
            left: ${buttonRect.left}px;
            width: ${buttonRect.width}px;
            background: ${success ? '#4CAF50' : '#f44336'};
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            text-align: center;
            z-index: 999999;
        `;
    };
    
    positionFeedback();
    feedback.textContent = success ? 'Status salvo!' : 'Erro ao salvar';

    // Adicionar ao body
    document.body.appendChild(feedback);

    // Remover feedback após 2 segundos
    setTimeout(() => {
        feedback.remove();
    }, 2000);
}

// Nota: a função atualizarDados() já foi definida anteriormente com a implementação correta.
// Evitar redefinições para não sobrescrever o comportamento.

// Função utilitária (deve estar disponível no escopo global)
async function mantisRequest(endpoint, options = {}) {
    const token = localStorage.getItem('authToken');
    if (!token) throw new Error('Não autenticado');
    const response = await fetch(`/api/mantis?endpoint=${encodeURIComponent(endpoint)}`, {
        ...options,
        headers: {
            ...options.headers,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro na requisição');
    }
    return response.json();
}

async function postToMantis(ticketNumber, text, newStatus, gmudValue) {
    // Adiciona nota
    if (text && text.trim()) {
        await mantisRequest(
            `issues/${ticketNumber}/notes`,
            {
                method: 'POST',
                body: JSON.stringify({
                    text: text,
                    view_state: { name: 'public' }
                })
            }
        );
    }
    // Atualiza status/GMUD
    const customFields = [];
    if (newStatus) customFields.push({ field: { id: 70, name: "Status" }, value: newStatus });
    if (gmudValue) customFields.push({ field: { id: 71, name: "Numero_GMUD" }, value: gmudValue });
    if (customFields.length > 0) {
        await mantisRequest(
            `issues/${ticketNumber}`,
            {
                method: 'PATCH',
                body: JSON.stringify({ custom_fields: customFields })
            }
        );
    }
    return true;
}

// Passo 1.2: Criar o Modal de Edição Unificado
function createUnifiedEditModal(demanda) {
    console.log('Função createUnifiedEditModal chamada com a demanda:', demanda);

    // Remover qualquer modal existente para evitar duplicatas
    const existingOverlay = document.querySelector('.modal-overlay');
    if (existingOverlay) existingOverlay.remove();

    // Overlay unificado
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);

    // Container unificado
    const modal = document.createElement('div');
    modal.className = 'simple-update-modal';

    const modalTitle = document.createElement('h3');
    modalTitle.textContent = `Editar Chamado #${demanda.numero}`;

    // Checkbox: Marcar como Resolvido (estado nativo)
    const resolvedGroup = document.createElement('div');
    resolvedGroup.className = 'form-group inline';
    const resolvedLabel = document.createElement('label');
    const resolvedCheckbox = document.createElement('input');
    resolvedCheckbox.type = 'checkbox';
    resolvedCheckbox.id = 'resolvedCheckbox';
    resolvedLabel.setAttribute('for', 'resolvedCheckbox');
    resolvedLabel.textContent = ' Marcar como Resolvido';
    resolvedGroup.appendChild(resolvedCheckbox);
    resolvedGroup.appendChild(resolvedLabel);

    // Campo de Status (Dropdown)
    const statusGroup = document.createElement('div');
    statusGroup.className = 'form-group';
    const statusLabel = document.createElement('label');
    statusLabel.textContent = 'Status:';
    const statusSelect = document.createElement('select');
    statusSelect.className = 'form-control';
    STATUS_OPTIONS.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        if (option === demanda.status) {
            opt.selected = true;
        }
        statusSelect.appendChild(opt);
    });
    statusGroup.appendChild(statusLabel);
    statusGroup.appendChild(statusSelect);

    // Campo de GMUD (Input de texto)
    const gmudGroup = document.createElement('div');
    gmudGroup.className = 'form-group';
    const gmudLabel = document.createElement('label');
    gmudLabel.textContent = 'Número da GMUD:';
    const gmudInput = document.createElement('input');
    gmudInput.type = 'text';
    gmudInput.className = 'form-control';
    gmudInput.value = demanda.numero_gmud || ''; // Assumindo que o campo se chama 'numero_gmud'
    gmudGroup.appendChild(gmudLabel);
    gmudGroup.appendChild(gmudInput);

    // Campo de Previsão Etapa (Input de data)
    const previsaoGroup = document.createElement('div');
    previsaoGroup.className = 'form-group';
    const previsaoLabel = document.createElement('label');
    previsaoLabel.textContent = 'Previsão Etapa:';
    const previsaoInput = document.createElement('input');
    previsaoInput.type = 'date';
    previsaoInput.className = 'form-control';
    previsaoInput.value = (() => {
        const v = (demanda.previsao_etapa || '').trim();
        if (!v) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v; // já ISO yyyy-mm-dd
        const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); // dd/mm/yyyy
        if (m) return `${m[3]}-${m[2]}-${m[1]}`;
        // fallback: tentar Date.parse
        const ts = Date.parse(v);
        if (!Number.isNaN(ts)) {
            const d = new Date(ts);
            const mm = String(d.getMonth()+1).padStart(2,'0');
            const dd = String(d.getDate()).padStart(2,'0');
            return `${d.getFullYear()}-${mm}-${dd}`;
        }
        return '';
    })();
    previsaoGroup.appendChild(previsaoLabel);
    previsaoGroup.appendChild(previsaoInput);

    // Campo de Nota/Observação (Textarea)
    const notaGroup = document.createElement('div');
    notaGroup.className = 'form-group';
    const notaLabel = document.createElement('label');
    notaLabel.textContent = 'Adicionar Nota/Observação:';
    const notaTextarea = document.createElement('textarea');
    notaTextarea.className = 'form-control';
    notaTextarea.rows = 3;
    notaGroup.appendChild(notaLabel);
    notaGroup.appendChild(notaTextarea);

    // Botões de Ação
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'modal-footer';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Salvar';
    saveBtn.className = 'btn btn-save';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.className = 'btn btn-cancel';

    // Lógica dos botões
    const closeUnified = () => { try { overlay.remove(); } catch {} };
    cancelBtn.addEventListener('click', closeUnified);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeUnified();
    });
    document.addEventListener('keydown', function handleEsc(e) {
        if (e.key === 'Escape') {
            closeUnified();
            document.removeEventListener('keydown', handleEsc);
        }
    });

    // Passo 1.4: Lógica de Salvamento (Implementação Final)
    saveBtn.addEventListener('click', async () => {
        try {
            let hasChanges = false;

            // 1. Preparar valores atuais do formulário
            const notaText = notaTextarea.value;

            // 2. Montar e enviar payload de atualização de campos (PATCH consolidado)
            const payload = {};
            const custom_fields = [];

            const newStatus = statusSelect.value;
            const gmudValue = gmudInput.value;
            const newEquipe = equipeSelect.value;
            const newAnalista = analistaSelect.value;
            const newResponsavel = responsavelSelect.value;
            const newPrevisao = previsaoInput.value;
            const markResolved = resolvedCheckbox.checked;

            // Campo Padrão: Analista Responsável
            if (newAnalista !== demanda.atribuicao) {
                payload.handler = { name: newAnalista };
            }

            // Campos Personalizados: Status, GMUD, Previsão Etapa, Equipe, Responsável Atual
            if (newStatus !== demanda.status) {
                custom_fields.push({ field: { id: 70 }, value: newStatus }); 
            }
            if (gmudValue !== (demanda.numero_gmud || '')) {
                custom_fields.push({ field: { id: 71 }, value: gmudValue }); 
            }
            if (newPrevisao !== (demanda.previsao_etapa || '')) {
                custom_fields.push({ field: { id: 72 }, value: newPrevisao });
            }
            if (newEquipe !== demanda.squad) {
                custom_fields.push({ field: { id: 49 }, value: newEquipe }); 
            }
            if (newResponsavel !== demanda.resp_atual) {
                custom_fields.push({ field: { id: 69 }, value: newResponsavel }); 
            }

            if (custom_fields.length > 0) {
                payload.custom_fields = custom_fields;
            }

            // Aplicar estado nativo resolved, se marcado
            if (markResolved) {
                payload.status = { name: 'resolved' };
                payload.resolution = { name: 'fixed' };
            }

            // Enviar PATCH apenas se houver alterações nos campos
            if (Object.keys(payload).length > 0) {
                console.log('PAYLOAD PATCH ENVIADO PARA A API MANTIS:', JSON.stringify(payload, null, 2));
                await mantisRequest(`issues/${demanda.numero}`, {
                    method: 'PATCH',
                    body: JSON.stringify(payload)
                });
                hasChanges = true;
            }

            // 2. Enviar comentário unificado (após PATCH):
            //    - Inclui apenas Status/GMUD que mudaram
            //    - Inclui o comentário opcional do usuário, se houver
            //    - Se Status/GMUD não mudarem, envia somente o comentário do usuário (se houver)
            const statusChanged = newStatus !== demanda.status;
            const gmudChanged = gmudValue !== (demanda.numero_gmud || '');
            const previsaoChanged = newPrevisao !== (demanda.previsao_etapa || '');
            const lines = [];
            if (statusChanged && newStatus) lines.push(`Status: ${newStatus}`);
            if (gmudChanged && gmudValue) lines.push(`GMUD: ${gmudValue}`);
            if (previsaoChanged && newPrevisao) lines.push(`Previsão Etapa: ${newPrevisao}`);
            if (markResolved) lines.push('Estado: resolved');
            if (notaText && notaText.trim()) lines.push(notaText.trim());
            if (lines.length > 0) {
                await mantisRequest(`issues/${demanda.numero}/notes`, {
                    method: 'POST',
                    body: JSON.stringify({
                        text: lines.join('\n'),
                        view_state: { name: 'public' }
                    })
                });
                hasChanges = true;
            }

            // 3. Feedback e atualização da UI
            if (hasChanges) {
                // Marcar como atualizado recentemente ANTES de re-renderizar
                try { markRecentlyUpdated([demanda.numero]); } catch {}
                mostrarNotificacao(`Chamado #${demanda.numero} atualizado com sucesso!`, 'sucesso');

                // Atualizar dados locais para reflexo imediato na tabela
                const dataIndex = demandasData.findIndex(d => d.numero === demanda.numero);
                if (dataIndex !== -1) {
                    demandasData[dataIndex].status = newStatus;
                    demandasData[dataIndex].numero_gmud = gmudValue;
                    demandasData[dataIndex].previsao_etapa = newPrevisao;
                    demandasData[dataIndex].squad = newEquipe;
                    demandasData[dataIndex].atribuicao = newAnalista;
                    demandasData[dataIndex].resp_atual = newResponsavel;
                    if (markResolved) demandasData[dataIndex].estado = 'resolved';
                }
                filterData(); // Re-renderiza a tabela com os novos dados
            }

            modalContainer.remove();

        } catch (error) {
            console.error('Erro ao salvar as alterações:', error);
            const errorData = await error.response?.json().catch(() => ({}))
            const errorMessage = errorData.message || error.message || 'Erro desconhecido ao salvar no Mantis.';
            mostrarNotificacao(`Erro: ${errorMessage}`, 'erro');
        }
    });

    // Campo de Equipe (Dropdown)
    const equipeGroup = document.createElement('div');
    equipeGroup.className = 'form-group';
    const equipeLabel = document.createElement('label');
    equipeLabel.textContent = 'Equipe:';
    const equipeSelect = document.createElement('select');
    equipeSelect.className = 'form-control';
    SQUAD_OPTIONS.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        if (option === demanda.squad) {
            opt.selected = true;
        }
        equipeSelect.appendChild(opt);
    });
    equipeGroup.appendChild(equipeLabel);
    equipeGroup.appendChild(equipeSelect);

    // Campo de Analista Responsável (Dropdown)
    const analistaGroup = document.createElement('div');
    analistaGroup.className = 'form-group';
    const analistaLabel = document.createElement('label');
    analistaLabel.textContent = 'Analista Responsável:';
    const analistaSelect = document.createElement('select');
    analistaSelect.className = 'form-control';
    ANALISTA_RESPONSAVEL_OPTIONS.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        if (option === demanda.atribuicao) { // Assumindo que o campo é 'atribuicao'
            opt.selected = true;
        }
        analistaSelect.appendChild(opt);
    });
    analistaGroup.appendChild(analistaLabel);
    analistaGroup.appendChild(analistaSelect);

    // Campo de Responsável Atual (Dropdown)
    const responsavelGroup = document.createElement('div');
    responsavelGroup.className = 'form-group';
    const responsavelLabel = document.createElement('label');
    responsavelLabel.textContent = 'Responsável Atual:';
    const responsavelSelect = document.createElement('select');
    responsavelSelect.className = 'form-control';
    RESPONSAVEL_ATUAL_OPTIONS.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        if (option === demanda.resp_atual) { // Assumindo que o campo é 'resp_atual'
            opt.selected = true;
        }
        responsavelSelect.appendChild(opt);
    });
    responsavelGroup.appendChild(responsavelLabel);
    responsavelGroup.appendChild(responsavelSelect);

    // Montar o modal
    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(saveBtn);

    modal.appendChild(modalTitle);
    // Exibir 'Marcar como Resolvido' primeiro
    modal.appendChild(resolvedGroup);
    modal.appendChild(statusGroup);
    modal.appendChild(gmudGroup);
    modal.appendChild(previsaoGroup);
    modal.appendChild(equipeGroup);
    modal.appendChild(analistaGroup);
    modal.appendChild(responsavelGroup);
    modal.appendChild(notaGroup);
    modal.appendChild(buttonContainer);

    overlay.appendChild(modal);
    
    // Focar inicialmente no campo de Status para melhor UX
    setTimeout(() => {
        try { statusSelect.focus(); } catch {}
    }, 100);

    console.log('Modal criado e adicionado ao DOM');
}