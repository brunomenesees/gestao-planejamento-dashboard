/**
 * Sistema de Logging Avançado para Gestão de Planejamento
 * Autor: Sistema Xcelis
 * Versão: 1.0.0
 */

class FileLogger {
    constructor(config = {}) {
        this.config = {
            maxLogsInMemory: config.maxLogsInMemory || 1000,
            autoSaveInterval: config.autoSaveInterval || 30000,
            autoSyncInterval: config.autoSyncInterval || 30000,
            enableConsole: config.enableConsole ?? true,
            enableAutoSave: config.enableAutoSave ?? true,
            enableAutoSync: config.enableAutoSync ?? false,
            logLevels: config.logLevels || ['error', 'warn', 'info', 'debug'],
            ...config
        };
        
        this.logs = [];
        this.sessionId = this.generateSessionId();
        this.autoSyncInterval = null;
        
        if (this.config.enableAutoSave) {
            this.startAutoSave();
        }

        if (this.config.enableAutoSync) {
            this.startAutoSync();
        }
        
        this.info('LOGGER', 'Sistema de logging inicializado', {
            session_id: this.sessionId,
            config: this.config
        });
    }

    // Método principal de logging
    log(level, category, message, data = {}, options = {}) {
        // Verificar se o nível está habilitado
        if (!this.config.logLevels.includes(level)) {
            return;
        }

        const logEntry = {
            timestamp: new Date().toISOString(),
            session_id: this.sessionId,
            level: level.toUpperCase(),
            category: category.toUpperCase(),
            message,
            data: this.sanitizeData(data),
            id: this.generateId(),
            url: window.location.href,
            user_agent: navigator.userAgent.substring(0, 100), // Limitar tamanho
            stack_trace: options.includeStack ? new Error().stack : null
        };

        this.logs.push(logEntry);
        
        // Console para desenvolvimento
        if (this.config.enableConsole) {
            this.logToConsole(logEntry);
        }

        // Gerenciar memória
        this.manageMemory();

        // Salvar erros críticos imediatamente apenas se explicitamente solicitado
        if (level === 'error' && options.saveImmediately === true) {
            this.saveErrorLog(logEntry);
        }

        return logEntry.id;
    }

    // Métodos de conveniência com padrões específicos
    error(category, message, data = {}, options = {}) {
        return this.log('error', category, message, data, { 
            includeStack: true, 
            saveImmediately: false, // Não salvar automaticamente
            ...options 
        });
    }

    warn(category, message, data = {}, options = {}) {
        return this.log('warn', category, message, data, options);
    }

    info(category, message, data = {}, options = {}) {
        return this.log('info', category, message, data, options);
    }

    debug(category, message, data = {}, options = {}) {
        return this.log('debug', category, message, data, options);
    }

    // Métodos específicos para casos de uso comuns
    logApiRequest(endpoint, method, requestData, options = {}) {
        return this.info('API-REQUEST', `${method} ${endpoint}`, {
            endpoint,
            method,
            requestId: this.generateId(),
            ...requestData
        }, options);
    }

    logApiResponse(endpoint, method, responseData, options = {}) {
        return this.info('API-RESPONSE', `${method} ${endpoint}`, {
            endpoint,
            method,
            ...responseData
        }, options);
    }

    logApiError(endpoint, method, errorData, options = {}) {
        return this.error('API-ERROR', `${method} ${endpoint}`, {
            endpoint,
            method,
            ...errorData
        }, options);
    }

    logUserAction(action, details = {}, options = {}) {
        return this.info('USER-ACTION', action, details, options);
    }

    logSystemEvent(event, details = {}, options = {}) {
        return this.info('SYSTEM-EVENT', event, details, options);
    }

