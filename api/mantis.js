import jwt from 'jsonwebtoken';

// Middleware de autenticação
function verifyToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;

    const token = authHeader.split(' ')[1];
    if (!token) return null;

    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        return null;
    }
}

export default async function handler(req, res) {
    // Configurar CORS de forma segura
    const allowedOrigins = [
        'https://gestao-planejamento-dashboard.vercel.app',
        'http://localhost:3000'
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Verificar autenticação
    const user = verifyToken(req);
    if (!user) {
        return res.status(401).json({ error: 'Não autorizado' });
    }

    try {
        const { endpoint } = req.query;
        const mantisUrl = `${process.env.MANTIS_BASE_URL}/api/rest/${endpoint}`;
        
        const method = req.method;
        const headers = {
            'Authorization': process.env.MANTIS_API_TOKEN,
        };
        // Define Content-Type apenas quando houver corpo
        const canHaveBody = method !== 'GET' && method !== 'HEAD';
        if (canHaveBody) {
            headers['Content-Type'] = 'application/json';
        }

        const fetchOptions = { method, headers };
        if (canHaveBody && req.body && Object.keys(req.body).length > 0) {
            fetchOptions.body = JSON.stringify(req.body);
        }

        const response = await fetch(mantisUrl, fetchOptions);

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('Erro ao comunicar com Mantis:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
}