import { createConnection } from '@vercel/postgres';
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

    // Criar conexão específica para o monitor de jobs
    const jobsDb = createConnection({
        connectionString: process.env.JOBS_POSTGRES_URL
    });

    try {
        const { start, end, id_job, text, severities, limit, cursor } = req.query;
        
        const MAX_LIMIT = 20000;
        const DEFAULT_LIMIT = 10000;
        let limitNum = parseInt(limit, 10);
        if (Number.isNaN(limitNum) || limitNum <= 0) limitNum = DEFAULT_LIMIT;
        if (limitNum > MAX_LIMIT) limitNum = MAX_LIMIT;

        // Se nenhum intervalo de data for informado, aplica últimas 24h por padrão
        let startDate = start;
        let endDate = end;
        if (!startDate && !endDate) {
            const now = new Date();
            const startDt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            startDate = startDt.toISOString();
            endDate = now.toISOString();
        }

        // Construir query SQL com filtros
        let whereConditions = [];
        let queryParams = [];
        let paramIndex = 1;

        if (startDate) {
            whereConditions.push(`data_execucao >= $${paramIndex}`);
            queryParams.push(startDate);
            paramIndex++;
        }
        if (endDate) {
            whereConditions.push(`data_execucao <= $${paramIndex}`);
            queryParams.push(endDate);
            paramIndex++;
        }
        if (cursor) {
            whereConditions.push(`data_execucao < $${paramIndex}`);
            queryParams.push(cursor);
            paramIndex++;
        }
        if (id_job) {
            whereConditions.push(`id_job = $${paramIndex}`);
            queryParams.push(id_job);
            paramIndex++;
        }
        if (text) {
            whereConditions.push(`status ILIKE $${paramIndex}`);
            queryParams.push(`%${text}%`);
            paramIndex++;
        }

        // Construir parte da severidade
        let severityCondition = '';
        if (severities) {
            const sevArray = severities.split(',').filter(Boolean);
            if (sevArray.length > 0) {
                const severityCase = `
                    CASE 
                        WHEN status ILIKE '%error%' OR status ILIKE '%erro%' OR status ILIKE '%failed%' OR status ILIKE '%falhou%' THEN 'error'
                        WHEN status ILIKE '%warning%' OR status ILIKE '%warn%' OR status ILIKE '%aviso%' THEN 'warning'
                        WHEN status ILIKE '%success%' OR status ILIKE '%sucesso%' OR status ILIKE '%completed%' OR status ILIKE '%concluído%' THEN 'success'
                        ELSE 'info'
                    END
                `;
                
                const severityPlaceholders = sevArray.map((_, i) => `$${paramIndex + i}`).join(',');
                severityCondition = `AND ${severityCase} IN (${severityPlaceholders})`;
                queryParams.push(...sevArray);
            }
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
        
        // Query principal
        const query = `
            WITH base AS (
                SELECT 
                    id,
                    id_job,
                    data_execucao,
                    tempo_execucao,
                    status,
                    -- flags de severidade
                    CASE WHEN status ILIKE '%error%' OR status ILIKE '%erro%' OR status ILIKE '%failed%' OR status ILIKE '%falhou%' THEN true ELSE false END AS has_error,
                    CASE WHEN status ILIKE '%warning%' OR status ILIKE '%warn%' OR status ILIKE '%aviso%' THEN true ELSE false END AS has_warning,
                    CASE WHEN status ILIKE '%info%' THEN true ELSE false END AS has_info,
                    CASE WHEN status ILIKE '%success%' OR status ILIKE '%sucesso%' OR status ILIKE '%completed%' OR status ILIKE '%concluído%' THEN true ELSE false END AS has_success,
                    -- severidade principal
                    CASE 
                        WHEN status ILIKE '%error%' OR status ILIKE '%erro%' OR status ILIKE '%failed%' OR status ILIKE '%falhou%' THEN 'error'
                        WHEN status ILIKE '%warning%' OR status ILIKE '%warn%' OR status ILIKE '%aviso%' THEN 'warning'
                        WHEN status ILIKE '%success%' OR status ILIKE '%sucesso%' OR status ILIKE '%completed%' OR status ILIKE '%concluído%' THEN 'success'
                        ELSE 'info'
                    END AS severity
                FROM public.jobs_historicos
            )
            SELECT id, id_job, data_execucao, tempo_execucao, status,
                   severity, has_error, has_warning, has_info, has_success
            FROM base
            ${whereClause}
            ${severityCondition}
            ORDER BY data_execucao DESC
            LIMIT ${limitNum}
        `;

        console.log('Executing query:', query);
        console.log('With params:', queryParams);

        const result = await jobsDb.query(query, queryParams);
        const rows = result.rows;

        // Processar dados
        rows.forEach(r => {
            r.date = new Date(r.data_execucao);
            r.status_raw = r.status;
            // Dividir mensagens por quebras de linha
            r.mensagens = r.status.split('\n').filter(msg => msg.trim().length > 0);
        });

        // Calcular próximo cursor
        let nextCursor = null;
        if (rows.length === limitNum) {
            const last = rows[rows.length - 1];
            nextCursor = last && last.data_execucao ? last.data_execucao : null;
        }

        console.log(`Retornando ${rows.length} registros`);
        
        res.json({ 
            data: rows, 
            nextCursor,
            total: rows.length
        });

    } catch (error) {
        console.error('Erro na API de jobs:', error);
        res.status(500).json({ 
            error: 'Erro interno do servidor', 
            details: error.message 
        });
    }
}
