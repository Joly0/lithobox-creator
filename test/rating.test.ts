import { describe, expect, it } from 'vitest';
import { shouldAsk } from '../src/ui/rating';

const DAY = 86_400_000;
const now = 100 * DAY;

describe('when the quick rating asks', () => {
  it('asks the first time and again for each new release', () => {
    expect(shouldAsk(null, 'r2', now)).toBe(true);
    expect(shouldAsk({ release: 'r1', ratedAt: now, closes: 3 }, 'r2', now)).toBe(true);
  });

  it('waits 30 days after a rating and 7 after a close', () => {
    expect(shouldAsk({ release: 'r', ratedAt: now - 29 * DAY, closes: 0 }, 'r', now)).toBe(false);
    expect(shouldAsk({ release: 'r', ratedAt: now - 30 * DAY, closes: 0 }, 'r', now)).toBe(true);
    expect(shouldAsk({ release: 'r', closedAt: now - 6 * DAY, closes: 1 }, 'r', now)).toBe(false);
    expect(shouldAsk({ release: 'r', closedAt: now - 7 * DAY, closes: 2 }, 'r', now)).toBe(true);
  });

  it('stops after three closes', () => {
    expect(shouldAsk({ release: 'r', closedAt: now - 99 * DAY, closes: 3 }, 'r', now)).toBe(false);
  });
});
