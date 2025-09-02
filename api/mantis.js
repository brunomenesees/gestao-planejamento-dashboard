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
        const { endpoint, ...restQuery } = req.query;
        // Suporta duas formas de envio pelo frontend:
        // 1) endpoint já contendo a própria query string (ex: "issues?page=1&page_size=250")
        // 2) endpoint apenas com o caminho (ex: "issues") e os demais parâmetros em restQuery (ex: page, page_size, include)
        // Se endpoint vier com query sem estar codificada, o Vercel/Node dividirá em req.query.
        // Precisamos recompor a query integral: query presente no endpoint + quaisquer pares extras em restQuery.
        const endpointStr = String(endpoint || '');
        const qIdx = endpointStr.indexOf('?');
        const endpointPath = qIdx >= 0 ? endpointStr.slice(0, qIdx) : endpointStr;
        const existingQS = qIdx >= 0 ? endpointStr.slice(qIdx + 1) : '';
        const usp = new URLSearchParams(existingQS);
        // Anexa parâmetros de restQuery que não existirem ainda
        for (const k of Object.keys(restQuery || {})) {
            const v = restQuery[k];
            if (v != null && !usp.has(k)) usp.set(k, String(v));
        }
        let mantisUrl = `${process.env.MANTIS_BASE_URL}/api/rest/${endpointPath}`;
        const finalQS = usp.toString();
        if (finalQS) mantisUrl += `?${finalQS}`;
        
    const method = req.method;
        const headers = {
            'Authorization': process.env.MANTIS_API_TOKEN,
        };
        // Define Content-Type apenas quando houver corpo
        const canHaveBody = method !== 'GET' && method !== 'HEAD';
        if (canHaveBody) {
            headers['Content-Type'] = 'application/json';
        }

        // Validação de integridade: impede transição para "Aguardando Deploy" sem campo GMUD (CF ID 71)
        // Aplica apenas para PATCH em issues/<id>
        if (method === 'PATCH') {
            const issueMatch = endpointPath.match(/^issues\/(\d+)/);
            if (issueMatch) {
                let body = req.body || {};
                if (typeof body === 'string') {
                    try { body = JSON.parse(body); } catch { body = {}; }
                }
                // Tenta extrair status atualizado a partir de custom_fields (CF ID 70) ou status.name
                let newStatus = null;
                if (Array.isArray(body.custom_fields)) {
                    const sf = body.custom_fields.find(cf => cf && cf.field && Number(cf.field.id) === 70);
                    if (sf) newStatus = String(sf.value || '').trim();
                }
                if (!newStatus && body.status && body.status.name) {
                    newStatus = String(body.status.name || '').trim();
                }
                if (newStatus && String(newStatus).toLowerCase() === 'aguardando deploy') {
                    // Verifica se CF 71 está presente e preenchido
                    let gmudVal = null;
                    if (Array.isArray(body.custom_fields)) {
                        const gf = body.custom_fields.find(cf => cf && cf.field && Number(cf.field.id) === 71);
                        if (gf) gmudVal = String(gf.value || '').trim();
                    }
                    if (!gmudVal) {
                        res.status(400).json({ error: 'Campo GMUD (Numero_GMUD - CF 71) é obrigatório ao marcar como Aguardando Deploy' });
                        return;
                    }
                }
            }
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