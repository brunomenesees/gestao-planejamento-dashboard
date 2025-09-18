import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
    console.log('=== LOGS API CALLED ===');
    console.log('Method:', req.method);
    console.log('Headers:', req.headers);
    
    // Configurar CORS
    const allowedOrigins = [
        'https://gestao-planejamento-dashboard.vercel.app',
        'http://localhost:3000',
        'http://127.0.0.1:3000'
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        console.log('OPTIONS request - returning 200');
        res.status(200).end();
        return;
    }

    try {
        switch (req.method) {
            case 'POST':
                return await saveLogs(req, res);
            case 'GET':
                return await getLogs(req, res);
            case 'DELETE':
                return await deleteLogs(req, res);
            default:
                return res.status(405).json({ error: 'Método não permitido' });
        }
    } catch (error) {
        console.error('Erro na API de logs:', error);
        return res.status(500).json({ 
            error: 'Erro interno do servidor',
            details: error.message 
        });
    }
}

// Salvar logs no banco
async function saveLogs(req, res) {
    console.log('=== SAVING LOGS ===');
    
    const { logs } = req.body;
    
    if (!logs || !Array.isArray(logs)) {
        return res.status(400).json({ error: 'Logs devem ser um array' });
    }

    if (logs.length === 0) {
        return res.status(400).json({ error: 'Array de logs não pode estar vazio' });
    }

    console.log(`Tentando salvar ${logs.length} logs`);

    try {
        let savedCount = 0;
        let errors = [];

        for (const log of logs) {
            try {
                // Validar campos obrigatórios
                if (!log.id || !log.session_id || !log.timestamp || !log.level || !log.category || !log.message) {
                    errors.push({ logId: log.id, error: 'Campos obrigatórios faltando' });
                    continue;
                }

                // Inserir log no banco
                await sql`
                    INSERT INTO system_logs (
                        id, session_id, timestamp, level, category, message, 
                        data, url, user_agent, stack_trace
                    ) VALUES (
                        ${log.id}, 
                        ${log.session_id}, 
                        ${log.timestamp}, 
                        ${log.level}, 
                        ${log.category}, 
                        ${log.message},
                        ${JSON.stringify(log.data || {})},
                        ${log.url || null},
                        ${log.user_agent || null},
                        ${log.stack_trace || null}
                    )
                    ON CONFLICT (id) DO NOTHING
                `;
                
                savedCount++;
            } catch (logError) {
                console.error(`Erro ao salvar log ${log.id}:`, logError);
                errors.push({ logId: log.id, error: logError.message });
            }
        }

        console.log(`Logs salvos: ${savedCount}/${logs.length}`);

        return res.status(200).json({
            success: true,
            savedCount,
            totalLogs: logs.length,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('Erro ao salvar logs:', error);
        return res.status(500).json({ 
            error: 'Erro ao salvar logs no banco',
            details: error.message 
        });
    }
}

// Recuperar logs do banco
async function getLogs(req, res) {
    console.log('=== GETTING LOGS ===');
    
    const { 
        page = 1, 
        limit = 50, 
        level, 
        category, 
        session_id, 
        search,
        start_date,
        end_date 
    } = req.query;

    try {
        // Construir query base
        let whereConditions = [];
        let params = [];
        
        if (level) {
            whereConditions.push(`level = $${params.length + 1}`);
            params.push(level.toUpperCase());
        }
        
        if (category) {
            whereConditions.push(`category = $${params.length + 1}`);
            params.push(category.toUpperCase());
        }
        
        if (session_id) {
            whereConditions.push(`session_id = $${params.length + 1}`);
            params.push(session_id);
        }
        
        if (search) {
            whereConditions.push(`(message ILIKE $${params.length + 1} OR data::text ILIKE $${params.length + 2})`);
            params.push(`%${search}%`, `%${search}%`);
        }
        
        if (start_date) {
            whereConditions.push(`timestamp >= $${params.length + 1}`);
            params.push(start_date);
        }
        
        if (end_date) {
            whereConditions.push(`timestamp <= $${params.length + 1}`);
            params.push(end_date);
        }

        const whereClause = whereConditions.length > 0 
            ? 'WHERE ' + whereConditions.join(' AND ')
            : '';

        // Contar total de logs
        const countQuery = `SELECT COUNT(*) as total FROM system_logs ${whereClause}`;
        const countResult = await sql(countQuery, params);
        const totalLogs = parseInt(countResult[0].total);

        // Calcular offset
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        // Buscar logs com paginação
        const logsQuery = `
            SELECT * FROM system_logs 
            ${whereClause}
            ORDER BY timestamp DESC 
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;
        
        const logs = await sql(logsQuery, [...params, parseInt(limit), offset]);

        // Calcular estatísticas
        const statsQuery = `
            SELECT 
                level,
                COUNT(*) as count
            FROM system_logs 
            ${whereClause}
            GROUP BY level
        `;
        const statsResult = await sql(statsQuery, params);
        
        const stats = {
            totalLogs,
            byLevel: {},
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalLogs / parseInt(limit)),
            logsPerPage: parseInt(limit)
        };

        statsResult.forEach(stat => {
            stats.byLevel[stat.level] = parseInt(stat.count);
        });

        console.log(`Retornando ${logs.length} logs (página ${page}/${stats.totalPages})`);

        return res.status(200).json({
            success: true,
            logs,
            stats,
            pagination: {
                currentPage: stats.currentPage,
                totalPages: stats.totalPages,
                totalLogs: stats.totalLogs,
                logsPerPage: stats.logsPerPage
            }
        });

    } catch (error) {
        console.error('Erro ao buscar logs:', error);
        return res.status(500).json({ 
            error: 'Erro ao buscar logs no banco',
            details: error.message 
        });
    }
}

// Deletar logs antigos (72 horas)
async function deleteLogs(req, res) {
    console.log('=== DELETING OLD LOGS ===');
    
    const { action } = req.query;

    try {
        if (action === 'cleanup') {
            // Deletar logs com mais de 72 horas
            const cutoffDate = new Date();
            cutoffDate.setHours(cutoffDate.getHours() - 72);

            const result = await sql`
                DELETE FROM system_logs 
                WHERE created_at < ${cutoffDate.toISOString()}
            `;

            console.log(`Logs deletados: ${result.count || 0}`);

            return res.status(200).json({
                success: true,
                deletedCount: result.count || 0,
                cutoffDate: cutoffDate.toISOString()
            });

        } else if (action === 'all') {
            // Deletar todos os logs (apenas para desenvolvimento)
            const result = await sql`DELETE FROM system_logs`;

            console.log(`Todos os logs deletados: ${result.count || 0}`);

            return res.status(200).json({
                success: true,
                deletedCount: result.count || 0,
                message: 'Todos os logs foram deletados'
            });

        } else {
            return res.status(400).json({ 
                error: 'Ação inválida. Use ?action=cleanup ou ?action=all' 
            });
        }

    } catch (error) {
        console.error('Erro ao deletar logs:', error);
        return res.status(500).json({ 
            error: 'Erro ao deletar logs do banco',
            details: error.message 
        });
    }
}