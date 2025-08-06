import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    console.log('=== AUTH FUNCTION CALLED ===');
    console.log('Method:', req.method);
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    
    // Configurar CORS de forma segura
    const allowedOrigins = [
        'https://gestao-planejamento-dashboard.vercel.app',
        'http://localhost:3000'
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        console.log('OPTIONS request - returning 200');
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        console.log('Method not allowed:', req.method);
        return res.status(405).json({ error: 'Método não permitido' });
    }

    try {
        console.log('=== STARTING AUTHENTICATION ===');
        
        const { username, password } = req.body;
        console.log('Received credentials:', { username, password: password ? '***' : 'undefined' });

        // Verificar se as dependências estão carregadas
        console.log('bcrypt available:', typeof bcrypt !== 'undefined');
        console.log('jwt available:', typeof jwt !== 'undefined');

        // Validar credenciais consultando o banco de dados
        console.log('Looking for user in the database:', username);
        const { rows } = await sql`SELECT * FROM users WHERE username = ${username};`;
        const user = rows[0];
        
        console.log('User found:', user ? 'YES' : 'NO');
        
        if (!user) {
            console.log('User not found:', username);
            return res.status(401).json({ error: 'Credenciais inválidas - usuário não encontrado' });
        }

        console.log('Comparing passwords...');
        const passwordMatch = await bcrypt.compare(password, user.password);
        console.log('Password match:', passwordMatch);
        
        if (!passwordMatch) {
            console.log('Password does not match for user:', username);
            return res.status(401).json({ error: 'Credenciais inválidas - senha incorreta' });
        }

        console.log('Authentication successful for user:', username);

        // Gerar JWT token
        const jwtSecret = process.env.JWT_SECRET;
        console.log('Using JWT secret:', jwtSecret ? 'YES' : 'NO');
        
        const token = jwt.sign(
            { username: user.username, role: user.role },
            jwtSecret,
            { expiresIn: '8h' }
        );
        console.log('JWT token generated successfully');

        const response = {
            token,
            user: {
                username: user.username,
                role: user.role
            }
        };
        
        console.log('Sending successful response');
        res.json(response);
        
    } catch (error) {
        console.error('=== ERROR IN AUTHENTICATION ===');
        console.error('Error details:', error);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
}