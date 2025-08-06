// Dados globais - inicializados vazios
let demandasData = [];
let currentPage = 1;
let rowsPerPage = 20;
let filteredData = [];
let hiddenColumns = new Set();

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
    'Aguardando Deploy',
    'Ajuste Especificação',
    'Ajustes',
    'Análise Suporte',
    'Code Review',
    'Desenvolvimento',
    'Especificação',
    'Fila ABAP',
    'Fila Analytics',
    'Fila Especificação',
    'Fila WEB',
    'Pendência Cliente',
    'Testes'
];
// Lista de opções para os novos modais de atualização
const SQUAD_OPTIONS = [
    "AMS", "Analytics ", "ABAP ", "Infra ", "LowCode ", "PMO",
    "Requisitos ", "Python ", "SAP ", "Web"
];

// TODO: Substituir com a lista real de analistas
const ANALISTA_RESPONSAVEL_OPTIONS = [
    "bruno.tavares", "daniel.paraizo", "elaine.santos", "gabriel.matos", "gustavo.magalhaes", 
    "thiago.caldeira", "tiago.nogueira", "vinicius.vieira", "viviane.silva"
];

// TODO: Substituir com a lista real de responsáveis
const RESPONSAVEL_ATUAL_OPTIONS = [
    "Bruno Tavares", "Daniel Paraizo", "Elaine Santos", "Gabriel Matos", "Giovanni Mussolini", 
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

async function loadInitialData() {
    try {
        const data = await getChamados();
        if (data && data.length > 0) {
            demandasData = data; // Usa os dados diretamente do DB
            // Restante da lógica de inicialização que depende dos dados
            selectedProjetoFilter = new Set(demandasData.map(c => c.projeto).filter(Boolean));
            selectedSquadFilter = new Set();
            if (hiddenColumns.size === 0) {
                hiddenColumns = new Set(DEFAULT_HIDDEN_COLUMNS);
            }
            updateFilterOptions();
            filterData();
            const ultimaData = localStorage.getItem('ultimaAtualizacao');
            if (ultimaData) {
                document.getElementById('ultimaAtualizacao').textContent = `Última atualização: ${ultimaData}`;
            }
        } else {
            // Se não há dados, o dashboard simplesmente ficará vazio.
            updateDashboard(); 
        }
    } catch (error) {
        console.error('Erro ao carregar dados iniciais do IndexedDB:', error);
        // Em caso de erro, o dashboard ficará vazio.
        updateDashboard();
    }
}

// Inicialização do dashboard
document.addEventListener('DOMContentLoaded', async function() {
    // Configurar tema e navegação SEMPRE (usados em todas as páginas)
    setupTheme();
    setupNavigation();

    // Só executa a lógica do dashboard se existir o elemento principal
    if (document.getElementById('dashboard') || document.getElementById('chamadosTable')) {
        
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
            setupColumnToggle();
            
            // Aplica a visibilidade das colunas imediatamente
            applyColumnVisibility();
            
            const refreshButton = document.getElementById('refreshButton');
            if (refreshButton) {
                refreshButton.addEventListener('click', atualizarDados);
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
                            
                            alert('Dados carregados e salvos com sucesso!');
                            loadingSpan.style.display = 'none';
                        },
                        error: function(error) {
                            console.error('Erro ao processar CSV:', error);
                            loadingSpan.style.display = 'none';
                            alert('Erro ao processar o arquivo CSV');
                        }
                    });
                } catch (error) {
                    console.error('Erro ao processar arquivo:', error);
                    loadingSpan.style.display = 'none';
                    alert('Erro ao processar o arquivo');
                }
            };

            reader.onerror = () => {
                console.error('Erro ao ler arquivo');
                loadingSpan.style.display = 'none';
                alert('Erro ao ler o arquivo');
            };

            reader.readAsText(file, 'ISO-8859-1');
        } catch (error) {
            console.error('Erro ao processar arquivo:', error);
            loadingSpan.style.display = 'none';
            alert('Erro ao processar o arquivo');
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
            alert('Nenhum dado válido foi encontrado no arquivo CSV. Verifique se o arquivo contém uma coluna de identificação para os tickets (ex: "Núm", "Ticket", "ID") e se ela está preenchida.');
        }
        
        return processedData;

    } catch (error) {
        console.error('Erro ao processar dados:', error);
        alert('Ocorreu um erro ao processar os dados do arquivo. Verifique o console para mais detalhes.');
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
    
    filteredData = demandasData.filter(demanda => {
        // Regra especial para categoria "Suporte Informatica"
        // Só incluir se tiver um responsável atual definido (campo resp_atual)
        // Caso não tenha um resp_atual definido e/ou esteja em branco/nulo, não deve ser contabilizado
        if (demanda.categoria && demanda.categoria.toLowerCase().trim() === 'suporte informatica') {
            if (!demanda.resp_atual || demanda.resp_atual.trim() === '') {
                return false; // Excluir chamados de Suporte Informatica sem responsável atual
            }
        }

        if (!selectedProjetoFilter.has(demanda.projeto)) {
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
        count: filteredData.filter(c => (c.squad || '').toLowerCase().trim() === s.toLowerCase().trim() && c.dataAbertura).length
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
            if (!c.dataAbertura) return false;
            const partes = c.dataAbertura.split(' ');
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
        count: filteredData.filter(c => c.atribuicao === a && c.dataAbertura).length
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
    
    const filteredByStatus = dataToShow.filter(demanda => {
        return selectedStatusFilter.has(demanda.estado);
    });

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
    
    pageData.forEach(demanda => {
        const row = document.createElement('tr');
        row.setAttribute('data-demanda', demanda.numero);
        row.className = 'status-dropdown-row';

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
            formatarHorasMinutos(calcularTempoTotal(demanda)) || '',
            demanda.status || ''
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
            } else if (index === 3) { // Descrição com tooltip
                td.textContent = valor;
                td.setAttribute('title', decodificarTexto(demanda.resumo) || '');
            } else if (index === 4) { // Equipe
                td.textContent = valor;
                td.classList.add('clickable-cell');
                td.addEventListener('click', () => {
                    createSimpleUpdateModal(demanda.numero, valor, 'Atualizar Equipe', SQUAD_OPTIONS, 49, td);
                });
            } else if (index === 5) { // Analista Responsavel
                td.textContent = valor;
                td.classList.add('clickable-cell');
                td.addEventListener('click', () => {
                    createSimpleUpdateModal(demanda.numero, valor, 'Atualizar Analista Responsável', ANALISTA_RESPONSAVEL_OPTIONS, 65, td);
                });
            } else if (index === 6) { // Responsavel Atual
                td.textContent = valor;
                td.classList.add('clickable-cell');
                td.addEventListener('click', () => {
                    createSimpleUpdateModal(demanda.numero, valor, 'Atualizar Responsável Atual', RESPONSAVEL_ATUAL_OPTIONS, 69, td);
                });
            } else if (index === 14) { // Coluna Status - Dropdown editável
                console.log('Criando dropdown para coluna Status:', valor, demanda.numero);
                td.className = 'col-center status-dropdown-cell';
                createStatusDropdown(td, valor, demanda.numero);
            } else {
                td.textContent = valor;
            }
            row.appendChild(td);
        });

        tbody.appendChild(row);
    });

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
        alert('Não há dados para exportar.');
        return;
    }
    
    const ws = XLSX.utils.json_to_sheet(filteredData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Demandas");
    XLSX.writeFile(wb, "demandas.xlsx");
}

