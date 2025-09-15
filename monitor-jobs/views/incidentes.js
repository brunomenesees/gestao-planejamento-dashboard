// views/incidentes.js
import { formatDate } from '../utils/time.js';
import { jobName } from '../utils/jobs_map.js';
import { getTabulatorCtor, ensureTabulatorLoaded } from '../utils/tabulator.js';

let table;

export async function initIncidentsTable(containerEl) {
  const TabulatorCtor = getTabulatorCtor() || await ensureTabulatorLoaded();
  if (!TabulatorCtor) {
    console.error('Tabulator global não encontrado');
    return;
  }
  table = new TabulatorCtor(containerEl, {
    layout: 'fitColumns',
    height: '500px',
    pagination: true,
    paginationSize: 25,
    paginationSizeSelector: [25, 50, 100, 200],
    columns: [
      { title: 'Data Execução', field: 'dateFormatted', sorter: 'datetime', width: 200 },
      { title: 'Job', field: 'job_name', width: 220 },
      { title: 'Severidade', field: 'severity', width: 120, formatter: severityFormatter },
      { title: 'Tempo (s)', field: 'tempo_execucao', sorter: 'number', width: 110 },
      { title: 'Mensagem', field: 'mensagem', minWidth: 300, formatter: 'textarea' },
    ],
  });
}

function severityFormatter(cell) {
  const v = cell.getValue();
  const map = {
    success: 'success',
    error: 'danger',
    warning: 'warning',
    info: 'primary',
  };
  const cls = map[v] || 'secondary';
  return `<span class="badge text-bg-${cls}">${v}</span>`;
}

export function updateIncidentsTable(records, { utc }) {
  if (!table) return;
  const rows = records.map(r => ({
    id: r.id,
    id_job: r.id_job,
    job_name: jobName(r.id_job),
    severity: r.severity,
    tempo_execucao: r.tempo_execucao,
    dateFormatted: formatDate(r.date, { utc }),
    mensagem: r.status ? r.status.split('\n')[0] : '',
  }));
  table.setData(rows);
}
