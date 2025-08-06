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
    // Configurar CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
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
        
        const response = await fetch(mantisUrl, {
            method: req.method,
            headers: {
                'Authorization': process.env.MANTIS_API_TOKEN,
                'Content-Type': 'application/json',
                ...(req.body && { 'Content-Type': 'application/json' })
            },
            ...(req.body && { body: JSON.stringify(req.body) })
        });

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('Erro ao comunicar com Mantis:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
}