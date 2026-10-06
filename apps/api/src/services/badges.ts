// Badges the admin makes (an emoji, a name, a colour — "Баг-хантер 🐞", "Котик 🐱") and gives to people;
// they show on everyone's profile, and fly around the avatar when friends open it.
import type { DB } from '../lib/db.js';
import { newId } from '../lib/util.js';

export interface Badge { id: string; title: string; emoji: string; color: string; description: string; givenAt?: string; holders?: number }

const map = (r: any): Badge => ({
  id: r.id, title: r.title, emoji: r.emoji, color: r.color, description: r.description,
  ...(r.given_at ? { givenAt: r.given_at } : {}), ...(r.holders !== undefined ? { holders: r.holders } : {}),
});

export function allBadges(db: DB): Badge[] {
  return (db.prepare(`SELECT b.*, (SELECT COUNT(*) FROM user_badges ub WHERE ub.badge_id = b.id) holders FROM badges b ORDER BY b.created_at`).all() as any[]).map(map);
}

export function badgesOf(db: DB, userId: string): Badge[] {
  return (db.prepare(`SELECT b.*, ub.given_at FROM user_badges ub JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id = ? ORDER BY ub.given_at`).all(userId) as any[]).map(map);
}

export function holdersOf(db: DB, badgeId: string): string[] {
  return (db.prepare('SELECT user_id FROM user_badges WHERE badge_id = ?').all(badgeId) as any[]).map((r) => r.user_id as string);
}

export function saveBadge(db: DB, id: string | null, b: { title: string; emoji: string; color: string; description: string }): Badge {
  const bid = id ?? newId();
  if (id) db.prepare('UPDATE badges SET title = ?, emoji = ?, color = ?, description = ? WHERE id = ?').run(b.title, b.emoji, b.color, b.description, id);
  else db.prepare('INSERT INTO badges (id, title, emoji, color, description) VALUES (?,?,?,?,?)').run(bid, b.title, b.emoji, b.color, b.description);
  return map(db.prepare('SELECT * FROM badges WHERE id = ?').get(bid));
}

/** Gives a badge; the person hears about it in their inbox (once — giving it again changes nothing). */
export function giveBadge(db: DB, badgeId: string, userId: string, by: string): boolean {
  const r = db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_id, given_by) VALUES (?,?,?)').run(userId, badgeId, by);
  if (!r.changes) return false;
  db.prepare('INSERT INTO shares (id, from_user, to_user, kind, ref_id, message) VALUES (?,?,?,?,?,?)').run(newId(), by === userId ? null : by, userId, 'badge', badgeId, '');
  return true;
}

export function takeBadge(db: DB, badgeId: string, userId: string) {
  db.prepare('DELETE FROM user_badges WHERE badge_id = ? AND user_id = ?').run(badgeId, userId);
}
