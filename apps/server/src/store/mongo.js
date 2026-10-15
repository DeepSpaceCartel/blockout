// Accounts storage in MongoDB: the store for servers (several can share it).
// Collections hold plain documents with string ids in _id; see migrations.js
// for the indexes. Same interface as memory.js.
//
// Privacy: a user document holds a first name, a last initial, a role, the
// email *domain* and the sign-in provider's opaque subject id. Never the email
// address itself.
import { MongoClient } from 'mongodb';
import { newId, nameOf, byName } from './shared.js';
import { migrate } from './migrations.js';

// { _id, ...rest } -> { id, ...rest }
const out = (doc) => {
  if (!doc) return null;
  const rest = withoutId(doc);
  return { id: doc._id, ...rest };
};
function withoutId(doc) {
  const rest = { ...doc };
  delete rest._id;
  return rest;
}
const userOut = (doc) => (doc ? { ...out(doc), name: nameOf(doc) } : null);
const noId = { projection: { _id: 0 } };
const isDuplicate = (e) => e && e.code === 11000;

async function openMongoStore(url, { dbName } = {}) {
  const client = new MongoClient(url, { appName: 'blockout', serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(dbName || undefined); // (the database named in the URL, else "test")
  const col = (name) => db.collection(name);
  const [meta, schools, users, progress, classes, classMembers, parentLinks, assignments, schedules] = [
    'meta',
    'schools',
    'users',
    'progress',
    'classes',
    'classMembers',
    'parentLinks',
    'assignments',
    'schedules',
  ].map(col);

  const classIdsOf = async (userId) => (await classMembers.find({ userId }, noId).toArray()).map((m) => m.classId);
  const usersByIds = async (ids) => (ids.length ? (await users.find({ _id: { $in: ids } }).toArray()).map(userOut) : []);

  return {
    kind: 'mongo',
    db,
    migrate: () => migrate(db),
    close: () => client.close(),
    ping: async () => (await db.command({ ping: 1 })).ok === 1,

    // ---- meta (the schema version also lives here, under 'schema')
    getMeta: async (key) => ((await meta.findOne({ _id: key })) || {}).value ?? null,
    setMeta: async (key, value) => void (await meta.updateOne({ _id: key }, { $set: { value } }, { upsert: true })),

    // ---- schools
    schoolByDomain: async (domain) => out(await schools.findOne({ domain: String(domain || '').toLowerCase() })),
    school: async (id) => out(await schools.findOne({ _id: id })),
    schools: async () => (await schools.find().toArray()).map(out).sort((a, b) => a.name.localeCompare(b.name)),
    async addSchool(s) {
      try {
        await schools.insertOne({ _id: s.id, name: s.name, domain: s.domain.toLowerCase() });
      } catch (e) {
        if (!isDuplicate(e)) throw e; // (id or domain taken: left as it is)
      }
    },

    // ---- users
    userBySub: async (sub) => userOut(await users.findOne({ sub })),
    user: async (id) => userOut(await users.findOne({ _id: id })),
    userByParentCode: async (code) => (code ? userOut(await users.findOne({ parentCode: code })) : null),
    // Creates the user, or updates name/role/school when they sign in again
    async upsertUser(u, now = Date.now()) {
      const fields = { role: u.role, firstName: u.firstName, lastInitial: u.lastInitial || '', domain: u.domain || null, schoolId: u.schoolId || null, lastSeen: now };
      const write = () =>
        users.findOneAndUpdate(
          { sub: u.sub },
          { $set: fields, $setOnInsert: { _id: newId(), parentCode: null, createdAt: now } },
          { upsert: true, returnDocument: 'after' }
        );
      try {
        return userOut(await write());
      } catch (e) {
        if (!isDuplicate(e)) throw e;
        return userOut(await write()); // two first sign-ins at once: the other one made it
      }
    },
    touchUser: async (id, now = Date.now()) => void (await users.updateOne({ _id: id }, { $set: { lastSeen: now } })),
    setParentCode: async (id, code) => void (await users.updateOne({ _id: id }, { $set: { parentCode: code } })),
    usersWithRole: async (role) => (await users.find({ role }).toArray()).map(userOut).sort(byName),

    // ---- progress (as JSON text: a save's keys are the game's, not ours to restrict)
    async getProgress(userId) {
      const doc = await progress.findOne({ _id: userId });
      return doc ? { data: JSON.parse(doc.json), updatedAt: doc.updatedAt } : null;
    },
    putProgress: async (userId, data, now = Date.now()) =>
      void (await progress.updateOne({ _id: userId }, { $set: { json: JSON.stringify(data), updatedAt: now } }, { upsert: true })),

    // ---- classes and rosters
    async createClass(c, now = Date.now()) {
      const doc = { _id: newId(), teacherId: c.teacherId, schoolId: c.schoolId || null, name: c.name, code: c.code, createdAt: now };
      await classes.insertOne(doc);
      return out(doc);
    },
    classById: async (id) => out(await classes.findOne({ _id: id })),
    classByCode: async (code) => out(await classes.findOne({ code })),
    classesOfTeacher: async (teacherId) => (await classes.find({ teacherId }).sort({ createdAt: 1 }).toArray()).map(out),
    classesOfStudent: async (userId) => (await classes.find({ _id: { $in: await classIdsOf(userId) } }).sort({ createdAt: 1 }).toArray()).map(out),
    renameClass: async (id, name) => void (await classes.updateOne({ _id: id }, { $set: { name } })),
    addMember: async (classId, userId, now = Date.now()) =>
      void (await classMembers.updateOne({ classId, userId }, { $setOnInsert: { joinedAt: now } }, { upsert: true })),
    removeMember: async (classId, userId) => void (await classMembers.deleteOne({ classId, userId })),
    members: async (classId) => (await usersByIds((await classMembers.find({ classId }, noId).toArray()).map((m) => m.userId))).sort(byName),
    isMember: async (classId, userId) => Boolean(await classMembers.findOne({ classId, userId })),

    // ---- parents
    linkParent: async (parentId, childId, now = Date.now()) =>
      void (await parentLinks.updateOne({ parentId, childId }, { $setOnInsert: { createdAt: now } }, { upsert: true })),
    unlinkParent: async (parentId, childId) => void (await parentLinks.deleteOne({ parentId, childId })),
    childrenOf: async (parentId) =>
      (await usersByIds((await parentLinks.find({ parentId }, noId).toArray()).map((l) => l.childId))).sort((a, b) => a.firstName.localeCompare(b.firstName)),
    isParentOf: async (parentId, childId) => Boolean(await parentLinks.findOne({ parentId, childId })),

    // ---- homework
    async createAssignment(a, now = Date.now()) {
      const doc = { _id: newId(), createdBy: a.createdBy, classId: a.classId || null, studentId: a.studentId || null, goal: a.goal, due: a.due || null, createdAt: now };
      await assignments.insertOne(doc);
      return out(doc);
    },
    assignment: async (id) => out(await assignments.findOne({ _id: id })),
    deleteAssignment: async (id) => void (await assignments.deleteOne({ _id: id })),
    assignmentsForClass: async (classId) => (await assignments.find({ classId }).sort({ createdAt: 1 }).toArray()).map(out),
    // Everything a student has: their classes' homework plus homework set just for them
    assignmentsForStudent: async (userId) =>
      (await assignments.find({ $or: [{ studentId: userId }, { classId: { $in: await classIdsOf(userId) } }] }).sort({ createdAt: 1 }).toArray()).map(out),

    // ---- scheduled tournaments
    async createSchedule(s, now = Date.now()) {
      const doc = {
        _id: newId(),
        teacherId: s.teacherId,
        scope: s.scope,
        classId: s.classId || null,
        schoolId: s.schoolId || null,
        title: s.title,
        startsAt: s.startsAt,
        settings: s.settings || {},
        roomCode: null,
        teacherKey: null,
        openedAt: null,
        createdAt: now,
      };
      await schedules.insertOne(doc);
      return out(doc);
    },
    schedule: async (id) => out(await schedules.findOne({ _id: id })),
    deleteSchedule: async (id) => void (await schedules.deleteOne({ _id: id })),
    schedulesOfTeacher: async (teacherId) => (await schedules.find({ teacherId }).sort({ startsAt: 1 }).toArray()).map(out),
    dueSchedules: async (now) => (await schedules.find({ openedAt: null, startsAt: { $lte: now } }).toArray()).map(out),
    // Only once: false if it was already opened (by another server)
    markOpened: async (id, roomCode, teacherKey, now = Date.now()) =>
      (await schedules.updateOne({ _id: id, openedAt: null }, { $set: { roomCode, teacherKey, openedAt: now } })).modifiedCount === 1,
    // Open tournaments a student can join: their classes', or their school's
    openSchedulesForStudent: async (u) =>
      (
        await schedules
          .find({ roomCode: { $ne: null }, $or: [{ classId: { $in: await classIdsOf(u.id) } }, { scope: 'school', schoolId: u.schoolId || '' }] })
          .sort({ startsAt: 1 })
          .toArray()
      ).map(out),

    // Everything stored, for checks (privacy tests, migrations)
    async exportAll() {
      const all = async (c, map = out) => (await c.find().toArray()).map(map);
      const strip = withoutId;
      return {
        meta: Object.fromEntries((await meta.find({ _id: { $ne: 'schema' } }).toArray()).map((m) => [m._id, m.value])),
        schools: await all(schools),
        users: await all(users),
        progress: (await progress.find().toArray()).map((p) => ({ userId: p._id, data: JSON.parse(p.json), updatedAt: p.updatedAt })),
        classes: await all(classes),
        classMembers: await all(classMembers, strip),
        parentLinks: await all(parentLinks, strip),
        assignments: await all(assignments),
        schedules: await all(schedules),
      };
    },
  };
}

export { openMongoStore };