    // Métodos utilitários
    sanitizeData(data) {
        try {
            const sensitiveKeys = ['password', 'token', 'auth', 'key', 'secret', 'credential'];
            
            return JSON.parse(JSON.stringify(data, (key, value) => {
                if (sensitiveKeys.some(sensitive => 
                    key.toLowerCase().includes(sensitive)
                )) {
                    return '***REDACTED***';
                }
                
                // Limitar tamanho de strings muito grandes
                if (typeof value === 'string' && value.length > 5000) {
                    return value.substring(0, 5000) + '...[TRUNCATED]';
                }
                
                return value;
            }));
        } catch (e) {
            return { 
                error: 'Não foi possível serializar os dados', 
                original: String(data).substring(0, 1000) 
            };
        }
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    generateSessionId() {
        return 'session_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
    }

    logToConsole(logEntry) {
        const consoleMethod = logEntry.level.toLowerCase() === 'error' ? 'error' : 
                             logEntry.level.toLowerCase() === 'warn' ? 'warn' : 'log';
        
        console[consoleMethod](
            `[${logEntry.timestamp}] [${logEntry.category}] ${logEntry.message}`,
            logEntry.data
        );
    }

    manageMemory() {
        if (this.logs.length > this.config.maxLogsInMemory) {
            // Apenas limpar logs antigos, não salvar automaticamente
            this.logs = this.logs.slice(-100); // Manter apenas os últimos 100
            this.info('LOGGER', 'Logs antigos removidos da memória', { 
                previousCount: this.logs.length + (this.config.maxLogsInMemory - 100),
                currentCount: this.logs.length 
            });
        }
    }

    // Métodos de salvamento
    saveLogsToFile(prefix = 'logs') {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${prefix}_${this.sessionId}_${timestamp}.txt`;
        
        const logContent = this.formatLogsForFile(this.logs);
        this.downloadFile(filename, logContent);
        
        this.info('LOGGER', 'Logs salvos em arquivo', { filename, logCount: this.logs.length });
    }

    saveErrorLog(errorEntry) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `error_${errorEntry.category}_${timestamp}.txt`;
        
        const errorContent = this.formatSingleLogForFile(errorEntry);
        
        // Salvar no localStorage para recuperação
        this.saveToLocalStorage('criticalErrors', errorEntry, 50);
        
        this.downloadFile(filename, errorContent);
    }

    // ===== MÉTODOS DE SINCRONIZAÇÃO COM SERVIDOR =====
    
    async sendLogsToServer(logsToSend = null) {
        try {
            const logs = logsToSend || this.logs;
            
            if (logs.length === 0) {
                this.debug('LOGGER', 'Nenhum log para enviar ao servidor');
                return { success: true, savedCount: 0 };
            }

            this.debug('LOGGER', `Enviando ${logs.length} logs para o servidor`);

            const response = await fetch('/api/logs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ logs })
            });

            if (!response.ok) {
                throw new Error(`Erro HTTP: ${response.status}`);
            }

            const result = await response.json();
            
            if (result.success) {
                this.info('LOGGER', 'Logs enviados ao servidor com sucesso', {
                    savedCount: result.savedCount,
                    totalLogs: result.totalLogs,
                    errors: result.errors?.length || 0
                });

                // Remover logs enviados com sucesso da memória
                if (!logsToSend && result.savedCount > 0) {
                    this.logs = this.logs.slice(result.savedCount);
                }
            }

            return result;

        } catch (error) {
            this.error('LOGGER', 'Erro ao enviar logs para o servidor', {
                error: error.message,
                logsCount: logsToSend?.length || this.logs.length
            });
            return { success: false, error: error.message };
        }
    }

    async loadLogsFromServer(filters = {}) {
        try {
            const params = new URLSearchParams({
                page: filters.page || 1,
                limit: filters.limit || 50,
                ...(filters.level && { level: filters.level }),
                ...(filters.category && { category: filters.category }),
                ...(filters.session_id && { session_id: filters.session_id }),
                ...(filters.search && { search: filters.search }),
                ...(filters.start_date && { start_date: filters.start_date }),
                ...(filters.end_date && { end_date: filters.end_date })
            });

            this.debug('LOGGER', 'Carregando logs do servidor', { filters });

            const response = await fetch(`/api/logs?${params}`);

            if (!response.ok) {
                throw new Error(`Erro HTTP: ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                this.info('LOGGER', 'Logs carregados do servidor', {
                    logsCount: result.logs.length,
                    totalLogs: result.stats.totalLogs,
                    page: result.pagination.currentPage
                });
            }

            return result;

        } catch (error) {
            this.error('LOGGER', 'Erro ao carregar logs do servidor', {
                error: error.message,
                filters
            });
            return { success: false, error: error.message };
        }
    }

    async exportLogsFromServer(filters = {}) {
        try {
            this.info('LOGGER', 'Exportando logs do servidor para arquivo');

            // Carregar todos os logs sem paginação
            const result = await this.loadLogsFromServer({
                ...filters,
                limit: 10000 // Limite alto para export
            });

            if (!result.success) {
                throw new Error(result.error);
            }

            // Gerar arquivo
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `server-logs_${timestamp}.txt`;
            const content = this.formatLogsForFile(result.logs);
            
            this.downloadFile(filename, content);
            
            this.info('LOGGER', 'Logs do servidor exportados', {
                filename,
                logsCount: result.logs.length
            });

            return { success: true, filename, logsCount: result.logs.length };

        } catch (error) {
            this.error('LOGGER', 'Erro ao exportar logs do servidor', {
                error: error.message,
                filters
            });
            return { success: false, error: error.message };
        }
    }

    async cleanupOldLogs() {
        try {
            this.info('LOGGER', 'Iniciando limpeza de logs antigos (72h)');

            const response = await fetch('/api/logs?action=cleanup', {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error(`Erro HTTP: ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                this.info('LOGGER', 'Limpeza de logs concluída', {
                    deletedCount: result.deletedCount,
                    cutoffDate: result.cutoffDate
                });
            }

            return result;

        } catch (error) {
            this.error('LOGGER', 'Erro ao limpar logs antigos', {
                error: error.message
            });
            return { success: false, error: error.message };
        }
    }

    startAutoSync() {
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
        }

        this.autoSyncInterval = setInterval(async () => {
            if (this.logs.length >= 10) { // Sync quando tiver 10+ logs
                await this.sendLogsToServer();
            }
        }, this.config.autoSyncInterval || 30000); // 30 segundos

        this.info('LOGGER', 'Auto-sync ativado', {
            interval: this.config.autoSyncInterval || 30000
        });
    }

    stopAutoSync() {
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
            this.autoSyncInterval = null;
            this.info('LOGGER', 'Auto-sync desativado');
        }
    }

    saveToLocalStorage(key, data, maxItems = 100) {
        try {
            const saved = JSON.parse(localStorage.getItem(key) || '[]');
            saved.push(data);
            localStorage.setItem(key, JSON.stringify(saved.slice(-maxItems)));
        } catch (e) {
            console.warn('Erro ao salvar no localStorage:', e);
        }
    }

    formatLogsForFile(logs) {
        let content = `=== LOG DO SISTEMA GESTÃO PLANEJAMENTO ===\n`;
        content += `Sessão: ${this.sessionId}\n`;
        content += `Gerado em: ${new Date().toISOString()}\n`;
        content += `Total de entradas: ${logs.length}\n`;
        content += `URL: ${window.location.href}\n`;
        content += `User Agent: ${navigator.userAgent}\n`;
        content += `\n${'='.repeat(80)}\n\n`;

        logs.forEach(log => {
            content += this.formatSingleLogForFile(log) + '\n';
        });

        return content;
    }

    formatSingleLogForFile(log) {
        let content = `[${log.timestamp}] [${log.level}] [${log.category}] ${log.message}\n`;
        
        if (log.data && Object.keys(log.data).length > 0) {
            content += `Dados: ${JSON.stringify(log.data, null, 2)}\n`;
        }
        
        if (log.stack_trace) {
            content += `Stack Trace:\n${log.stack_trace}\n`;
        }
        
        content += `ID: ${log.id} | Sessão: ${log.session_id}\n`;
        content += `-`.repeat(80) + '\n';
        
        return content;
    }

    downloadFile(filename, content) {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
    }

    startAutoSave() {
        // Auto-save desabilitado por padrão para evitar downloads automáticos
        // Pode ser habilitado manualmente se necessário
        if (this.config.enableAutoSave) {
            setInterval(() => {
                if (this.logs.length > 50) { // Só salva se tiver logs suficientes
                    this.saveLogsToFile('auto-backup');
                    this.debug('LOGGER', 'Auto-save executado', { logCount: this.logs.length });
                }
            }, this.config.autoSaveInterval);
        }
    }

    // Métodos de gerenciamento
    exportAllLogs() {
        const allData = {
            currentSession: this.logs,
            session_id: this.sessionId,
            savedErrors: JSON.parse(localStorage.getItem('criticalErrors') || '[]'),
            config: this.config,
            systemInfo: {
                timestamp: new Date().toISOString(),
                url: window.location.href,
                user_agent: navigator.userAgent,
                screen: {
                    width: screen.width,
                    height: screen.height
                },
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight
                }
            }
        };

        const filename = `complete-logs_${this.sessionId}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        this.downloadFile(filename, JSON.stringify(allData, null, 2));
        
        this.info('LOGGER', 'Logs completos exportados', { filename });
    }

    clearLogs() {
        const logCount = this.logs.length;
        this.logs = [];
        localStorage.removeItem('criticalErrors');
        this.info('LOGGER', 'Logs limpos', { previousLogCount: logCount });
    }

    getStats() {
        const stats = {
            totalLogs: this.logs.length,
            session_id: this.sessionId,
            byLevel: {},
            byCategory: {},
            timeRange: {
                first: this.logs[0]?.timestamp,
                last: this.logs[this.logs.length - 1]?.timestamp
            }
        };

        this.logs.forEach(log => {
            stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
            stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;
        });

        return stats;
    }
}

// Configuração baseada no ambiente
function createLogger() {
    const isDev = window.location.hostname === 'localhost' || 
                  window.location.hostname.includes('dev') ||
                  window.location.search.includes('debug=true');

    const config = {
        enableConsole: isDev,
        enableAutoSave: false, // Desabilitar auto-save por padrão
        enableAutoSync: !isDev, // Habilitar auto-sync em produção
        autoSaveInterval: isDev ? 10000 : 60000, // 10s dev, 1min prod
        autoSyncInterval: isDev ? 15000 : 30000, // 15s dev, 30s prod
        logLevels: isDev ? ['error', 'warn', 'info', 'debug'] : ['error', 'warn', 'info'],
        maxLogsInMemory: isDev ? 500 : 1000
    };

    return new FileLogger(config);
}

// Exportar para uso global
window.Logger = FileLogger;
window.logger = createLogger();

// Capturar erros não tratados (apenas se não for "Script error.")
window.addEventListener('error', (event) => {
    // Ignorar erros genéricos "Script error." que geralmente vêm de scripts externos
    if (event.message === 'Script error.' && event.filename === '' && event.lineno === 0) {
        return; // Não logar esses erros genéricos
    }
    
    window.logger.error('UNCAUGHT-ERROR', 'Erro JavaScript não tratado', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack
    }, { saveImmediately: false }); // Não salvar automaticamente
});

window.addEventListener('unhandledrejection', (event) => {
    // Apenas logar se for um erro significativo
    if (event.reason && event.reason.message !== 'Script error.') {
        window.logger.error('UNHANDLED-PROMISE', 'Promise rejeitada não tratada', {
            reason: event.reason,
            stack: event.reason?.stack
        }, { saveImmediately: false }); // Não salvar automaticamente
    }
});

console.log('Sistema de logging inicializado');
