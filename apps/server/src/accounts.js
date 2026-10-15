// Blockout accounts: who can do what with classes, rosters, homework, parent
// links and scheduled tournaments. Pure rules over the store (server/store.js)
// and an auth provider (server/auth.js); server/classroom.js wires them to HTTP.
// Every function takes the signed-in user (or null for a guest) first.
import crypto from 'crypto';
import * as Progress from '@blockout/progress';
import * as Auth from './auth.js';
import * as Tournament from './tournament.js';
import { silentLogger } from './log.js';

class AccountError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const MAX_PROGRESS_BYTES = 512 * 1024;
const CLASS_NAME_MAX = 40;
const TITLE_MAX = 60;
// Class and parent codes: no 0/O, 1/I/L, so they're easy to read out loud
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomCode(length, taken) {
  for (;;) {
    let code = '';
    // randomInt, not a byte % 31: every letter equally likely
    for (let i = 0; i < length; i++) code += CODE_LETTERS[crypto.randomInt(CODE_LETTERS.length)];
    if (!taken(code)) return code;
  }
}
const normCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// 'YYYY-MM-DD' for a time (the server's local day)
function day(t = Date.now()) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function createAccounts({ store, auth, now = () => Date.now(), log = silentLogger }) {
  // Audit trail: who changed what, by id only (no names, no codes)
  const audit = (event, user, attrs = {}) => log.info(event, { 'user.id': user.id, 'user.role': user.role, ...attrs });

  const need = (user, ...roles) => {
    if (!user) throw new AccountError('signin', 'Please sign in first.', 401);
    if (roles.length && !roles.includes(user.role)) throw new AccountError('role', `Only ${roles.map((r) => `${r}s`).join(' and ')} can do that.`, 403);
    return user;
  };

  // A code nobody has yet (taken is async: it asks the store)
  async function freshCode(length, taken) {
    for (;;) {
      const code = randomCode(length, () => false);
      if (!(await taken(code))) return code;
    }
  }

  // Schools change rarely and every sign-in needs them: keep them a minute
  const SCHOOLS_MS = 60 * 1000;
  let schoolsCache = null;
  async function schools() {
    if (!schoolsCache || now() - schoolsCache.at > SCHOOLS_MS) schoolsCache = { at: now(), list: await store.schools() };
    return schoolsCache.list;
  }

  // What the page sees about a user (never the subject or the domain)
  async function publicUser(u) {
    const school = u.schoolId ? await store.school(u.schoolId) : null;
    return { id: u.id, role: u.role, name: u.name, firstName: u.firstName, lastInitial: u.lastInitial, school: school ? { id: school.id, name: school.name } : null };
  }

  // ---- signing in

  // Every request is signed in, but the account only needs writing when
  // something in the token changed, or once a minute for "last seen"
  const TOUCH_MS = 60 * 1000;
  const recent = new Map(); // sub -> { at, same: identity as JSON }

  async function authenticate(token) {
    if (!token) return null;
    const claims = await auth.verify(token);
    const list = await schools();
    const domain = (d) => String(d || '').toLowerCase();
    const id = Auth.identity(claims, { schoolByDomain: (d) => list.find((s) => s.domain === domain(d)) || null });
    const same = JSON.stringify(id);
    const t = now();
    const seen = recent.get(id.sub);
    if (seen && seen.same === same && t - seen.at < TOUCH_MS) {
      const user = await store.userBySub(id.sub);
      if (user) return user;
    }
    if (recent.size > 10000) recent.clear();
    recent.set(id.sub, { at: t, same });
    return store.upsertUser(id, t);
  }

  // Dev sign-in only: make a token for a made-up person.
  async function devSignIn(body = {}) {
    if (auth.name !== 'dev') throw new AccountError('provider', 'Dev sign-in is switched off on this server.', 403);
    let email = body.email;
    // A dev teacher picks a school; use a made-up address at its domain
    if (body.role === 'teacher' && body.schoolId && !email) {
      const school = await store.school(body.schoolId);
      if (school) email = `teacher@${school.domain}`;
    }
    let token;
    try {
      token = auth.issue({ firstName: body.firstName, lastInitial: body.lastInitial, role: body.role, email });
    } catch (e) {
      throw new AccountError('name', e.message);
    }
    const user = await authenticate(token);
    return { token, user: await publicUser(user) };
  }

  async function config() {
    return {
      provider: auth.name,
      ...(auth.config || {}),
      schools: (await store.schools()).map((s) => ({ id: s.id, name: s.name, domain: s.domain })),
    };
  }

  // ---- progress

  async function getProgress(user) {
    need(user);
    const saved = await store.getProgress(user.id);
    return saved ? { progress: saved.data, updatedAt: saved.updatedAt } : { progress: null };
  }

  async function putProgress(user, data) {
    need(user);
    if (!data || typeof data !== 'object') throw new AccountError('progress', 'That isn’t a save.');
    const clean = Progress.withoutCheats(data); // cheats (and what they unlocked) stay on the device
    if (JSON.stringify(clean).length > MAX_PROGRESS_BYTES) throw new AccountError('progress', 'That save is too big.');
    await store.putProgress(user.id, clean, now());
    return { ok: true, updatedAt: now() };
  }

  const progressOf = async (userId) => ((await store.getProgress(userId)) || { data: null }).data;

  // ---- a student's stats (teacher and parent views)

  async function studentStats(student, { withParentCode = false } = {}) {
    const state = await progressOf(student.id);
    const summary = Progress.factSummary(state, 12);
    const homework = await Promise.all((await store.assignmentsForStudent(student.id)).map((a) => homeworkRow(state, a)));
    const activity = ((state && state.activity) || []).slice(-10).reverse();
    return {
      id: student.id,
      name: student.name,
      lastSeen: student.lastSeen,
      lastPlayed: activity.length ? activity[0].t : null,
      summary,
      homework: { done: homework.filter((h) => h.status === 'done').length, late: homework.filter((h) => h.status === 'late').length, total: homework.length },
      assignments: homework,
      recent: activity,
      ...(withParentCode ? { parentCode: await ensureParentCode(student) } : {}),
    };
  }

  async function homeworkRow(state, a) {
    const creator = await store.user(a.createdBy);
    return {
      id: a.id,
      goal: a.goal,
      due: a.due,
      createdAt: a.createdAt,
      classId: a.classId,
      from: creator ? (creator.role === 'teacher' ? 'teacher' : 'parent') : 'teacher',
      fromName: creator ? creator.name : '',
      ...Progress.homeworkStatus(state, a, day(now())),
    };
  }

  // ---- classes

  async function ownClass(user, classId) {
    need(user, 'teacher');
    const c = await store.classById(classId);
    if (!c || c.teacherId !== user.id) throw new AccountError('class', 'That class isn’t one of yours.', 404);
    return c;
  }

  async function createClass(user, body = {}) {
    need(user, 'teacher');
    const name = String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, CLASS_NAME_MAX);
    if (!name) throw new AccountError('name', 'Give the class a name, like “Room 12”.');
    const code = await freshCode(6, async (c) => Boolean(await store.classByCode(c)));
    const c = await store.createClass({ teacherId: user.id, schoolId: user.schoolId, name, code }, now());
    audit('class.created', user, { 'class.id': c.id });
    return classSummary(c);
  }

  async function classSummary(c) {
    const school = c.schoolId ? await store.school(c.schoolId) : null;
    return { id: c.id, name: c.name, code: c.code, school: school ? school.name : null, students: (await store.members(c.id)).length };
  }

  const listClasses = async (user) => ({ classes: await Promise.all((await store.classesOfTeacher(need(user, 'teacher').id)).map(classSummary)) });

  async function classDetail(user, classId) {
    const c = await ownClass(user, classId);
    const members = await store.members(c.id);
    const students = await Promise.all(members.map((s) => studentStats(s, { withParentCode: true })));
    const assignments = (await store.assignmentsForClass(c.id)).map((a) => ({
      id: a.id,
      goal: a.goal,
      label: Progress.describeGoal(a.goal),
      due: a.due,
      createdAt: a.createdAt,
      done: students.filter((s) => s.assignments.some((h) => h.id === a.id && h.status === 'done')).length,
      of: students.length,
    }));
    // homework can only ask for what every student can already play
    const options = Progress.sharedOptions(await Promise.all(members.map(async (m) => Progress.availableOptions(await progressOf(m.id)))));
    return { class: await classSummary(c), students, assignments, options };
  }

  async function removeStudent(user, classId, studentId) {
    const c = await ownClass(user, classId);
    await store.removeMember(c.id, studentId);
    audit('class.student_removed', user, { 'class.id': c.id, 'student.id': studentId });
    return { ok: true };
  }

  // A student joins a class roster with its code. School classes only take
  // accounts from that school's domain (e.g. @iusd.org).
  async function joinClass(user, body = {}) {
    need(user, 'student');
    const c = await store.classByCode(normCode(body.code));
    if (!c) throw new AccountError('code', 'No class has that code. Check it with your teacher.', 404);
    const school = c.schoolId ? await store.school(c.schoolId) : null;
    if (school && user.domain !== school.domain) {
      throw new AccountError('school', `This class is for ${school.name}. Sign in with your school account (@${school.domain}).`, 403);
    }
    await store.addMember(c.id, user.id, now());
    audit('class.joined', user, { 'class.id': c.id });
    return { class: { id: c.id, name: c.name } };
  }

  const myClasses = async (user) => ({ classes: (await store.classesOfStudent(need(user, 'student').id)).map((c) => ({ id: c.id, name: c.name })) });

  // ---- parents

  async function ensureParentCode(student) {
    if (student.parentCode) return student.parentCode;
    const code = await freshCode(8, async (c) => Boolean(await store.userByParentCode(c)));
    await store.setParentCode(student.id, code);
    student.parentCode = code;
    return code;
  }

  async function parentCode(user) {
    need(user, 'student');
    return { code: await ensureParentCode(user) };
  }

  async function linkChild(user, body = {}) {
    need(user, 'parent');
    const child = await store.userByParentCode(normCode(body.code));
    if (!child || child.role !== 'student') throw new AccountError('code', 'That code doesn’t match a student. Check it and try again.', 404);
    await store.linkParent(user.id, child.id, now());
    audit('parent.linked', user, { 'student.id': child.id });
    return { child: { id: child.id, name: child.name } };
  }

  async function unlinkChild(user, childId) {
    need(user, 'parent');
    await store.unlinkParent(user.id, childId);
    audit('parent.unlinked', user, { 'student.id': childId });
    return { ok: true };
  }

  const children = async (user) => ({ children: await Promise.all((await store.childrenOf(need(user, 'parent').id)).map((c) => studentStats(c))) });

  // Who may see a student: their linked parents, and teachers of their classes
  async function canSee(user, childId) {
    if (user.role === 'parent') return store.isParentOf(user.id, childId);
    if (user.role === 'teacher') return (await store.classesOfStudent(childId)).some((c) => c.teacherId === user.id);
    return false;
  }

  async function childDetail(user, childId) {
    need(user, 'parent', 'teacher');
    const child = await store.user(childId);
    if (!child || !(await canSee(user, childId))) throw new AccountError('student', 'You can’t see that student.', 404);
    // the detail view also draws the whole Times Table grid
    const state = await progressOf(child.id);
    const facts = ((state && state.facts && state.facts.you) || { facts: {} }).facts;
    return { ...(await studentStats(child, { withParentCode: user.role === 'teacher' })), facts, options: Progress.availableOptions(state) };
  }

  // ---- homework

  async function createAssignment(user, body = {}) {
    need(user, 'teacher', 'parent');
    const goal = Progress.cleanGoal(body.goal);
    if (!goal) throw new AccountError('goal', 'Pick what the homework is.');
    const due = body.due && /^\d{4}-\d{2}-\d{2}$/.test(body.due) ? body.due : null;
    if (user.role === 'teacher') {
      if (body.classId) {
        await ownClass(user, body.classId);
        const a = await store.createAssignment({ createdBy: user.id, classId: body.classId, goal, due }, now());
        audit('homework.created', user, { 'homework.id': a.id, 'class.id': body.classId });
        return { assignment: a };
      }
      if (!body.studentId || !(await canSee(user, body.studentId))) throw new AccountError('student', 'Pick one of your classes or students.', 404);
    } else if (!body.studentId || !(await store.isParentOf(user.id, body.studentId))) {
      throw new AccountError('student', 'Link your child’s account first.', 404);
    }
    const a = await store.createAssignment({ createdBy: user.id, studentId: body.studentId, goal, due }, now());
    audit('homework.created', user, { 'homework.id': a.id, 'student.id': body.studentId });
    return { assignment: a };
  }

  async function deleteAssignment(user, id) {
    need(user, 'teacher', 'parent');
    const a = await store.assignment(id);
    if (!a || a.createdBy !== user.id) throw new AccountError('assignment', 'Only whoever set that homework can remove it.', 404);
    await store.deleteAssignment(id);
    audit('homework.deleted', user, { 'homework.id': id });
    return { ok: true };
  }

  async function myHomework(user) {
    need(user, 'student');
    const state = await progressOf(user.id);
    return { homework: await Promise.all((await store.assignmentsForStudent(user.id)).map((a) => homeworkRow(state, a))) };
  }

  // ---- scheduled tournaments

  async function createSchedule(user, body = {}) {
    need(user, 'teacher');
    const scope = body.scope === 'school' ? 'school' : 'class';
    let classId = null;
    if (scope === 'class') classId = (await ownClass(user, body.classId)).id;
    else if (!user.schoolId) throw new AccountError('school', 'School tournaments need a school account.');
    const startsAt = Number(body.startsAt);
    if (!Number.isFinite(startsAt) || startsAt < now() - 60 * 1000) throw new AccountError('time', 'Pick a time that hasn’t passed yet.');
    const s = body.settings || {};
    const settings = {
      type: 'tournament',
      format: Tournament.FORMATS.includes(s.format) ? s.format : 'knockout',
      size: [6, 8, 10, 12].includes(Number(s.size)) ? Number(s.size) : 8,
      difficulty: ['easy', 'medium', 'hard'].includes(s.difficulty) ? s.difficulty : 'easy',
    };
    const title = String(body.title || '').replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX) || (scope === 'school' ? 'School tournament' : 'Class tournament');
    const created = await store.createSchedule({ teacherId: user.id, scope, classId, schoolId: user.schoolId, title, startsAt, settings }, now());
    audit('schedule.created', user, { 'schedule.id': created.id, 'schedule.scope': scope });
    return { schedule: await scheduleView(created) };
  }

  async function scheduleView(s) {
    const c = s.classId ? await store.classById(s.classId) : null;
    return { id: s.id, title: s.title, scope: s.scope, classId: s.classId, className: c ? c.name : null, startsAt: s.startsAt, settings: s.settings, open: Boolean(s.roomCode), roomCode: s.roomCode };
  }

  const listSchedules = async (user) => ({ schedules: await Promise.all((await store.schedulesOfTeacher(need(user, 'teacher').id)).map(scheduleView)) });

  async function ownSchedule(user, id) {
    need(user, 'teacher');
    const s = await store.schedule(id);
    if (!s || s.teacherId !== user.id) throw new AccountError('schedule', 'That isn’t one of your tournaments.', 404);
    return s;
  }

  async function deleteSchedule(user, id) {
    await ownSchedule(user, id);
    await store.deleteSchedule(id);
    audit('schedule.deleted', user, { 'schedule.id': id });
    return { ok: true };
  }

  // The teacher's keys to an opened tournament's lobby
  async function hostSchedule(user, id) {
    const s = await ownSchedule(user, id);
    if (!s.roomCode) throw new AccountError('schedule', 'That tournament hasn’t started yet.', 409);
    return { code: s.roomCode, teacherKey: s.teacherKey };
  }

  // Called every few seconds: opens the lobby of every tournament that's due.
  // createRoom(settings) -> { code, teacherKey } (a live room), or a promise of one.
  // If another server opened it first, closeRoom(code) closes ours again.
  async function openDue(createRoom, closeRoom = () => {}) {
    const opened = [];
    for (const s of await store.dueSchedules(now())) {
      const room = await createRoom(s.settings);
      if (!(await store.markOpened(s.id, room.code, room.teacherKey, now()))) {
        await closeRoom(room.code);
        continue;
      }
      opened.push({ id: s.id, code: room.code });
    }
    return opened;
  }

  // Tournaments open right now for a student (their classes' and their school's)
  async function live(user) {
    if (!user || user.role !== 'student') return { live: [] };
    return { live: (await store.openSchedulesForStudent(user)).map((s) => ({ id: s.id, title: s.title, code: s.roomCode, startsAt: s.startsAt })) };
  }

  return {
    authenticate,
    devSignIn,
    config,
    publicUser,
    me: async (user) => ({ user: await publicUser(need(user)) }),
    getProgress,
    putProgress,
    createClass,
    listClasses,
    classDetail,
    removeStudent,
    joinClass,
    myClasses,
    parentCode,
    linkChild,
    unlinkChild,
    children,
    childDetail,
    createAssignment,
    deleteAssignment,
    myHomework,
    createSchedule,
    listSchedules,
    deleteSchedule,
    hostSchedule,
    openDue,
    live,
  };
}

export { createAccounts, AccountError, day, normCode };
