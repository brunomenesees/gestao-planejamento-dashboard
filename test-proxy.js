// Teste simples para verificar se o proxy está funcionando
async function testProxy() {
    const testUrl = '/api/mantis/issues/1';
    
    try {
        console.log(`Testando requisição para: ${testUrl}`);
        const response = await fetch(testUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        console.log('Status da resposta:', response.status);
        console.log('Cabeçalhos da resposta:');
        for (const [key, value] of response.headers.entries()) {
            console.log(`  ${key}: ${value}`);
        }
        
        if (response.ok) {
            const data = await response.json();
            console.log('Dados da resposta:', JSON.stringify(data, null, 2));
        } else {
            const errorText = await response.text();
            console.error('Erro na resposta:', errorText);
        }
    } catch (error) {
        console.error('Erro ao fazer a requisição:', error);
    }
}

// Executar o teste
document.addEventListener('DOMContentLoaded', () => {
    const testButton = document.createElement('button');
    testButton.textContent = 'Testar Proxy';
    testButton.style.padding = '10px 20px';
    testButton.style.margin = '20px';
    testButton.style.fontSize = '16px';
    testButton.style.cursor = 'pointer';
    
    testButton.addEventListener('click', testProxy);
    
    document.body.insertBefore(testButton, document.body.firstChild);
});
