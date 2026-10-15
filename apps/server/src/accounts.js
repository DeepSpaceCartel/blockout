// Blockout accounts: who can do what with classes, rosters, homework, parent
// links, invites and scheduled tournaments. Rules over the store (store/) and
// an auth provider (auth.js); index.js wires them to HTTP. Every function
// takes the signed-in user (or null for a guest) first.
//
// Roles live here, not in the sign-in provider: anyone who signs in is a
// student. A one-time invite makes someone a teacher (from an admin or a
// teacher) or a child's grown-up (from the child, their teacher or an admin);
// an admin can also change a role directly. Admins are the accounts with the
// `admin` realm role in Keycloak.
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
const DAY_MS = 24 * 60 * 60 * 1000;
const INVITE_DAYS = { teacher: 7, parent: 14 };
const TEACHER_INVITES_OPEN = 10; // a teacher's unused teacher invites at one time…
const TEACHER_INVITES_A_DAY = 20; // …and made in a day
const PARENT_INVITES_A_DAY = 50;
const ROLES = ['student', 'teacher', 'parent'];
const CLASS_NAME_MAX = 40;
const TITLE_MAX = 60;
// Class codes and invites: no 0/O, 1/I/L, so they're easy to read out loud
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
// Invites are kept as hashes: a copy of the database can't be used to redeem them
const hashCode = (code) => crypto.createHash('sha256').update(normCode(code)).digest('hex');