function exportToCSV() {
    if (filteredData.length === 0) {
        alert('Não há dados para exportar.');
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
     // Lógica para forçar a atualização dos dados, se necessário.
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

function mostrarNotificacao(mensagem, tipo) {
    // Implementação simples de notificação via alert
    alert(`[${tipo.toUpperCase()}] ${mensagem}`);
}

/**
 * Atualiza um único campo customizado no Mantis.
 * @param {string} ticketNumber - O número do ticket.
 * @param {number} fieldId - O ID do campo customizado a ser atualizado.
 * @param {string} newValue - O novo valor para o campo.
 * @returns {Promise<boolean>} - Retorna true se a atualização for bem-sucedida, false caso contrário.
 */
async function updateMantisCustomField(ticketNumber, fieldId, newValue) {
    const token = window.AppConfig.MANTIS_API_TOKEN;
    const issueUrl = window.AppConfig.getMantisApiUrl(`issues/${ticketNumber}`);

    const body = {
        custom_fields: [
            {
                field: { id: fieldId },
                value: newValue
            }
        ]
    };

    try {
        const response = await fetch(issueUrl, {
            method: 'PATCH',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (response.ok) {
            const responseData = await response.json();
            console.log('Campo customizado atualizado com sucesso:', responseData);
            mostrarNotificacao(`Campo customizado do ticket ${ticketNumber} atualizado com sucesso.`, 'sucesso');
            
            // Atualizar o campo "Última atualização" no banco local
            try {
                await updateDemandaLastUpdated(ticketNumber);
            } catch (error) {
                console.error('Erro ao atualizar campo ultima_atualizacao:', error);
            }
            
            return true;
        } else {
            const errorData = await response.json();
            console.error('Erro ao atualizar campo customizado:', errorData);
            mostrarNotificacao(`Erro ao atualizar o ticket ${ticketNumber}: ${errorData.message}`, 'erro');
            return false;
        }
    } catch (error) {
        console.error('Erro de rede ao atualizar campo customizado:', error);
        mostrarNotificacao(`Erro de rede ao tentar comunicar com o Mantis para o ticket ${ticketNumber}.`, 'erro');
        return false;
    }
}

/**
 * Atualiza o responsável (handler) de um ticket no Mantis.
 * @param {string} ticketNumber - O número do ticket.
 * @param {string} newHandlerUsername - O nome de usuário do novo responsável.
 * @returns {Promise<boolean>} - Retorna true se a atualização for bem-sucedida, false caso contrário.
 */
async function updateMantisHandler(ticketNumber, newHandlerUsername) {
    const token = window.AppConfig.MANTIS_API_TOKEN;
    const issueUrl = window.AppConfig.getMantisApiUrl(`issues/${ticketNumber}`);

    const body = {
        handler: {
            name: newHandlerUsername
        }
    };

    try {
        const response = await fetch(issueUrl, {
            method: 'PATCH',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (response.ok) {
            const responseData = await response.json();
            console.log('Responsável atualizado com sucesso:', responseData);
            mostrarNotificacao(`Responsável do ticket ${ticketNumber} atualizado com sucesso.`, 'sucesso');
            
            // Atualizar o campo "Última atualização" no banco local
            try {
                await updateDemandaLastUpdated(ticketNumber);
            } catch (error) {
                console.error('Erro ao atualizar campo ultima_atualizacao:', error);
            }
            
            return true;
        } else {
            const errorData = await response.json();
            console.error('Erro ao atualizar responsável:', errorData);
            mostrarNotificacao(`Erro ao atualizar o responsável do ticket ${ticketNumber}: ${errorData.message}`, 'erro');
            return false;
        }
    } catch (error) {
        console.error('Erro de rede ao atualizar responsável:', error);
        mostrarNotificacao(`Erro de rede ao tentar comunicar com o Mantis para o ticket ${ticketNumber}.`, 'erro');
        return false;
    }
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
    // Remove qualquer modal similar que já esteja aberto
    const existingModal = document.querySelector('.simple-update-modal');
    if (existingModal) {
        existingModal.remove();
    }

    const modalContainer = document.createElement('div');
    modalContainer.className = 'simple-update-modal';

    const modalContent = document.createElement('div');
    modalContent.className = 'simple-update-modal-content';

    modalContent.innerHTML = `
        <h3>${modalTitle}</h3>
        <div class="ticket-info">
            <strong>Ticket:</strong> ${ticketNumber}<br>
            <strong>Valor Atual:</strong> ${currentValue || 'N/A'}
        </div>
        <label for="simple-update-select">Novo Valor:</label>
        <select id="simple-update-select"></select>
        <div class="simple-update-modal-buttons">
            <button class="cancel-btn">Cancelar</button>
            <button class="save-btn">Salvar</button>
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

    saveBtn.addEventListener('click', async () => {
        const newValue = select.value;
        if (newValue !== currentValue) {
            let success = false;
            if (customFieldId === 65) { // Caso especial para Analista Responsável (handler)
                success = await updateMantisHandler(ticketNumber, newValue);
            } else { // Para outros campos customizados
                success = await updateMantisCustomField(ticketNumber, customFieldId, newValue);
            }

            if (success) {
                targetCell.textContent = newValue;
                modalContainer.remove();
                mostrarNotificacao(`Campo "${modalTitle.replace('Atualizar ', '')}" do ticket ${ticketNumber} atualizado com sucesso.`, 'sucesso');
            }
        } else {
            modalContainer.remove();
        }
    });

    cancelBtn.addEventListener('click', () => {
        modalContainer.remove();
    });

    modalContainer.appendChild(modalContent);
    document.body.appendChild(modalContainer);
}

async function postToMantis(ticketNumber, text, newStatus, gmudValue) {
    const token = window.AppConfig.MANTIS_API_TOKEN;
    const noteUrl = window.AppConfig.getMantisApiUrl(`issues/${ticketNumber}/notes`);
    const issueUrl = window.AppConfig.getMantisApiUrl(`issues/${ticketNumber}`);

    // Promise para adicionar a nota (comportamento antigo)
    const addNotePromise = fetch(noteUrl, {
        method: 'POST',
        headers: {
            'Authorization': token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            text: text,
            view_state: {
                name: 'public'
            }
        })
    });

    // Corpo da requisição para atualizar a issue
    const issueUpdateBody = {
        custom_fields: [
            {
                field: {
                    id: 70, // ID do campo customizado "Status"
                    name: "Status"
                },
                value: newStatus // O valor do status que o usuário selecionou
            }
        ]
    };

    // Adicionar o campo customizado de GMUD se houver valor
    if (gmudValue) {
        const year = new Date().getFullYear();
        issueUpdateBody.custom_fields.push({
            field: {
                id: 71, // ID Fixo para o campo GMUD
                name: "Numero_GMUD"
            },
            value: gmudValue
        });
    }
    
    // Se não houver GMUD, removemos o campo para não enviar um array vazio desnecessariamente
    if (issueUpdateBody.custom_fields.length === 0) {
        delete issueUpdateBody.custom_fields;
    }

    // Promise para atualizar a issue (novo comportamento)
    const updateIssuePromise = fetch(issueUrl, {
        method: 'PATCH',
        headers: {
            'Authorization': token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(issueUpdateBody)
    });

    try {
        // Executa as duas requisições em paralelo
        const [noteResponse, issueResponse] = await Promise.all([addNotePromise, updateIssuePromise]);

        // Tratamento da resposta da nota
        if (noteResponse.ok) {
            const responseData = await noteResponse.json();
            console.log('Nota adicionada com sucesso:', responseData);
            mostrarNotificacao(`Comentário adicionado ao ticket ${ticketNumber} com sucesso!`, 'sucesso');
        } else {
            const errorData = await noteResponse.json();
            console.error('Erro ao adicionar nota:', errorData);
            mostrarNotificacao(`Erro ao adicionar comentário ao ticket ${ticketNumber}: ${errorData.message}`, 'erro');
        }

        // Tratamento da resposta da atualização da issue
        if (issueResponse.ok) {
            const responseData = await issueResponse.json();
            console.log('Issue atualizada com sucesso:', responseData);
            mostrarNotificacao(`Status e/ou GMUD do ticket ${ticketNumber} atualizados com sucesso!`, 'sucesso');
            
            // Atualizar o campo "Última atualização" no banco local
            try {
                await updateDemandaLastUpdated(ticketNumber);
            } catch (error) {
                console.error('Erro ao atualizar campo ultima_atualizacao:', error);
            }
        } else {
            const errorData = await issueResponse.json();
            console.error('Erro ao atualizar a issue:', errorData);
            mostrarNotificacao(`Erro ao atualizar status/GMUD do ticket ${ticketNumber}: ${errorData.message}`, 'erro');
        }

    } catch (error) {
        console.error('Erro nas requisições para o Mantis:', error);
        mostrarNotificacao(`Erro de rede ao tentar comunicar com o Mantis para o ticket ${ticketNumber}.`, 'erro');
    }
}

// Função para mostrar modal de confirmação com observação customizada
function showActionButtons(container, newStatus, ticketNumber) {
    console.log('showActionButtons chamada:', newStatus, ticketNumber);
    
    // Remover modais existentes se houver
    const existingModal = document.querySelector('.status-modal');
    if (existingModal) {
        existingModal.remove();
    }

    const modalContainer = document.createElement('div');
    modalContainer.className = 'status-modal';
    modalContainer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    const modalContent = document.createElement('div');
    modalContent.className = 'status-modal-content';

    modalContent.innerHTML = `
        <h3>Confirmar Alteração de Status</h3>
        <div class="ticket-info">
            <strong>Ticket:</strong> ${ticketNumber}<br>
            <strong>Valor Atual:</strong> ${newStatus || 'N/A'}
        </div>
        <label for="simple-update-select">Novo Valor:</label>
        <select id="simple-update-select"></select>
        <div class="simple-update-modal-buttons">
            <button class="cancel-btn">Cancelar</button>
            <button class="save-btn">Salvar</button>
        </div>
    `;

    const select = modalContent.querySelector('#simple-update-select');
    STATUS_OPTIONS.sort().forEach(optionValue => {
        const option = document.createElement('option');
        option.value = optionValue;
        option.textContent = optionValue;
        if (optionValue === newStatus) {
            option.selected = true;
        }
        select.appendChild(option);
    });

    const saveBtn = modalContent.querySelector('.save-btn');
    const cancelBtn = modalContent.querySelector('.cancel-btn');

    saveBtn.addEventListener('click', async () => {
        const newValue = select.value;
        if (newValue !== newStatus) {
            let success = false;
            success = await updateMantisCustomField(ticketNumber, 70, newValue);

            if (success) {
                container.querySelector('.status-dropdown-btn').textContent = newValue;
                modalContainer.remove();
                mostrarNotificacao(`Campo "Status" do ticket ${ticketNumber} atualizado com sucesso.`, 'sucesso');
            }
        } else {
            modalContainer.remove();
        }
    });

    cancelBtn.addEventListener('click', () => {
        modalContainer.remove();
    });

    modalContainer.appendChild(modalContent);
    document.body.appendChild(modalContainer);
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

async function atualizarDados() {
     // Lógica para forçar a atualização dos dados, se necessário.
 }