class AuthService {
    constructor() {
        this.baseUrl = '/api';
        this.token = localStorage.getItem('authToken');
        console.log('AuthService initialized with baseUrl:', this.baseUrl);
    }

    async login(username, password) {
        const loginId = window.logger?.generateId() || Date.now().toString(36);
        
        window.logger?.info('AUTH-LOGIN-START', 'Tentativa de login iniciada', {
            loginId,
            username,
            hasPassword: !!password,
            timestamp: new Date().toISOString()
        });
        
        console.log('=== FRONTEND LOGIN ATTEMPT ===');
        console.log('Username:', username);
        console.log('Password provided:', password ? 'YES' : 'NO');
        console.log('Making request to:', `${this.baseUrl}/auth`);
        
        try {
            const requestBody = { username, password };
            console.log('Request body:', { ...requestBody, password: '***' });
            
            const response = await fetch(`${this.baseUrl}/auth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            console.log('Response status:', response.status);
            console.log('Response headers:', response.headers);
            
            if (response.ok) {
                const data = await response.json();
                console.log('Login successful, received data:', { ...data, token: '***' });
                
                this.token = data.token;
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                
                window.logger?.info('AUTH-LOGIN-SUCCESS', 'Login realizado com sucesso', {
                    loginId,
                    username,
                    userRole: data.user?.role,
                    tokenLength: data.token?.length
                });
                
                return true;
            } else {
                const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
                
                window.logger?.warn('AUTH-LOGIN-FAILED', 'Falha na autenticação', {
                    loginId,
                    username,
                    status: response.status,
                    errorData
                });
                
                console.error('Login failed with status:', response.status);
                console.error('Error response:', errorData);
                return false;
            }
        } catch (error) {
            window.logger?.error('AUTH-LOGIN-ERROR', 'Erro durante o login', {
                loginId,
                username,
                error: error.message,
                stack: error.stack
            });
            
            console.error('=== FRONTEND LOGIN ERROR ===');
            console.error('Error details:', error);
            console.error('Error message:', error.message);
            return false;
        }
    }

    async makeAuthenticatedRequest(endpoint, options = {}) {
        const requestId = window.logger?.generateId() || Date.now().toString(36);
        
        if (!this.token) {
            window.logger?.error('AUTH-SERVICE', 'Token não disponível', { 
                endpoint, 
                requestId 
            });
            throw new Error('Não autenticado');
        }

        const fullUrl = `${this.baseUrl}/mantis?endpoint=${endpoint}`;
        const requestPayload = {
            ...options,
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        // Log: Requisição completa sendo enviada
        window.logger?.info('AUTH-REQUEST', 'Enviando para proxy', {
            requestId,
            url: fullUrl,
            method: options.method || 'GET',
            headers: { ...requestPayload.headers, Authorization: 'Bearer ***' },
            bodySize: options.body ? options.body.length : 0,
            bodyContent: options.body
        });

        try {
            const response = await fetch(fullUrl, requestPayload);

            // Log: Resposta do proxy
            window.logger?.info('AUTH-RESPONSE', 'Resposta do proxy recebida', {
                requestId,
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries())
            });

            if (response.status === 401) {
                window.logger?.warn('AUTH-SESSION', 'Sessão expirada - fazendo logout', {
                    requestId,
                    endpoint,
                    status: response.status
                });
                this.logout();
                throw new Error('Sessão expirada');
            }

            if (!response.ok) {
                // Log: Erro detalhado com corpo da resposta
                let errorBody;
                try {
                    errorBody = await response.text();
                } catch (e) {
                    errorBody = 'Não foi possível ler o corpo da resposta';
                }
                
                window.logger?.error('AUTH-HTTP-ERROR', 'Erro HTTP na requisição', {
                    requestId,
                    status: response.status,
                    statusText: response.statusText,
                    url: fullUrl,
                    requestBody: options.body,
                    responseBody: errorBody
                });
                
                throw new Error(`HTTP ${response.status}: ${errorBody}`);
            }

            const jsonResponse = await response.json();
            
            window.logger?.info('AUTH-SUCCESS', 'Requisição bem-sucedida', {
                requestId,
                endpoint,
                responseSize: JSON.stringify(jsonResponse).length
            });

            return jsonResponse;
            
        } catch (error) {
            if (error.message !== 'Sessão expirada') {
                window.logger?.error('AUTH-NETWORK-ERROR', 'Erro de rede na requisição', {
                    requestId,
                    endpoint,
                    error: error.message,
                    stack: error.stack
                });
            }
            throw error;
        }
    }

    async changePassword(currentPassword, newPassword) {
        if (!this.token) {
            throw new Error('Não autenticado');
        }

        const resp = await fetch(`${this.baseUrl}/change-password`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ currentPassword, newPassword })
        });

        if (resp.status === 204) {
            return { ok: true };
        }
        if (resp.status === 401) {
            this.logout();
            return { ok: false, error: 'Sessão expirada' };
        }

        let data = null;
        try { data = await resp.json(); } catch {}
        return { ok: false, status: resp.status, error: data?.error || 'Erro na troca de senha', details: data?.details };
    }

    logout() {
        this.token = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        window.location.href = '/login.html';
    }

    isAuthenticated() {
        return !!this.token;
    }
}

// Instância global
window.authService = new AuthService();