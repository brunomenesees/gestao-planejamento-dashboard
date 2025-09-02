/**
 * Funções utilitárias para processamento de dados
 */

// Classe para gerenciar o armazenamento no IndexedDB
class DashboardStorage {
    constructor() {
        this.dbName = 'DashboardDB';
        this.chamadosStoreName = 'chamados';
        this.notificacoesStoreName = 'notificacoes';
        this.version = 3; // Incrementando versão para adicionar índices de chamados
    }

    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.chamadosStoreName)) {
                    const chamadosStore = db.createObjectStore(this.chamadosStoreName, { keyPath: 'numero' });
                    // Índices para busca rápida
                    chamadosStore.createIndex('timestamp', 'timestamp', { unique: false });
                    chamadosStore.createIndex('status', 'status', { unique: false });
                    chamadosStore.createIndex('ultimo_comentario', 'ultimo_comentario', { unique: false });
                }
                // Nova store para notificações
                if (!db.objectStoreNames.contains(this.notificacoesStoreName)) {
                    const notificationStore = db.createObjectStore(this.notificacoesStoreName, { keyPath: 'id' });
                    notificationStore.createIndex('lida', 'lida', { unique: false });
                }
            };
        });
    }

    async getTransaction(storeName, mode = 'readonly') {
        const db = await this.initDB();
        return db.transaction(storeName, mode).objectStore(storeName);
    }

    // --- Métodos para Chamados ---

    async limparDadosChamados() {
        const store = await this.getTransaction(this.chamadosStoreName, 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.clear();
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    async saveDadosChamados(dados) {
        await this.limparDadosChamados();
        const store = await this.getTransaction(this.chamadosStoreName, 'readwrite');
        const dadosComTimestamp = { timestamp: new Date().getTime(), dados: dados };
        return new Promise((resolve, reject) => {
            const request = store.put(dadosComTimestamp);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    async getDadosChamadosMaisRecentes() {
        const store = await this.getTransaction(this.chamadosStoreName);
        return new Promise((resolve, reject) => {
            const request = store.openCursor(null, 'prev');
            request.onerror = () => reject(request.error);
            request.onsuccess = (event) => resolve(event.target.result ? event.target.result.value.dados : null);
        });
    }

    // --- Métodos para Notificações (preparação para o próximo passo) ---

    async saveNotificacao(notificacao) {
        const store = await this.getTransaction(this.notificacoesStoreName, 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.add(notificacao);
            request.onerror = () => resolve(); // Ignora erro se a notificação já existe
            request.onsuccess = () => resolve();
        });
    }

    async getNotificacaoPorId(id) {
        const store = await this.getTransaction(this.notificacoesStoreName);
        return new Promise((resolve, reject) => {
            const request = store.get(id);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    async getNotificacoes() {
        const store = await this.getTransaction(this.notificacoesStoreName);
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    async getNotificacoesNaoLidasCount() {
        const store = await this.getTransaction(this.notificacoesStoreName);
        const index = store.index('lida');
        // FIX: Usa um método mais compatível para evitar o "DataError".
        // Em vez de usar index.count(), que se mostrou instável com chaves booleanas
        // em alguns navegadores, buscamos todos os registros e filtramos na memória.
        // Isso é mais robusto e garante que o dashboard sempre inicialize.
        return new Promise((resolve, reject) => {
            const request = index.getAll();
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result.filter(n => n.lida === false).length);
        });
    }

    async marcarComoLida(id) {
        const store = await this.getTransaction(this.notificacoesStoreName, 'readwrite');
        const request = store.get(id);
        request.onsuccess = () => {
            const data = request.result;
            if (data) {
                data.lida = true;
                store.put(data);
            }
        };
    }

    async marcarTodasComoLidas() {
        const store = await this.getTransaction(this.notificacoesStoreName, 'readwrite');
        const request = store.openCursor();
        request.onsuccess = event => {
            const cursor = event.target.result;
            if (cursor) {
                const updateData = cursor.value;
                updateData.lida = true;
                cursor.update(updateData);
                cursor.continue();
            }
        };
    }
}

// Normaliza os dados, preenchendo valores vazios e padronizando texto
function normalizeData(data) {
    return data.map(row => {
        const normalizedRow = {};
        for (const [key, value] of Object.entries(row)) {
            if (value === null || value === undefined || value === '') {
                normalizedRow[key] = 'N/A';
            } else if (typeof value === 'string') {
                normalizedRow[key] = value.toLowerCase().trim();
            } else {
                normalizedRow[key] = value;
            }
        }
        return normalizedRow;
    });
}

// Converte data UTC para horário de Brasília (UTC-3)
function convertToBrasiliaTime(dateString) {
    if (!dateString || dateString === 'N/A') {
        return 'N/A'; // Lida com strings de data vazias ou inválidas
    }
    try {
        const date = new Date(dateString);
        // Verifica se a data é válida após o parsing
        if (isNaN(date.getTime())) {
            return dateString; // Retorna a string original se não for uma data válida
        }

        // Usa a API Intl.DateTimeFormat para uma conversão de fuso horário robusta e correta.
        // 'America/Sao_Paulo' lida com UTC-3 e futuras mudanças de horário de verão automaticamente.
        const formatter = new Intl.DateTimeFormat('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false // Força o formato 24h
        });

        // O formato de saída será "dd/mm/aaaa, HH:mm:ss", vamos ajustar para o seu padrão
        return formatter.format(date).replace(',', '');

    } catch (error) {
        console.error('Erro ao converter data:', dateString, error);
        return dateString; // Em caso de erro, retorna o valor original
    }
}

// Calcula métricas de SLA
function calculateSLAMetrics(data) {
    // Lista de todos os campos de data que precisam de conversão
    const dateFieldsToConvert = [
        'data_abertura', 'data_inicio_atendimento', 'data_ultimo_comentario_ou_abertura_mantis',
        'data_comunicado_solucao_ou_primeiro_fechamento', 'data_fechamento', 'ultima_atualizacao', 'timestamp'
    ];

    const metrics = {
        totalChamados: data.length,
        slaAtendimento: 0,
        slaResolucao: 0,
        chamadosPorProjeto: {},
        chamadosPorStatus: {},
        chamadosPorSquad: {},
        chamadosPorRelator: {},
        chamadosPorAtribuicao: {},
        chamadosPorSolicitante: {},
        chamadosPorMes: {}
    };

    data.forEach(chamado => {
        // Converte todos os campos de data para o horário de Brasília
        dateFieldsToConvert.forEach(field => {
            if (chamado[field]) {
                chamado[field] = convertToBrasiliaTime(chamado[field]);
            }
        });
        
        // Calcula SLAs
        if (chamado.tempo_inicio) {
            metrics.slaAtendimento += parseFloat(chamado.tempo_inicio);
        }
        if (chamado.tempo_resolucao) {
            metrics.slaResolucao += parseFloat(chamado.tempo_resolucao);
        }

        // Agrupa por projeto
        metrics.chamadosPorProjeto[chamado.projeto] = (metrics.chamadosPorProjeto[chamado.projeto] || 0) + 1;
        
        // Agrupa por status
        metrics.chamadosPorStatus[chamado.status] = (metrics.chamadosPorStatus[chamado.status] || 0) + 1;
        
        // Agrupa por squad
        metrics.chamadosPorSquad[chamado.squad] = (metrics.chamadosPorSquad[chamado.squad] || 0) + 1;
        
        // Agrupa por relator
        metrics.chamadosPorRelator[chamado.relator] = (metrics.chamadosPorRelator[chamado.relator] || 0) + 1;
        
        // Agrupa por atribuição
        metrics.chamadosPorAtribuicao[chamado.atribuicao] = (metrics.chamadosPorAtribuicao[chamado.atribuicao] || 0) + 1;
        
        // Agrupa por solicitante
        metrics.chamadosPorSolicitante[chamado.solicitante] = (metrics.chamadosPorSolicitante[chamado.solicitante] || 0) + 1;
        
        // Agrupa por mês
        const mes = chamado.timestamp.substring(3, 10); // Formato MM/YYYY
        metrics.chamadosPorMes[mes] = metrics.chamadosPorMes[mes] || { abertos: 0, fechados: 0 };
        if (chamado.estado === 'fechado') {
            metrics.chamadosPorMes[mes].fechados++;
        } else {
            metrics.chamadosPorMes[mes].abertos++;
        }
    });

    // Calcula médias de SLA
    metrics.slaAtendimento = metrics.slaAtendimento / metrics.totalChamados;
    metrics.slaResolucao = metrics.slaResolucao / metrics.totalChamados;

    return metrics;
}

// Atualiza os cards KPI
function updateKPICards(metrics) {
    document.getElementById('totalChamados').textContent = metrics.totalChamados;
    document.getElementById('slaAtendimento').textContent = formatTime(metrics.slaAtendimento);
    document.getElementById('slaResolucao').textContent = formatTime(metrics.slaResolucao);
}

// Formata tempo em horas e minutos
function formatTime(hours) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}min`;
}

// Preenche os selects com opções únicas
function populateSelects(data) {
    const fields = ['projeto', 'categoria', 'squad', 'solicitante', 'atribuicao'];
    
    fields.forEach(field => {
        const select = document.getElementById(`filter-${field}`);
        const uniqueValues = [...new Set(data.map(item => item[field]))].sort();
        
        uniqueValues.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
        });
    });
}

// Cria filtros dinâmicos baseados nas colunas do dataset
function createFilters(data) {
    const filterControls = document.getElementById('filterControls');
    filterControls.innerHTML = '';

    if (!data || data.length === 0) return;

    const columns = Object.keys(data[0]);
    
    columns.forEach(column => {
        const filterDiv = document.createElement('div');
        filterDiv.className = 'filter-group';
        
        const label = document.createElement('label');
        label.textContent = column;
        label.htmlFor = `filter-${column}`;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.id = `filter-${column}`;
        input.placeholder = `Filtrar por ${column}`;
        input.addEventListener('input', () => applyFilters(data));
        
        filterDiv.appendChild(label);
        filterDiv.appendChild(input);
        filterControls.appendChild(filterDiv);
    });
}

// Aplica os filtros aos dados
function applyFilters(data) {
    const filters = {};
    const filterInputs = document.querySelectorAll('#filterControls input');
    
    filterInputs.forEach(input => {
        const column = input.id.replace('filter-', '');
        if (input.value) {
            filters[column] = input.value.toLowerCase();
        }
    });

    return data.filter(row => {
        return Object.entries(filters).every(([column, value]) => {
            return String(row[column]).toLowerCase().includes(value);
        });
    });
}

// Processa arquivo CSV
function processCSV(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            complete: (results) => {
                const normalizedData = normalizeData(results.data);
                const metrics = calculateSLAMetrics(normalizedData);
                updateKPICards(metrics);
                populateSelects(normalizedData);
                resolve(normalizedData);
            },
            error: (error) => reject(error)
        });
    });
}

// Processa arquivo Excel
function processExcel(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                const normalizedData = normalizeData(jsonData);
                const metrics = calculateSLAMetrics(normalizedData);
                updateKPICards(metrics);
                populateSelects(normalizedData);
                resolve(normalizedData);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
} 
/**
 * Formata uma string de data ISO 8601 para o formato 'dd/mm/yyyy HH:MM:ss'
 * mantendo o horário original em UTC, sem aplicar conversões de fuso horário.
 * @param {string | null} isoString - A string de data no formato ISO 8601 (ex: "2025-07-03T06:52:00Z").
 * @returns {string} A data formatada ou 'N/A' se a entrada for inválida.
 */
function formatUTCDateString(isoString) {
    if (!isoString || isoString === 'N/A') {
        return 'N/A';
    }
    try {
        const date = new Date(isoString);
        // Verifica se a data criada é válida
        if (isNaN(date.getTime())) {
            return 'N/A';
        }

        const day = String(date.getUTCDate()).padStart(2, '0');
        const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // Mês em JS é 0-indexado
        const year = date.getUTCFullYear();
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        const seconds = String(date.getUTCSeconds()).padStart(2, '0');

        return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    } catch (error) {
        console.error(`Erro ao formatar data UTC: ${isoString}`, error);
        return 'N/A';
    }
}
