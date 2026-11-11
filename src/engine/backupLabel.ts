// "Last backup: 3 days ago" (§14.2), shown in a project's menu on the Home screen.
export function backupLabel(lastExportedAt: number | undefined, now = Date.now()): string {
  if (!lastExportedAt) return 'Last backup: never';
  const minutes = Math.floor(Math.max(0, now - lastExportedAt) / 60_000);
  if (minutes < 1) return 'Last backup: just now';
  if (minutes < 60) return `Last backup: ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last backup: ${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `Last backup: ${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  return `Last backup: ${months} months ago`;
}
