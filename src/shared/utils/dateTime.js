export const EASY_PRINT_TIME_ZONE = 'America/Sao_Paulo';

const ISO_DATE_TIME_WITHOUT_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const EXPLICIT_TIME_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

export function parseEasyPrintDateTime(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  const source = String(value || '').trim();
  if (!source) return null;

  // A API persiste os horarios em UTC usando LocalDateTime. O JSON, portanto,
  // chega sem "Z" e seria interpretado pelo navegador como horario local.
  const normalized = ISO_DATE_TIME_WITHOUT_ZONE.test(source) && !EXPLICIT_TIME_ZONE.test(source)
    ? `${source}Z`
    : source;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function getEasyPrintTimestamp(value) {
  return parseEasyPrintDateTime(value)?.getTime() || 0;
}

export function formatEasyPrintDateTime(value, fallback = '-') {
  const date = parseEasyPrintDateTime(value);
  if (!date) return fallback;

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: EASY_PRINT_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
