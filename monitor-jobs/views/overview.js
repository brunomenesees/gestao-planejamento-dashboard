// views/overview.js
import { formatDate } from '../utils/time.js';

// Acessar DateTime do Luxon global
const { DateTime } = window.luxon;

let chart;

function kpiCard(title, value, extra = '') {
  return `
  <div class="col-sm-6 col-md-4 col-lg-3">
    <div class="card kpi-card">
      <div class="card-body">
        <div class="card-title">${title}</div>
        <div class="kpi-value">${value}</div>
        ${extra ? `<div class="text-muted mt-1">${extra}</div>` : ''}
      </div>
    </div>
  </div>`;
}

export function renderOverview({ kpis, trend, utc }) {
  // KPIs
  const kpiRow = document.getElementById('kpiRow');
  const fmtPct = (n) => `${n.toFixed(1)}%`;
  const fmtSec = (n) => `${n.toFixed(1)} s`;
  kpiRow.innerHTML = [
    kpiCard('Execuções', kpis.total),
    kpiCard('Sucesso', `${kpis.success} (${fmtPct(kpis.successRate)})`),
    kpiCard('Erros', `${kpis.error} (${fmtPct(kpis.errorRate)})`),
    kpiCard('Warnings', `${kpis.warning} (${fmtPct(kpis.warningRate)})`),
    kpiCard('Tempo médio', fmtSec(kpis.avgTime)),
    kpiCard('Tempo p95', fmtSec(kpis.p95Time)),
  ].join('');

  // Chart.js - tendência por hora (stacked)
  const ctx = document.getElementById('trendChart');
  
  // Verificar se trend e labels existem antes de processar
  if (!trend || !trend.labels || !Array.isArray(trend.labels)) {
    console.warn('Dados de tendência inválidos ou vazios');
    return;
  }
  
  // Filtrar e processar labels, removendo valores nulos/undefined
  const labels = trend.labels
    .filter(l => l != null && typeof l === 'string') // Remove null/undefined e garante que é string
    .map(l => {
      // Converter para fuso horário de Brasília
      const dt = DateTime.fromISO(l, { zone: 'America/Sao_Paulo' });
      return dt.isValid ? dt.toFormat('yyyy-LL-dd HH:mm') : l.replace('T', ' ').replace('Z','');
    });
  
  const data = trend.data || [];

  const ds = (label, key, color) => ({
    label,
    data: data.map(d => d[key] || 0),
    borderColor: color,
    backgroundColor: color + '66',
    fill: true,
    tension: 0.2,
  });

  const config = {
    type: 'line',
    data: {
      labels,
      datasets: [
        ds('Sucesso', 'success', '#198754'),    // Verde (mantido)
        ds('Warning', 'warning', '#ffc107'),    // Amarelo mais vibrante
        ds('Erro', 'error', '#dc3545'),         // Vermelho (mantido)
        ds('Info', 'info', '#6f42c1'),          // Roxo para melhor contraste
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      stacked: true,
      plugins: {
        legend: { position: 'bottom' },
      },
      scales: {
        x: { title: { display: true, text: utc ? 'Hora (UTC)' : 'Hora (Brasília)' } },
        y: { beginAtZero: true, title: { display: true, text: 'Execuções' } },
      },
    },
  };

  // Só criar o gráfico se houver dados válidos
  if (labels.length === 0 || data.length === 0) {
    console.warn('Dados insuficientes para criar gráfico de tendência');
    return;
  }

  if (chart) {
    chart.destroy();
  }
  chart = new Chart(ctx, config);
}
