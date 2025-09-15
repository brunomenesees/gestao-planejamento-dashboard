// utils/stats.js
import { bucketHourKey } from './time.js';

export function computeKPIs(records) {
  const total = records.length;
  let success = 0, error = 0, warning = 0, info = 0;
  let sumTime = 0;
  const times = [];
  for (const r of records) {
    sumTime += r.tempo_execucao || 0;
    if (typeof r.tempo_execucao === 'number') times.push(r.tempo_execucao);
    if (r.has_success || r.severity === 'success') success++;
    if (r.has_error || r.severity === 'error') error++;
    if (r.has_warning || r.severity === 'warning') warning++;
    if (r.has_info || r.severity === 'info') info++;
  }
  const avg = total ? (sumTime / total) : 0;
  const p95v = times.length ? pN(times, 95) : 0;
  return {
    total,
    success,
    error,
    warning,
    info,
    successRate: total ? (success / total) * 100 : 0,
    errorRate: total ? (error / total) * 100 : 0,
    warningRate: total ? (warning / total) * 100 : 0,
    avgTime: avg,
    p95Time: p95v,
  };
}

export function p95(values) {
  return pN(values, 95);
}

export function pN(values, n) {
  if (!values.length) return 0;
  const arr = [...values].sort((a,b) => a-b);
  const rank = (n/100) * (arr.length - 1);
  const l = Math.floor(rank);
  const u = Math.ceil(rank);
  if (l === u) return arr[l];
  const w = rank - l;
  return arr[l] * (1-w) + arr[u] * w;
}

// Cria séries por hora com contagem por severidade
export function buildTrendSeries(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { labels: [], data: [] };
  }
  
  const map = new Map(); // key -> {success,error,warning,info}
  for (const r of records) {
    if (!r || !r.date) continue; // Pular registros inválidos
    
    try {
      const key = bucketHourKey(r.date, { utc: true });
      if (!key) continue; // Pular se a chave for nula
      
      if (!map.has(key)) map.set(key, { success: 0, error: 0, warning: 0, info: 0 });
      const bucket = map.get(key);
      if (r.has_success || r.severity === 'success') bucket.success += 1;
      if (r.has_error || r.severity === 'error') bucket.error += 1;
      if (r.has_warning || r.severity === 'warning') bucket.warning += 1;
      if (r.has_info || r.severity === 'info') bucket.info += 1;
    } catch (error) {
      console.warn('Erro ao processar registro para tendência:', error, r);
    }
  }
  
  const labels = Array.from(map.keys()).sort();
  const data = labels.map(k => map.get(k));
  return { labels, data };
}

// Agregação por job: retorna array com métricas por id_job
export function buildJobsSummary(records) {
  const byJob = new Map();
  for (const r of records) {
    if (!byJob.has(r.id_job)) {
      byJob.set(r.id_job, { id_job: r.id_job, total: 0, success: 0, error: 0, warning: 0, info: 0, times: [], last: null });
    }
    const agg = byJob.get(r.id_job);
    agg.total += 1;
    if (r.has_success || r.severity === 'success') agg.success += 1;
    if (r.has_error || r.severity === 'error') agg.error += 1;
    if (r.has_warning || r.severity === 'warning') agg.warning += 1;
    if (r.has_info || r.severity === 'info') agg.info += 1;
    if (typeof r.tempo_execucao === 'number') agg.times.push(r.tempo_execucao);
    if (!agg.last || r.date > agg.last) agg.last = r.date;
  }
  const rows = [];
  for (const agg of byJob.values()) {
    const avg = agg.times.length ? (agg.times.reduce((a,b)=>a+b,0) / agg.times.length) : 0;
    const p95v = agg.times.length ? pN(agg.times, 95) : 0;
    const successRate = agg.total ? (agg.success / agg.total) * 100 : 0;
    const errorRate = agg.total ? (agg.error / agg.total) * 100 : 0;
    // Saúde simples: erro% > 5 => vermelho; >1 => amarelo; senão verde
    let health = 'verde';
    if (errorRate > 5) health = 'vermelho';
    else if (errorRate > 1) health = 'amarelo';
    rows.push({
      id_job: agg.id_job,
      total: agg.total,
      success: agg.success,
      error: agg.error,
      warning: agg.warning,
      info: agg.info,
      successRate,
      errorRate,
      avgTime: avg,
      p95Time: p95v,
      last: agg.last,
      health,
    });
  }
  // Ordenar: pior saúde primeiro, depois maior erro%, depois id_job
  const orderHealth = { vermelho: 0, amarelo: 1, verde: 2 };
  rows.sort((a, b) => {
    const h = orderHealth[a.health] - orderHealth[b.health];
    if (h !== 0) return h;
    if (b.errorRate !== a.errorRate) return b.errorRate - a.errorRate;
    return a.id_job - b.id_job;
  });
  return rows;
}
