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
    // Configurar CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    try {
        const { username, password } = req.body;

        // Validar credenciais
        const user = USERS.find(u => u.username === username);
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        // Gerar JWT token
        const token = jwt.sign(
            { username: user.username, role: user.role },
            process.env.JWT_SECRET || '286793b2b247581d130514b7',
            { expiresIn: '8h' }
        );

        res.json({
            token,
            user: {
                username: user.username,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Erro na autenticação:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
}