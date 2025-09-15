// views/jobs.js
import { buildJobsSummary } from '../utils/stats.js';
import { formatDate } from '../utils/time.js';
import { jobName } from '../utils/jobs_map.js';
import { getTabulatorCtor, ensureTabulatorLoaded } from '../utils/tabulator.js';

let table;

export async function initJobsView(containerEl) {
  const TabulatorCtor = getTabulatorCtor() || await ensureTabulatorLoaded();
  if (!TabulatorCtor) {
    console.error('Tabulator global não encontrado');
    return;
  }
  table = new TabulatorCtor(containerEl, {
    layout: 'fitColumns',
    height: '520px',
    pagination: true,
    paginationSize: 25,
    paginationSizeSelector: [25, 50, 100, 200],
    placeholder: 'Sem dados para exibir. Importe um arquivo e/ou ajuste os filtros.',
    initialSort: [
      { column: 'health', dir: 'asc' },
      { column: 'errorRate', dir: 'desc' },
    ],
    columns: [
      { title: 'Job', field: 'job_name', width: 240 },
      { title: 'Saúde', field: 'health', width: 110, formatter: healthFormatter, sorter: healthSorter },
      { title: 'Execuções', field: 'total', sorter: 'number', width: 120 },
      { title: 'Sucesso %', field: 'successRate', sorter: 'number', width: 120, formatter: percentFormatter },
      { title: 'Erro %', field: 'errorRate', sorter: 'number', width: 110, formatter: percentFormatter },
      { title: 'Tempo médio (s)', field: 'avgTime', sorter: 'number', width: 150, formatter: number1Formatter },
      { title: 'Tempo p95 (s)', field: 'p95Time', sorter: 'number', width: 140, formatter: number1Formatter },
      { title: 'Última execução', field: 'lastFormatted', width: 190 },
      { title: 'Erros', field: 'error', sorter: 'number', width: 90 },
      { title: 'Warnings', field: 'warning', sorter: 'number', width: 100 },
      { title: 'Sucessos', field: 'success', sorter: 'number', width: 100 },
    ],
  });
}

function percentFormatter(cell) {
  const v = cell.getValue() ?? 0;
  return `${v.toFixed(1)}%`;
}
function number1Formatter(cell) {
  const v = cell.getValue() ?? 0;
  return v.toFixed(1);
}
function healthFormatter(cell) {
  const v = cell.getValue();
  const map = { verde: 'success', amarelo: 'warning', vermelho: 'danger' };
  const cls = map[v] || 'secondary';
  const label = v?.charAt(0).toUpperCase() + v?.slice(1);
  return `<span class="badge text-bg-${cls}">${label}</span>`;
}
function healthSorter(a, b, aRow, bRow) {
  const order = { vermelho: 0, amarelo: 1, verde: 2 };
  return (order[a] ?? 3) - (order[b] ?? 3);
}

export function updateJobsView(records, { utc }) {
  if (!table) return;
  const summary = buildJobsSummary(records);
  const rows = summary.map(x => ({
    ...x,
    job_name: jobName(x.id_job),
    lastFormatted: x.last ? formatDate(x.last, { utc }) : '',
  }));
  table.setData(rows);
}

// Quando a aba "Jobs" é exibida, precisamos forçar o redraw para que o Tabulator
// calcule corretamente as larguras (como a aba inicia oculta, a largura pode ser 0).
export function ensureJobsRedraw() {
  if (table) {
    table.redraw(true);
  }
}
