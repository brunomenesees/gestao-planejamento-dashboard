class AuthService {
    constructor() {
        this.baseUrl = '/api';
        this.token = localStorage.getItem('authToken');
        console.log('AuthService initialized with baseUrl:', this.baseUrl);
    }

    async login(username, password) {
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
                return true;
            } else {
                const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
                console.error('Login failed with status:', response.status);
                console.error('Error response:', errorData);
                return false;
            }
        } catch (error) {
            console.error('=== FRONTEND LOGIN ERROR ===');
            console.error('Error details:', error);
            console.error('Error message:', error.message);
            return false;
        }
    }

    async makeAuthenticatedRequest(endpoint, options = {}) {
        if (!this.token) {
            throw new Error('Não autenticado');
        }

        const response = await fetch(`${this.baseUrl}/mantis?endpoint=${endpoint}`, {
            ...options,
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        if (response.status === 401) {
            this.logout();
            throw new Error('Sessão expirada');
        }

        return response.json();
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