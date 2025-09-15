// Parser de JSON de histórico de jobs
// Suporta Zod via CDN exposto como window.zod OU window.z OU global "z"
// Usa funções centralizadas de severidade para consistência

import { detectSeverity, splitMessages } from '../common/severity-utils.js';

const Severity = {
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
  SUCCESS: 'success',
};

function getZ() {
  // Possibilidades: window.zod.z, window.z.z, window.z (já sendo o "z")
  const w = window;
  const maybe = w.zod || w.z || w.Zod; // algumas builds podem expor Zod
  if (!maybe) return null;
  if (typeof maybe.object === 'function') return maybe; // já é o z
  if (maybe.z && typeof maybe.z.object === 'function') return maybe.z; // namespace possui .z
  return null;
}

// Legacy: synchronous parse for small JSON inputs
export function parseJobsJson(jsonText) {
  const z = getZ();
  if (!z) {
    console.error('Zod n\u00e3o encontrado nos globals esperados (window.zod / window.z).');
    throw new Error('Zod n\u00e3o encontrado. Verifique o carregamento da CDN do Zod no index.html.');
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    throw new Error('JSON inv\u00e1lido');
  }

  // A raiz \u00e9 um objeto cuja primeira propriedade cont\u00e9m o array de registros
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Formato inesperado: raiz n\u00e3o \u00e9 objeto');
  }
  const arrays = Object.values(parsed).filter(v => Array.isArray(v));
  if (!arrays.length) {
    throw new Error('Formato inesperado: n\u00e3o h\u00e1 array de registros na raiz');
  }
  const arr = arrays[0];

  const ItemSchema = z.object({
    id: z.number(),
    id_job: z.number(),
    data_execucao: z.string(),
    tempo_execucao: z.number(),
    status: z.string(),
  });

  const records = [];
  for (const it of arr) {
    const res = ItemSchema.safeParse(it);
    if (!res.success) continue; // descarta itens inv\u00e1lidos
    const item = res.data;
    const dt = new Date(item.data_execucao);
    if (isNaN(dt.getTime())) continue;
    const severity = detectSeverity(item.status);
    const mensagens = splitMessages(item.status);
    records.push({
      id: item.id,
      id_job: item.id_job,
      date: dt, // Date em UTC (origem ISO Z)
      tempo_execucao: item.tempo_execucao,
      severity,
      status_raw: item.status,
      mensagens,
    });
  }
  return records.sort((a,b) => a.date - b.date);
}

// New: stream-parse a File to avoid loading entire JSON in memory
// onBatch(recordsArray) is called for each batch of validated records
export async function parseJobsFile(file, onBatch, options = {}) {
  const { batchSize = 500 } = options;
  const z = getZ();
  if (!z) throw new Error('Zod n\u00e3o encontrado.');

  // Read as text stream if available
  if (file.stream) {
    const reader = file.stream().getReader();
    const decoder = new TextDecoder('utf-8');
    let { value: chunk, done } = await reader.read();
    let buffer = '';
    // We need to skip leading whitespace and the opening object/array up to the array
    // Strategy: accumulate until we detect the start of an array '[' then parse objects one by one
    let inArray = false;
    let depth = 0; // object/array nesting to detect object boundaries
    let objStart = -1;
    const ItemSchema = z.object({ id: z.number(), id_job: z.number(), data_execucao: z.string(), tempo_execucao: z.number(), status: z.string() });
    const outBatch = [];

    while (!done) {
      buffer += decoder.decode(chunk, { stream: true });
      let i = 0;
      while (i < buffer.length) {
        const ch = buffer[i];
        if (!inArray) {
          if (ch === '[') {
            inArray = true;
            i++;
            continue;
          }
          i++;
          continue;
        }
        // Once in array, look for object boundaries
        if (objStart === -1) {
          if (ch === '{') {
            objStart = i;
            depth = 1;
          }
          // else skip commas/whitespace
        } else {
          if (ch === '{') depth++;
          else if (ch === '}') depth--;
          if (depth === 0) {
            const raw = buffer.slice(objStart, i + 1);
            try {
              const parsed = JSON.parse(raw);
              const res = ItemSchema.safeParse(parsed);
              if (res.success) {
                const item = res.data;
                const dt = new Date(item.data_execucao);
                if (!isNaN(dt.getTime())) {
                  outBatch.push({ id: item.id, id_job: item.id_job, date: dt, tempo_execucao: item.tempo_execucao, severity: detectSeverity(item.status), status_raw: item.status, mensagens: splitMessages(item.status) });
                }
              }
            } catch (e) {
              // ignore parse errors for individual objects
            }
            objStart = -1;
            // when batch full, emit
            if (outBatch.length >= batchSize) {
              onBatch(outBatch.splice(0, outBatch.length));
            }
          }
        }
        i++;
      }
      // keep the remaining tail (from objStart if in object, or after last processed)
      if (objStart !== -1) {
        buffer = buffer.slice(objStart);
        objStart = 0;
      } else {
        buffer = '';
      }
      ({ value: chunk, done } = await reader.read());
    }

    // finalize: there may be a trailing buffered object
    if (buffer && buffer.length) {
      // attempt to find any remaining objects
      let j = 0;
      let localObjStart = -1;
      let localDepth = 0;
      while (j < buffer.length) {
        const ch = buffer[j];
        if (localObjStart === -1) {
          if (ch === '{') { localObjStart = j; localDepth = 1; }
        } else {
          if (ch === '{') localDepth++;
          else if (ch === '}') localDepth--;
          if (localDepth === 0) {
            const raw = buffer.slice(localObjStart, j + 1);
            try {
              const parsed = JSON.parse(raw);
              const res = ItemSchema.safeParse(parsed);
              if (res.success) {
                const item = res.data;
                const dt = new Date(item.data_execucao);
                if (!isNaN(dt.getTime())) {
                  outBatch.push({ id: item.id, id_job: item.id_job, date: dt, tempo_execucao: item.tempo_execucao, severity: detectSeverity(item.status), status_raw: item.status, mensagens: splitMessages(item.status) });
                }
              }
            } catch (e) {}
            localObjStart = -1;
          }
        }
        j++;
      }
    }

    if (outBatch.length) onBatch(outBatch.splice(0, outBatch.length));
    return;
  }

  // Fallback: read whole text but still parse incrementally with regex (for older browsers)
  const text = await file.text();
  const m = text.match(/\[([\s\S]*)\]/m);
  if (!m) return onBatch([]);
  const inner = m[1];
  // split by '},{' naive approach but safe enough for typical records
  const pieces = inner.split(/\},\s*\{/g);
  const ItemSchema = z.object({ id: z.number(), id_job: z.number(), data_execucao: z.string(), tempo_execucao: z.number(), status: z.string() });
  const out = [];
  for (let p of pieces) {
    if (!p.trim()) continue;
    if (!p.startsWith('{')) p = '{' + p;
    if (!p.endsWith('}')) p = p + '}';
    try {
      const parsed = JSON.parse(p);
      const res = ItemSchema.safeParse(parsed);
      if (!res.success) continue;
      const item = res.data;
      const dt = new Date(item.data_execucao);
      if (isNaN(dt.getTime())) continue;
      out.push({ id: item.id, id_job: item.id_job, date: dt, tempo_execucao: item.tempo_execucao, severity: detectSeverity(item.status), status_raw: item.status, mensagens: splitMessages(item.status) });
      if (out.length >= batchSize) { onBatch(out.splice(0, out.length)); }
    } catch (e) {}
  }
  if (out.length) onBatch(out.splice(0, out.length));
}

// explicit export removed to avoid duplicate export; functions are already exported above via `export function`
