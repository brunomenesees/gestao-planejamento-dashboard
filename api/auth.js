import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// Usuários hardcoded (em produção, use banco de dados)
const USERS = [
    {
        username: 'admin',
        password: '$2a$10$rQZ8K9vX8K9vX8K9vX8K9O', // senha123
        role: 'admin'
    },
    {
        username: 'usuario',
        password: '$2a$10$rQZ8K9vX8K9vX8K9vX8K9O', // senha123
        role: 'user'
    }
];

export default async function handler(req, res) {
    console.log('=== AUTH FUNCTION CALLED ===');
    console.log('Method:', req.method);
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    
    // Configurar CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

        // Validar credenciais
        console.log('Looking for user:', username);
        const user = USERS.find(u => u.username === username);
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
        const jwtSecret = process.env.JWT_SECRET || '286793b2b247581d130514b7';
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