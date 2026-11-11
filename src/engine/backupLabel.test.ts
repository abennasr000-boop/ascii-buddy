import { describe, expect, it } from 'vitest';
import { backupLabel } from './backupLabel';

const NOW = 1_700_000_000_000;
const ago = (ms: number) => backupLabel(NOW - ms, NOW);

describe('backupLabel', () => {
  it('says never when there is no backup', () => expect(backupLabel(undefined, NOW)).toBe('Last backup: never'));
  it('uses minutes, hours and days', () => {
    expect(ago(30_000)).toBe('Last backup: just now');
    expect(ago(5 * 60_000)).toBe('Last backup: 5 minutes ago');
    expect(ago(3 * 3_600_000)).toBe('Last backup: 3 hours ago');
    expect(ago(3 * 86_400_000)).toBe('Last backup: 3 days ago');
    expect(ago(1 * 86_400_000)).toBe('Last backup: 1 day ago');
  });
});
