// Blockout accounts storage in sqlite, through Node's built-in node:sqlite: the
// store before MongoDB, kept to read old databases (and as a reference the
// other stores are tested against).
//
// Privacy: a user row holds a first name, a last initial, a role, the email
// *domain* (to match a school, e.g. iusd.org) and the sign-in provider's opaque
// subject id. Never the email address itself.
import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS schools (id TEXT PRIMARY KEY, name TEXT NOT NULL, domain TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  sub TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_initial TEXT NOT NULL DEFAULT '',
  domain TEXT,
  school_id TEXT REFERENCES schools(id),
  parent_code TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS progress (user_id TEXT PRIMARY KEY REFERENCES users(id), data TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL REFERENCES users(id),
  school_id TEXT REFERENCES schools(id),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS class_members (
  class_id TEXT NOT NULL REFERENCES classes(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (class_id, user_id)
);
CREATE TABLE IF NOT EXISTS parent_links (
  parent_id TEXT NOT NULL REFERENCES users(id),
  child_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (parent_id, child_id)
);
CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  class_id TEXT REFERENCES classes(id),
  student_id TEXT REFERENCES users(id),
  goal TEXT NOT NULL,
  due TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL REFERENCES users(id),
  scope TEXT NOT NULL,
  class_id TEXT REFERENCES classes(id),
  school_id TEXT REFERENCES schools(id),
  title TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  settings TEXT NOT NULL,
  room_code TEXT,
  teacher_key TEXT,
  opened_at INTEGER,
  created_at INTEGER NOT NULL
);
`;

import { newId, DEFAULT_SCHOOLS } from './shared.js';

// file: a path, or ':memory:' (tests). Defaults to data/blockout.db at the repo's root.
function openSqliteStore(file = process.env.BLOCKOUT_DB || path.join(import.meta.dirname, '..', '..', '..', '..', 'data', 'blockout.db')) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  const insertSchool = db.prepare('INSERT OR IGNORE INTO schools (id, name, domain) VALUES (?, ?, ?)');
  for (const s of DEFAULT_SCHOOLS) insertSchool.run(s.id, s.name, s.domain);

  const one = (sql, ...args) => db.prepare(sql).get(...args) || null;
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const plain = (row) => (row ? { ...row } : null); // node:sqlite rows have a null prototype

  const userFromRow = (r) =>
    r && {
      id: r.id,
      sub: r.sub,
      role: r.role,
      firstName: r.first_name,
      lastInitial: r.last_initial,
      name: r.last_initial ? `${r.first_name} ${r.last_initial}.` : r.first_name,
      domain: r.domain,
      schoolId: r.school_id,
      parentCode: r.parent_code,
      createdAt: r.created_at,
      lastSeen: r.last_seen,
    };
  const classFromRow = (r) => r && { id: r.id, teacherId: r.teacher_id, schoolId: r.school_id, name: r.name, code: r.code, createdAt: r.created_at };
  const assignmentFromRow = (r) =>
    r && { id: r.id, createdBy: r.created_by, classId: r.class_id, studentId: r.student_id, goal: JSON.parse(r.goal), due: r.due, createdAt: r.created_at };
  const scheduleFromRow = (r) =>
    r && {
      id: r.id,
      teacherId: r.teacher_id,
      scope: r.scope,
      classId: r.class_id,
      schoolId: r.school_id,
      title: r.title,
      startsAt: r.starts_at,
      settings: JSON.parse(r.settings),
      roomCode: r.room_code,
      teacherKey: r.teacher_key,
      openedAt: r.opened_at,
      createdAt: r.created_at,
    };

  const table = (name) => all(`SELECT * FROM ${name}`).map(plain);

  // node:sqlite answers at once; the other stores answer later. Every method
  // returns a promise here too, so callers (and errors) behave the same.
  const asyncMethods = (store) => Object.fromEntries(Object.entries(store).map(([k, v]) => [k, typeof v === 'function' ? async (...args) => v(...args) : v]));

  return asyncMethods({
    kind: 'sqlite',
    db,
    migrate: () => {},
    close: () => db.close(),
    ping: () => Boolean(one('SELECT 1 AS ok')),

    // ---- meta (e.g. the dev sign-in secret, so tokens survive a restart)
    getMeta: (key) => (one('SELECT value FROM meta WHERE key = ?', key) || {}).value || null,
    setMeta: (key, value) => run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value),

    // ---- schools
    schoolByDomain: (domain) => plain(one('SELECT * FROM schools WHERE domain = ?', String(domain || '').toLowerCase())),
    school: (id) => plain(one('SELECT * FROM schools WHERE id = ?', id)),
    schools: () => all('SELECT * FROM schools ORDER BY name').map(plain),
    addSchool: (s) => run('INSERT OR IGNORE INTO schools (id, name, domain) VALUES (?, ?, ?)', s.id, s.name, s.domain.toLowerCase()),

    // ---- users
    userBySub: (sub) => userFromRow(one('SELECT * FROM users WHERE sub = ?', sub)),
    user: (id) => userFromRow(one('SELECT * FROM users WHERE id = ?', id)),
    userByParentCode: (code) => userFromRow(one('SELECT * FROM users WHERE parent_code = ?', code)),
    // Creates the user, or updates name/role/school when they sign in again.
    upsertUser(u, now = Date.now()) {
      const existing = one('SELECT id FROM users WHERE sub = ?', u.sub);
      if (existing) {
        run(
          'UPDATE users SET role = ?, first_name = ?, last_initial = ?, domain = ?, school_id = ?, last_seen = ? WHERE id = ?',
          u.role, u.firstName, u.lastInitial || '', u.domain || null, u.schoolId || null, now, existing.id
        );
        return userFromRow(one('SELECT * FROM users WHERE id = ?', existing.id));
      }
      const id = newId();
      run(
        'INSERT INTO users (id, sub, role, first_name, last_initial, domain, school_id, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id, u.sub, u.role, u.firstName, u.lastInitial || '', u.domain || null, u.schoolId || null, now, now
      );
      return userFromRow(one('SELECT * FROM users WHERE id = ?', id));
    },
    touchUser: (id, now = Date.now()) => run('UPDATE users SET last_seen = ? WHERE id = ?', now, id),
    setParentCode: (id, code) => run('UPDATE users SET parent_code = ? WHERE id = ?', code, id),
    usersWithRole: (role) => all('SELECT * FROM users WHERE role = ? ORDER BY first_name', role).map(userFromRow),

    // ---- progress (the game's save, as JSON)
    getProgress(userId) {
      const r = one('SELECT data, updated_at FROM progress WHERE user_id = ?', userId);
      return r ? { data: JSON.parse(r.data), updatedAt: r.updated_at } : null;
    },
    putProgress: (userId, data, now = Date.now()) =>
      run('INSERT INTO progress (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at', userId, JSON.stringify(data), now),

    // ---- classes and rosters
    createClass(c, now = Date.now()) {
      const id = newId();
      run('INSERT INTO classes (id, teacher_id, school_id, name, code, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, c.teacherId, c.schoolId || null, c.name, c.code, now);
      return classFromRow(one('SELECT * FROM classes WHERE id = ?', id));
    },
    classById: (id) => classFromRow(one('SELECT * FROM classes WHERE id = ?', id)),
    classByCode: (code) => classFromRow(one('SELECT * FROM classes WHERE code = ?', code)),
    classesOfTeacher: (teacherId) => all('SELECT * FROM classes WHERE teacher_id = ? ORDER BY created_at', teacherId).map(classFromRow),
    classesOfStudent: (userId) =>
      all('SELECT c.* FROM classes c JOIN class_members m ON m.class_id = c.id WHERE m.user_id = ? ORDER BY c.created_at', userId).map(classFromRow),
    renameClass: (id, name) => run('UPDATE classes SET name = ? WHERE id = ?', name, id),
    addMember: (classId, userId, now = Date.now()) => run('INSERT OR IGNORE INTO class_members (class_id, user_id, joined_at) VALUES (?, ?, ?)', classId, userId, now),
    removeMember: (classId, userId) => run('DELETE FROM class_members WHERE class_id = ? AND user_id = ?', classId, userId),
    members: (classId) =>
      all('SELECT u.* FROM users u JOIN class_members m ON m.user_id = u.id WHERE m.class_id = ? ORDER BY u.first_name, u.last_initial', classId).map(userFromRow),
    isMember: (classId, userId) => Boolean(one('SELECT 1 AS x FROM class_members WHERE class_id = ? AND user_id = ?', classId, userId)),

    // ---- parents
    linkParent: (parentId, childId, now = Date.now()) => run('INSERT OR IGNORE INTO parent_links (parent_id, child_id, created_at) VALUES (?, ?, ?)', parentId, childId, now),
    unlinkParent: (parentId, childId) => run('DELETE FROM parent_links WHERE parent_id = ? AND child_id = ?', parentId, childId),
    childrenOf: (parentId) =>
      all('SELECT u.* FROM users u JOIN parent_links l ON l.child_id = u.id WHERE l.parent_id = ? ORDER BY u.first_name', parentId).map(userFromRow),
    isParentOf: (parentId, childId) => Boolean(one('SELECT 1 AS x FROM parent_links WHERE parent_id = ? AND child_id = ?', parentId, childId)),

    // ---- homework
    createAssignment(a, now = Date.now()) {
      const id = newId();
      run(
        'INSERT INTO assignments (id, created_by, class_id, student_id, goal, due, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        id, a.createdBy, a.classId || null, a.studentId || null, JSON.stringify(a.goal), a.due || null, now
      );
      return assignmentFromRow(one('SELECT * FROM assignments WHERE id = ?', id));
    },
    assignment: (id) => assignmentFromRow(one('SELECT * FROM assignments WHERE id = ?', id)),
    deleteAssignment: (id) => run('DELETE FROM assignments WHERE id = ?', id),
    assignmentsForClass: (classId) => all('SELECT * FROM assignments WHERE class_id = ? ORDER BY created_at', classId).map(assignmentFromRow),
    // Everything a student has: their classes' homework plus homework set just for them
    assignmentsForStudent: (userId) =>
      all(
        `SELECT a.* FROM assignments a
         WHERE a.student_id = ? OR a.class_id IN (SELECT class_id FROM class_members WHERE user_id = ?)
         ORDER BY a.created_at`,
        userId, userId
      ).map(assignmentFromRow),

    // ---- scheduled tournaments
    createSchedule(s, now = Date.now()) {
      const id = newId();
      run(
        'INSERT INTO schedules (id, teacher_id, scope, class_id, school_id, title, starts_at, settings, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id, s.teacherId, s.scope, s.classId || null, s.schoolId || null, s.title, s.startsAt, JSON.stringify(s.settings || {}), now
      );
      return scheduleFromRow(one('SELECT * FROM schedules WHERE id = ?', id));
    },
    schedule: (id) => scheduleFromRow(one('SELECT * FROM schedules WHERE id = ?', id)),
    deleteSchedule: (id) => run('DELETE FROM schedules WHERE id = ?', id),
    schedulesOfTeacher: (teacherId) => all('SELECT * FROM schedules WHERE teacher_id = ? ORDER BY starts_at', teacherId).map(scheduleFromRow),
    dueSchedules: (now) => all('SELECT * FROM schedules WHERE opened_at IS NULL AND starts_at <= ?', now).map(scheduleFromRow),
    // Only once: false if it was already opened
    markOpened: (id, roomCode, teacherKey, now = Date.now()) =>
      run('UPDATE schedules SET room_code = ?, teacher_key = ?, opened_at = ? WHERE id = ? AND opened_at IS NULL', roomCode, teacherKey, now, id).changes === 1,
    // Open tournaments a student can join: their classes', or their school's
    openSchedulesForStudent: (user) =>
      all(
        `SELECT * FROM schedules WHERE room_code IS NOT NULL AND (
           class_id IN (SELECT class_id FROM class_members WHERE user_id = ?)
           OR (scope = 'school' AND school_id = ?)
         ) ORDER BY starts_at`,
        user.id, user.schoolId || ''
      ).map(scheduleFromRow),

    // Everything stored, in the other stores' shape (for checks and for moving to MongoDB)
    exportAll: () => ({
      meta: Object.fromEntries(table('meta').map((r) => [r.key, r.value])),
      schools: table('schools'),
      users: table('users').map((r) => {
        const u = userFromRow(r);
        delete u.name; // (derived, not stored)
        return u;
      }),
      progress: table('progress').map((r) => ({ userId: r.user_id, data: JSON.parse(r.data), updatedAt: r.updated_at })),
      classes: table('classes').map(classFromRow),
      classMembers: table('class_members').map((r) => ({ classId: r.class_id, userId: r.user_id, joinedAt: r.joined_at })),
      parentLinks: table('parent_links').map((r) => ({ parentId: r.parent_id, childId: r.child_id, createdAt: r.created_at })),
      assignments: table('assignments').map(assignmentFromRow),
      schedules: table('schedules').map(scheduleFromRow),
    }),
  });
}

export { openSqliteStore };
