export const toOpportunitySlug = (value = '') =>
  String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

export const formatOpportunityDate = (value) => {
  if (!value) return 'Sem Data';

  const dateStr = String(value);
  const isoDateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoDateMatch) {
    const [, year, month, day] = isoDateMatch;
    return `${day}/${month}/${year}`;
  }

  return dateStr;
};