// 'YYYY-MM-DD' for a time (the server's local day)
function day(t = Date.now()) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function createAccounts({ store, auth, now = () => Date.now(), log = silentLogger }) {
  // Audit trail: who changed what, by id only (no names, no codes)
  const audit = (event, user, attrs = {}) => log.info(event, { 'user.id': user.id, 'user.role': user.role, ...attrs });

  // need(user, 'teacher', 'admin'): signed in, with one of these roles ('admin': an admin, whatever their role)
  const need = (user, ...roles) => {
    if (!user) throw new AccountError('signin', 'Please sign in first.', 401);
    if (roles.length && !roles.includes(user.role) && !(roles.includes('admin') && user.isAdmin)) {
      throw new AccountError('role', `Only ${roles.map((r) => `${r}s`).join(' and ')} can do that.`, 403);
    }
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
    return { id: u.id, role: u.role, isAdmin: Boolean(u.isAdmin), name: u.name, firstName: u.firstName, lastInitial: u.lastInitial, school: school ? { id: school.id, name: school.name } : null };
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
    let user = seen && seen.same === same && t - seen.at < TOUCH_MS ? await store.userBySub(id.sub) : null;
    if (!user) {
      if (recent.size > 10000) recent.clear();
      recent.set(id.sub, { at: t, same });
      user = await store.upsertUser(id, t);
    }
    return { ...user, isAdmin: id.isAdmin }; // (from the token, never stored)
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
      token = auth.issue({ firstName: body.firstName, lastInitial: body.lastInitial, role: body.role, admin: Boolean(body.admin), email });
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

  async function studentStats(student) {
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
    const students = await Promise.all(members.map((s) => studentStats(s)));
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

  // ---- invites

  // A fresh invite code, shown once: only its hash is kept
  async function newInvite(kind, createdBy, { childId = null, schoolId = null } = {}) {
    for (;;) {
      const code = randomCode(8, () => false);
      try {
        await store.createInvite({ kind, codeHash: hashCode(code), createdBy: createdBy.id, childId, schoolId, expiresAt: now() + INVITE_DAYS[kind] * DAY_MS }, now());
        audit('invite.created', createdBy, { 'invite.kind': kind, ...(childId ? { 'student.id': childId } : {}) });
        return { kind, code, expiresAt: now() + INVITE_DAYS[kind] * DAY_MS };
      } catch (e) {
        if (!/taken|duplicate|E11000/i.test(e.message)) throw e; // (else: the same code twice, try another)
      }
    }
  }

  // A code for a child's grown-up: the child makes one for themself; their
  // teacher or an admin for them. A new one replaces the maker's last unused one.
  async function parentInvite(user, studentId = null) {
    need(user, 'student', 'teacher', 'admin');
    const childId = user.role === 'student' && !studentId ? user.id : studentId;
    const child = childId ? await store.user(childId) : null;
    const allowed = child && child.role === 'student' && (child.id === user.id || user.isAdmin || (user.role === 'teacher' && (await canSee(user, child.id))));
    if (!allowed) throw new AccountError('student', 'You can’t make a code for that student.', 404);
    if ((await store.countInvites({ createdBy: user.id, kind: 'parent', since: now() - DAY_MS })) >= PARENT_INVITES_A_DAY) {
      throw new AccountError('limit', 'That’s a lot of codes today. Try again tomorrow.', 429);
    }
    await store.revokeInvites({ createdBy: user.id, kind: 'parent', childId: child.id });
    return newInvite('parent', user, { childId: child.id });
  }

  // A code that makes a new teacher: from an admin, or from a teacher bringing in a colleague
  async function teacherInvite(user, body = {}) {
    need(user, 'teacher', 'admin');
    let schoolId = user.schoolId || null;
    if (user.isAdmin) schoolId = body.schoolId && (await store.school(body.schoolId)) ? body.schoolId : null;
    else {
      const open = await store.countInvites({ createdBy: user.id, kind: 'teacher', unused: true });
      const today = await store.countInvites({ createdBy: user.id, kind: 'teacher', since: now() - DAY_MS });
      if (open >= TEACHER_INVITES_OPEN || today >= TEACHER_INVITES_A_DAY) throw new AccountError('limit', 'You have lots of teacher codes waiting. Remove some, or wait for them to be used.', 429);
    }
    return newInvite('teacher', user, { schoolId });
  }

  // Invites someone made (never the codes themselves: only hashes are kept)
  async function inviteView(i) {
    const [usedBy, child, maker] = await Promise.all([i.usedBy && store.user(i.usedBy), i.childId && store.user(i.childId), store.user(i.createdBy)]);
    return {
      id: i.id,
      kind: i.kind,
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
      by: maker ? maker.name : null,
      child: child ? child.name : null,
      usedBy: usedBy ? usedBy.name : i.usedBy ? 'a deleted account' : null,
      usedAt: i.usedAt,
      expired: !i.usedAt && i.expiresAt <= now(),
    };
  }

  const myTeacherInvites = async (user) => ({
    invites: await Promise.all((await store.invitesBy(need(user, 'teacher', 'admin').id)).filter((i) => i.kind === 'teacher').map(inviteView)),
  });

  async function deleteMyInvite(user, id) {
    need(user);
    const i = await store.invite(id);
    if (!i || (i.createdBy !== user.id && !user.isAdmin)) throw new AccountError('invite', 'That isn’t one of your codes.', 404);
    await store.deleteInvite(id);
    audit('invite.deleted', user, { 'invite.id': id, 'invite.kind': i.kind });
    return { ok: true };
  }

  // Someone already playing or linked keeps their account as it is: a new role
  // needs a fresh one (a child's classes or grown-ups never move to a teacher)
  async function isFresh(user) {
    const [classesIn, children, parents] = await Promise.all([store.classesOfStudent(user.id), store.childrenOf(user.id), store.parentsOf(user.id)]);
    return !classesIn.length && !children.length && !parents.length;
  }

  // Uses an invite: { code }. Answers with the account as it is now.
  async function redeemInvite(user, body = {}, { only = null } = {}) {
    need(user);
    const notFound = () => new AccountError('code', 'That code doesn’t work. Check it, or ask for a new one.', 404);
    const invite = await store.inviteByHash(hashCode(body.code));
    if (!invite || invite.usedAt !== null || invite.expiresAt <= now() || (only && invite.kind !== only)) throw notFound();
    let role = user.role;
    if (invite.kind === 'teacher') {
      if (user.role === 'teacher') throw new AccountError('role', 'You’re a teacher already.', 409);
      if (user.role !== 'student' || !(await isFresh(user))) {
        throw new AccountError('role', 'This account is already a student or a grown-up. Sign in with another account to teach.', 409);
      }
      role = 'teacher';
    } else {
      if (invite.childId === user.id) throw new AccountError('role', 'That code is for a grown-up: give it to them.', 409);
      if (user.role === 'teacher') throw new AccountError('role', 'Teachers see their students in My classes. Use a separate account as a grown-up.', 409);
      if (user.role === 'student') {
        if (!(await isFresh(user))) throw new AccountError('role', 'This account plays in a class. Sign in with your own account to be a grown-up.', 409);
        role = 'parent';
      }
    }
    const used = await store.redeemInvite(invite.codeHash, user.id, now());
    if (!used) throw notFound(); // (someone else used it just now)
    if (role !== user.role) await store.setRole(user.id, role, { invitedBy: invite.createdBy });
    if (invite.kind === 'parent') await store.linkParent(user.id, invite.childId, now());
    const after = { ...(await store.user(user.id)), isAdmin: user.isAdmin };
    audit('invite.redeemed', after, { 'invite.id': invite.id, 'invite.kind': invite.kind, ...(role !== user.role ? { 'role.from': user.role } : {}) });
    const child = invite.childId ? await store.user(invite.childId) : null;
    return { user: await publicUser(after), ...(child ? { child: { id: child.id, name: child.name } } : {}) };
  }

  // ---- parents

  // A grown-up links a child with the code the child (or their teacher) made
  const linkChild = (user, body = {}) => redeemInvite(user, body, { only: 'parent' });

  async function unlinkChild(user, childId) {
    need(user, 'parent');
    await store.unlinkParent(user.id, childId);
    audit('parent.unlinked', user, { 'student.id': childId });
    return { ok: true };
  }

  // A child's grown-ups, for their teacher (to spot a wrong one) or an admin
  async function studentParents(user, studentId) {
    need(user, 'teacher', 'admin');
    if (!user.isAdmin && !(await canSee(user, studentId))) throw new AccountError('student', 'You can’t see that student.', 404);
    return { parents: (await store.parentsOf(studentId)).map((p) => ({ id: p.id, name: p.name })) };
  }

  async function removeStudentParent(user, studentId, parentId) {
    await studentParents(user, studentId);
    await store.unlinkParent(parentId, studentId);
    audit('parent.removed', user, { 'student.id': studentId, 'parent.id': parentId });
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
    return { ...(await studentStats(child)), facts, options: Progress.availableOptions(state) };
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

  // ---- admins

  // What an admin sees of an account: no more than the account holds (ADR-0004)
  const adminUser = (u) => ({ id: u.id, name: u.name, role: u.role, domain: u.domain, schoolId: u.schoolId, invitedBy: u.invitedBy, createdAt: u.createdAt, lastSeen: u.lastSeen });

  async function listUsers(user, query = {}) {
    need(user, 'admin');
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    const page = Math.max(0, Number(query.page) || 0);
    const role = ROLES.includes(query.role) ? query.role : null;
    const { users, total } = await store.listUsers({ q: String(query.q || '').slice(0, 40), role, limit, offset: page * limit });
    return { users: users.map(adminUser), total, page, limit };
  }

  // A teacher who still has classes or tournaments keeps the role until they're gone
  async function stillTeaching(id) {
    const [classesTaught, schedules] = await Promise.all([store.classesOfTeacher(id), store.schedulesOfTeacher(id)]);
    return classesTaught.length > 0 || schedules.length > 0;
  }

  async function setUserRole(user, id, body = {}) {
    need(user, 'admin');
    const target = await store.user(id);
    if (!target) throw new AccountError('user', 'No such account.', 404);
    if (!ROLES.includes(body.role)) throw new AccountError('role', 'Pick student, teacher or parent.');
    if (target.role === body.role) return { user: adminUser(target) };
    if (target.role === 'teacher' && (await stillTeaching(id))) throw new AccountError('role', 'This teacher still has classes or tournaments. Move or delete them first.', 409);
    await store.setRole(id, body.role, { invitedBy: user.id });
    audit('role.changed', user, { 'target.id': id, 'role.from': target.role, 'role.to': body.role });
    return { user: adminUser(await store.user(id)) };
  }

  async function deleteAccount(user, id, reason) {
    await store.deleteUser(id);
    recent.clear(); // (a cached sign-in mustn't bring it back for a minute)
    audit('user.deleted', user, { 'target.id': id, 'deletion.reason': reason });
    return { ok: true };
  }

  // Admins can remove any account (a school's or a family's request)
  async function adminDeleteUser(user, id) {
    need(user, 'admin');
    if (!(await store.user(id))) throw new AccountError('user', 'No such account.', 404);
    return deleteAccount(user, id, 'admin');
  }

  // Teachers and grown-ups can remove their own account (a teacher's classes go first)
  async function deleteMe(user) {
    need(user, 'teacher', 'parent');
    if (user.role === 'teacher' && (await stillTeaching(user.id))) throw new AccountError('role', 'Delete your classes and tournaments first.', 409);
    return deleteAccount(user, user.id, 'self');
  }

  // A child's grown-up can remove the child's account and everything in it
  async function deleteStudent(user, studentId) {
    need(user, 'parent', 'admin');
    const child = await store.user(studentId);
    if (!child || child.role !== 'student' || !(user.isAdmin || (await store.isParentOf(user.id, studentId)))) throw new AccountError('student', 'You can’t remove that account.', 404);
    return deleteAccount(user, studentId, user.isAdmin ? 'admin' : 'parent');
  }

  const adminInvites = async (user, query = {}) => ({
    invites: await Promise.all((await store.allInvites({ kind: query.kind === 'parent' ? 'parent' : 'teacher' })).map(inviteView)),
  });

  const listSchools = async (user) => (need(user, 'admin'), { schools: await store.schools() });

  async function addSchool(user, body = {}) {
    need(user, 'admin');
    const name = String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const domain = String(body.domain || '').trim().toLowerCase();
    if (!name || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) throw new AccountError('school', 'Give the school a name and its email domain, like iusd.org.');
    if (await store.schoolByDomain(domain)) throw new AccountError('school', 'A school already has that domain.', 409);
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || domain.replace(/\./g, '-');
    await store.addSchool({ id: (await store.school(id)) ? `${id}-${randomCode(4, () => false).toLowerCase()}` : id, name, domain });
    schoolsCache = null;
    audit('school.added', user, { 'school.domain': domain });
    return { school: await store.schoolByDomain(domain) };
  }

  // ---- what's kept, and for how long

  // Everything Blockout keeps about an account, as one JSON document: for the
  // person (or a child's grown-up) to download
  async function exportOf(id) {
    const u = await store.user(id);
    if (!u) throw new AccountError('user', 'No such account.', 404);
    const [saved, classesIn, classesTaught, children, parents, homeworkFor, invitesMade] = await Promise.all([
      store.getProgress(id),
      store.classesOfStudent(id),
      store.classesOfTeacher(id),
      store.childrenOf(id),
      store.parentsOf(id),
      store.assignmentsForStudent(id),
      store.invitesBy(id),
    ]);
    const school = u.schoolId ? await store.school(u.schoolId) : null;
    return {
      exportedAt: new Date(now()).toISOString(),
      account: { id: u.id, signInId: u.sub, role: u.role, firstName: u.firstName, lastInitial: u.lastInitial, emailDomain: u.domain, school: school ? school.name : null, invitedBy: u.invitedBy, createdAt: u.createdAt, lastSeen: u.lastSeen },
      progress: saved ? { savedAt: saved.updatedAt, data: saved.data } : null,
      classes: classesIn.map((c) => ({ name: c.name })),
      classesTaught: classesTaught.map((c) => ({ name: c.name, code: c.code, createdAt: c.createdAt })),
      children: children.map((c) => ({ name: c.name })),
      grownUps: parents.map((p) => ({ name: p.name })),
      homework: homeworkFor.map((a) => ({ goal: a.goal, due: a.due, createdAt: a.createdAt })),
      codesMade: invitesMade.map((i) => ({ kind: i.kind, createdAt: i.createdAt, expiresAt: i.expiresAt, used: Boolean(i.usedAt) })),
    };
  }

  async function exportMe(user) {
    need(user);
    audit('user.exported', user, { 'target.id': user.id });
    return exportOf(user.id);
  }

  async function exportStudent(user, studentId) {
    need(user, 'parent', 'admin');
    if (!user.isAdmin && !(await store.isParentOf(user.id, studentId))) throw new AccountError('student', 'You can’t see that student.', 404);
    audit('user.exported', user, { 'target.id': studentId });
    return exportOf(studentId);
  }

  // Accounts unused for retentionDays are deleted, with everything in them
  // (a daily job on one server). Returns how many went.
  async function deleteStale(retentionDays) {
    if (!retentionDays) return 0;
    const ids = await store.staleUsers(now() - retentionDays * DAY_MS, 500);
    for (const id of ids) {
      await store.deleteUser(id);
      log.info('user.expired', { 'target.id': id, 'retention.days': retentionDays });
    }
    if (ids.length) recent.clear();
    return ids.length;
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
    parentInvite,
    teacherInvite,
    myTeacherInvites,
    deleteMyInvite,
    redeemInvite,
    studentParents,
    removeStudentParent,
    listUsers,
    setUserRole,
    adminDeleteUser,
    deleteMe,
    deleteStudent,
    adminInvites,
    exportMe,
    exportStudent,
    deleteStale,
    listSchools,
    addSchool,
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

export { createAccounts, AccountError, day, normCode, hashCode };
