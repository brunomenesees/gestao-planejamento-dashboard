import { verifyToken, corsHeaders } from './middleware.js';

export default async function handler(req, res) {
    console.log('=== JOBS API CALLED ===');
    console.log('Method:', req.method);
    console.log('Query params:', req.query);
    
    // Configurar CORS
    corsHeaders(res);

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    // Verificar autenticação
    const user = verifyToken(req);
    if (!user) {
        return res.status(401).json({ error: 'Token inválido ou expirado' });
    }

    try {
        // Usar proxy server local ao invés de conexão direta
        const proxyUrl = process.env.JOBS_PROXY_URL || 'http://localhost:3001';
        const proxyApiKey = process.env.JOBS_PROXY_API_KEY;
        
        // Construir URL com query parameters
        const urlParams = new URLSearchParams(req.query);
        const proxyEndpoint = `${proxyUrl}/api/jobs?${urlParams.toString()}`;
        
        console.log('Fazendo requisição para proxy:', proxyEndpoint);
        
        // Headers para o proxy
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (proxyApiKey) {
            headers['X-API-Key'] = proxyApiKey;
        }
        
        // Fazer requisição para o proxy
        const proxyResponse = await fetch(proxyEndpoint, {
            method: 'GET',
            headers
        });
        
        if (!proxyResponse.ok) {
            throw new Error(`Proxy error: ${proxyResponse.status} ${proxyResponse.statusText}`);
        }
        
        const data = await proxyResponse.json();
        
        console.log(`Proxy retornou ${data.data?.length || 0} registros`);
        
        res.json(data);

    } catch (error) {
        console.error('Erro na API de jobs:', error);
        res.status(500).json({ 
            error: 'Erro interno do servidor', 
            details: error.message 
        });
    }
}
