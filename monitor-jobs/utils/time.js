// utils/time.js
// Requer Luxon global (window.luxon)

// Verificação de segurança para Luxon
if (!window.luxon) {
  console.error('Luxon não está carregado! Verifique se o script está incluído no HTML.');
  throw new Error('Luxon library not loaded');
}

const { DateTime } = window.luxon;

export function formatDate(date, { utc = false } = {}) {
  if (!date) return '';
  
  try {
    let dt;
    
    // Se for string, converter para DateTime diretamente
    if (typeof date === 'string') {
      dt = utc ? DateTime.fromISO(date, { zone: 'utc' }) : DateTime.fromISO(date, { zone: 'America/Sao_Paulo' });
    } 
    // Se for objeto Date, usar fromJSDate
    else if (date instanceof Date) {
      if (isNaN(date.getTime())) return '';
      dt = utc ? DateTime.fromJSDate(date, { zone: 'utc' }) : DateTime.fromJSDate(date, { zone: 'America/Sao_Paulo' });
    } 
    // Se for número (timestamp), converter
    else if (typeof date === 'number') {
      dt = utc ? DateTime.fromMillis(date, { zone: 'utc' }) : DateTime.fromMillis(date, { zone: 'America/Sao_Paulo' });
    } 
    else {
      return '';
    }
    
    // Verificar se a data é válida
    if (!dt.isValid) return '';
    
    return dt.toFormat('yyyy-LL-dd HH:mm:ss');
  } catch (error) {
    console.warn('Erro ao formatar data:', error, date);
    return '';
  }
}

// Retorna uma chave por hora (ISO) para agregações de tendência
export function bucketHourKey(date, { utc = true } = {}) {
  if (!date) {
    console.warn('Data nula ou undefined para bucketHourKey:', date);
    return null;
  }
  
  try {
    let dt;
    
    // Se for string, converter para DateTime diretamente
    if (typeof date === 'string') {
      dt = utc ? DateTime.fromISO(date, { zone: 'utc' }) : DateTime.fromISO(date, { zone: 'America/Sao_Paulo' });
    } 
    // Se for objeto Date, usar fromJSDate
    else if (date instanceof Date) {
      if (isNaN(date.getTime())) {
        console.warn('Data inválida (NaN) para bucketHourKey:', date);
        return null;
      }
      dt = utc ? DateTime.fromJSDate(date, { zone: 'utc' }) : DateTime.fromJSDate(date, { zone: 'America/Sao_Paulo' });
    } 
    // Se for número (timestamp), converter
    else if (typeof date === 'number') {
      dt = utc ? DateTime.fromMillis(date, { zone: 'utc' }) : DateTime.fromMillis(date, { zone: 'America/Sao_Paulo' });
    } 
    else {
      console.warn('Tipo de data não suportado para bucketHourKey:', typeof date, date);
      return null;
    }
    
    // Verificar se a data é válida
    if (!dt.isValid) {
      console.warn('Data inválida após conversão para bucketHourKey:', date, dt.invalidReason);
      return null;
    }
    
    return dt.startOf('hour').toISO({ suppressMilliseconds: true });
  } catch (error) {
    console.warn('Erro ao processar data em bucketHourKey:', error, date);
    return null;
  }
}
