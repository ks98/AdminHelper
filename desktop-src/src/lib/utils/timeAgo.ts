export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const ms = Date.parse(dateStr);
  if (Number.isNaN(ms)) return '-';
  const diff = Date.now() - ms;
  if (diff < 0) return '-';
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'gerade eben';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `vor ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'gestern';
  if (days < 30) return `vor ${days} Tagen`;
  const months = Math.floor(days / 30);
  if (months >= 12) {
    const years = Math.floor(months / 12);
    return `vor ${years} Jahr${years === 1 ? '' : 'en'}`;
  }
  return `vor ${months} Monat${months === 1 ? '' : 'en'}`;
}
