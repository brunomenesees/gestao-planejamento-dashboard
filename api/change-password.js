import bcrypt from 'bcryptjs';
import { sql } from '@vercel/postgres';
import { verifyToken } from './middleware.js';

export default async function handler(req, res) {
  // CORS allowlist igual ao de api/auth.js
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
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const payload = verifyToken(req);
    if (!payload || !payload.username) {
      return res.status(401).json({ error: 'Não autorizado' });
    }

    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'Payload inválido' });
    }

    // Política de senha
    const hasMinLen = newPassword.length >= 8;
    const hasLower = /[a-z]/.test(newPassword);
    const hasUpper = /[A-Z]/.test(newPassword);
    const hasDigit = /\d/.test(newPassword);
    const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
    const hasSpace = /\s/.test(newPassword);
    if (!hasMinLen || !hasLower || !hasUpper || !hasDigit || !hasSpecial || hasSpace) {
      return res.status(422).json({
        error: 'Senha fraca',
        details: 'Deve ter 8+ caracteres, com maiúscula, minúscula, número e especial, sem espaços.'
      });
    }

    if (newPassword.toLowerCase() === String(payload.username).toLowerCase()) {
      return res.status(422).json({ error: 'Senha inválida', details: 'Nova senha não pode ser igual ao username.' });
    }

    // Buscar usuário
    const { rows } = await sql`SELECT username, password FROM users WHERE username = ${payload.username};`;
    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Não autorizado' });
    }

    // Verificar senha atual
    const currentOk = await bcrypt.compare(currentPassword, user.password);
    if (!currentOk) {
      return res.status(403).json({ error: 'Senha atual incorreta' });
    }

    // Bloquear se a nova for igual à atual
    const sameAsOld = await bcrypt.compare(newPassword, user.password);
    if (sameAsOld) {
      return res.status(422).json({ error: 'Senha inválida', details: 'Nova senha não pode ser igual à senha atual.' });
    }

    // Atualizar senha
    const hash = await bcrypt.hash(newPassword, 10);
    await sql`UPDATE users SET password = ${hash} WHERE username = ${payload.username};`;

    return res.status(204).end();
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno do servidor', details: err?.message });
  }
}
