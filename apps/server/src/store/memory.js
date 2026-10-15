// Accounts storage in memory: the same interface as the MongoDB store, for
// tests and for a server run without a database (nothing survives a restart).
// Everything goes in and out as a copy, as it would through a database, so a
// caller can't change stored data by accident.
import { newId, DEFAULT_SCHOOLS, nameOf, byName } from './shared.js';

const copy = (v) => (v === undefined || v === null ? null : structuredClone(v));
const byTime = (key) => (a, b) => a[key] - b[key];

function openMemoryStore() {
  const meta = new Map();
  const schools = new Map(); // id -> school
  const users = new Map(); // id -> user (without `name`, which is derived)
  const progress = new Map(); // userId -> { data, updatedAt }
  const classes = new Map();
  const members = []; // { classId, userId, joinedAt }
  const links = []; // { parentId, childId, createdAt }
  const assignments = new Map();
  const schedules = new Map();
  for (const s of DEFAULT_SCHOOLS) schools.set(s.id, { ...s });

  const user = (u) => (u ? { ...copy(u), name: nameOf(u) } : null);
  const find = (map, test) => [...map.values()].find(test) || null;

  return {
    kind: 'memory',
    async migrate() {},
    async close() {},
    async ping() {
      return true;
    },

    // ---- meta
    getMeta: async (key) => (meta.has(key) ? meta.get(key) : null),
    setMeta: async (key, value) => void meta.set(key, value),

    // ---- schools
    schoolByDomain: async (domain) => copy(find(schools, (s) => s.domain === String(domain || '').toLowerCase())),
    school: async (id) => copy(schools.get(id)),
    schools: async () => [...schools.values()].map(copy).sort((a, b) => a.name.localeCompare(b.name)),
    async addSchool(s) {
      const domain = s.domain.toLowerCase();
      if (schools.has(s.id) || find(schools, (x) => x.domain === domain)) return;
      schools.set(s.id, { id: s.id, name: s.name, domain });
    },

    // ---- users
    userBySub: async (sub) => user(find(users, (u) => u.sub === sub)),
    user: async (id) => user(users.get(id)),
    userByParentCode: async (code) => user(code ? find(users, (u) => u.parentCode === code) : null),
    // Creates the user, or updates name/role/school when they sign in again
    async upsertUser(u, now = Date.now()) {
      const fields = { role: u.role, firstName: u.firstName, lastInitial: u.lastInitial || '', domain: u.domain || null, schoolId: u.schoolId || null, lastSeen: now };
      const existing = find(users, (x) => x.sub === u.sub);
      if (existing) {
        Object.assign(existing, fields);
        return user(existing);
      }
      const created = { id: newId(), sub: u.sub, ...fields, parentCode: null, createdAt: now };
      users.set(created.id, created);
      return user(created);
    },
    async touchUser(id, now = Date.now()) {
      if (users.has(id)) users.get(id).lastSeen = now;
    },
    async setParentCode(id, code) {
      if (code && find(users, (u) => u.parentCode === code && u.id !== id)) throw new Error('parent code taken');
      if (users.has(id)) users.get(id).parentCode = code;
    },
    usersWithRole: async (role) => [...users.values()].filter((u) => u.role === role).map(user).sort(byName),

    // ---- progress
    getProgress: async (userId) => copy(progress.get(userId)),
    putProgress: async (userId, data, now = Date.now()) => void progress.set(userId, { data: copy(data), updatedAt: now }),

    // ---- classes and rosters
    async createClass(c, now = Date.now()) {
      if (find(classes, (x) => x.code === c.code)) throw new Error('class code taken');
      const created = { id: newId(), teacherId: c.teacherId, schoolId: c.schoolId || null, name: c.name, code: c.code, createdAt: now };
      classes.set(created.id, created);
      return copy(created);
    },
    classById: async (id) => copy(classes.get(id)),
    classByCode: async (code) => copy(find(classes, (c) => c.code === code)),
    classesOfTeacher: async (teacherId) => [...classes.values()].filter((c) => c.teacherId === teacherId).sort(byTime('createdAt')).map(copy),
    async classesOfStudent(userId) {
      const ids = new Set(members.filter((m) => m.userId === userId).map((m) => m.classId));
      return [...classes.values()].filter((c) => ids.has(c.id)).sort(byTime('createdAt')).map(copy);
    },
    async renameClass(id, name) {
      if (classes.has(id)) classes.get(id).name = name;
    },
    async addMember(classId, userId, now = Date.now()) {
      if (!members.some((m) => m.classId === classId && m.userId === userId)) members.push({ classId, userId, joinedAt: now });
    },
    async removeMember(classId, userId) {
      const i = members.findIndex((m) => m.classId === classId && m.userId === userId);
      if (i >= 0) members.splice(i, 1);
    },
    members: async (classId) =>
      members
        .filter((m) => m.classId === classId)
        .map((m) => user(users.get(m.userId)))
        .filter(Boolean)
        .sort(byName),
    isMember: async (classId, userId) => members.some((m) => m.classId === classId && m.userId === userId),

    // ---- parents
    async linkParent(parentId, childId, now = Date.now()) {
      if (!links.some((l) => l.parentId === parentId && l.childId === childId)) links.push({ parentId, childId, createdAt: now });
    },
    async unlinkParent(parentId, childId) {
      const i = links.findIndex((l) => l.parentId === parentId && l.childId === childId);
      if (i >= 0) links.splice(i, 1);
    },
    childrenOf: async (parentId) =>
      links
        .filter((l) => l.parentId === parentId)
        .map((l) => user(users.get(l.childId)))
        .filter(Boolean)
        .sort((a, b) => a.firstName.localeCompare(b.firstName)),
    isParentOf: async (parentId, childId) => links.some((l) => l.parentId === parentId && l.childId === childId),

    // ---- homework
    async createAssignment(a, now = Date.now()) {
      const created = { id: newId(), createdBy: a.createdBy, classId: a.classId || null, studentId: a.studentId || null, goal: copy(a.goal), due: a.due || null, createdAt: now };
      assignments.set(created.id, created);
      return copy(created);
    },
    assignment: async (id) => copy(assignments.get(id)),
    deleteAssignment: async (id) => void assignments.delete(id),
    assignmentsForClass: async (classId) => [...assignments.values()].filter((a) => a.classId === classId).sort(byTime('createdAt')).map(copy),
    // Everything a student has: their classes' homework plus homework set just for them
    async assignmentsForStudent(userId) {
      const ids = new Set(members.filter((m) => m.userId === userId).map((m) => m.classId));
      return [...assignments.values()].filter((a) => a.studentId === userId || ids.has(a.classId)).sort(byTime('createdAt')).map(copy);
    },

    // ---- scheduled tournaments
    async createSchedule(s, now = Date.now()) {
      const created = {
        id: newId(),
        teacherId: s.teacherId,
        scope: s.scope,
        classId: s.classId || null,
        schoolId: s.schoolId || null,
        title: s.title,
        startsAt: s.startsAt,
        settings: copy(s.settings || {}),
        roomCode: null,
        teacherKey: null,
        openedAt: null,
        createdAt: now,
      };
      schedules.set(created.id, created);
      return copy(created);
    },
    schedule: async (id) => copy(schedules.get(id)),
    deleteSchedule: async (id) => void schedules.delete(id),
    schedulesOfTeacher: async (teacherId) => [...schedules.values()].filter((s) => s.teacherId === teacherId).sort(byTime('startsAt')).map(copy),
    dueSchedules: async (now) => [...schedules.values()].filter((s) => s.openedAt === null && s.startsAt <= now).map(copy),
    // Only once: false if it was already opened (by another server)
    async markOpened(id, roomCode, teacherKey, now = Date.now()) {
      const s = schedules.get(id);
      if (!s || s.openedAt !== null) return false;
      Object.assign(s, { roomCode, teacherKey, openedAt: now });
      return true;
    },
    // Open tournaments a student can join: their classes', or their school's
    async openSchedulesForStudent(u) {
      const ids = new Set(members.filter((m) => m.userId === u.id).map((m) => m.classId));
      return [...schedules.values()]
        .filter((s) => s.roomCode !== null && (ids.has(s.classId) || (s.scope === 'school' && s.schoolId === (u.schoolId || ''))))
        .sort(byTime('startsAt'))
        .map(copy);
    },

    // Everything stored, for checks (privacy tests, migrations)
    exportAll: async () => ({
      meta: Object.fromEntries(meta),
      schools: [...schools.values()].map(copy),
      users: [...users.values()].map(copy),
      progress: [...progress].map(([userId, p]) => ({ userId, ...copy(p) })),
      classes: [...classes.values()].map(copy),
      classMembers: members.map(copy),
      parentLinks: links.map(copy),
      assignments: [...assignments.values()].map(copy),
      schedules: [...schedules.values()].map(copy),
    }),
  };
}

export { openMemoryStore };
