import { createConnection } from '@vercel/postgres';
import { verifyToken, corsHeaders } from '../middleware.js';

export default async function handler(req, res) {
    console.log('=== JOBS STATS API CALLED ===');
    console.log('Method:', req.method);
    
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

    // Criar conexão específica para o monitor de jobs
    const jobsDb = createConnection({
        connectionString: process.env.JOBS_POSTGRES_URL
    });

    try {
        // Buscar lista de job IDs únicos
        const query = "SELECT DISTINCT id_job FROM public.jobs_historicos ORDER BY id_job ASC";
        const result = await jobsDb.query(query);
        const jobIds = result.rows.map(r => r.id_job);

        console.log(`Retornando ${jobIds.length} job IDs únicos`);
        
        res.json({ 
            jobIds,
            total: jobIds.length
        });

    } catch (error) {
        console.error('Erro na API de stats de jobs:', error);
        res.status(500).json({ 
            error: 'Erro interno do servidor', 
            details: error.message 
        });
    }
}
