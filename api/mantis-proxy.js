export default async function handler(req, res) {
    // Permitir CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
    // Responder preflight (OPTIONS)
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
  
    // Montar a URL do Mantis (pega o caminho e query string da requisição original)
    const mantisUrl = process.env.MANTIS_BASE_URL + '/api/rest' + req.url.replace(/^\/api\/mantis-proxy/, '');
  
    // Montar headers
    const headers = {
      'Authorization': process.env.MANTIS_API_TOKEN,
      'Content-Type': 'application/json',
    };
  
    // Fazer a requisição para o Mantis
    const fetchOptions = {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
    };
  
    try {
      const mantisResponse = await fetch(mantisUrl, fetchOptions);
      const contentType = mantisResponse.headers.get('content-type');
      res.status(mantisResponse.status);
  
      if (contentType && contentType.includes('application/json')) {
        const data = await mantisResponse.json();
        res.json(data);
      } else {
        const text = await mantisResponse.text();
        res.send(text);
      }
    } catch (error) {
      res.status(500).json({ error: 'Erro ao acessar o Mantis', details: error.message });
    }
  }