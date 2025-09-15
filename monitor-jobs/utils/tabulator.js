// utils/tabulator.js
// Resolve o construtor do Tabulator quando incluído via CDN em diferentes bundles
// Tenta: window.Tabulator, window.TabulatorFull, window.TabulatorTables

function isConstructable(fn) {
  return typeof fn === 'function' && !!fn.prototype && !!fn.prototype.constructor;
}

export function getTabulatorCtor() {
  const w = window;
  const candidates = [
    w.Tabulator,
    w?.Tabulator?.default,
    w.TabulatorFull,
    w?.TabulatorFull?.default,
    w.TabulatorTables,
    w?.TabulatorTables?.default,
  ];
  for (const c of candidates) {
    if (isConstructable(c)) return c;
  }
  // Alguns pacotes expõem em namespaces
  if (w.tabulator && isConstructable(w.tabulator.Tabulator)) return w.tabulator.Tabulator;
  console.error('Tabulator não encontrado ou não-constructável. Globals:', {
    hasTabulator: !!w.Tabulator,
    hasTabulatorFull: !!w.TabulatorFull,
    hasTabulatorTables: !!w.TabulatorTables,
  });
  return null;
}

// Tenta carregar dinamicamente um bundle UMD alternativo se o Tabulator
// não estiver disponível globalmente. Retorna a ctor encontrada ou null.
export async function ensureTabulatorLoaded({ timeout = 5000 } = {}) {
  let ctor = getTabulatorCtor();
  if (ctor) return ctor;

  // Tentativa de fallback: injetar um script de CDN alternativo (unpkg)
  const altUrls = [
    'https://unpkg.com/tabulator-tables@5.6.2/dist/js/tabulator.min.js',
    'https://cdn.jsdelivr.net/npm/tabulator-tables@5.6.2/dist/js/tabulator.min.js',
  ];

  for (const url of altUrls) {
    try {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = url;
        s.async = false; // garantir execução ordenada
        s.onload = () => resolve();
        s.onerror = (e) => reject(e);
        document.head.appendChild(s);
        // timeout
        setTimeout(() => reject(new Error('timeout')), timeout);
      });
    } catch (e) {
      // tentar próximo
      console.warn('Falha ao carregar Tabulator fallback de', url, e);
      continue;
    }
    ctor = getTabulatorCtor();
    if (ctor) return ctor;
  }

  // última checagem
  return getTabulatorCtor();
}

// Cria uma instância de Tabela tentando com 'new' e, em fallback, como função
export function createTabulator(el, options) {
  const Ctor = getTabulatorCtor();
  if (!Ctor) return null;
  try {
    return new Ctor(el, options);
  } catch (e1) {
    try {
      return Ctor(el, options);
    } catch (e2) {
      console.error('Falha ao instanciar Tabulator com e sem new', { e1, e2 });
      return null;
    }
  }
}
