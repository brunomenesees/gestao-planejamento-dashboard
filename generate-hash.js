import bcrypt from 'bcryptjs';

// Coloque a senha que você quer usar aqui
const password = ''; 
const saltRounds = 10;

bcrypt.hash(password, saltRounds, (err, hash) => {
    if (err) {
        throw err;
    }
    console.log(`Senha original: ${password}`);
    console.log(`Hash gerado: ${hash}`);
});