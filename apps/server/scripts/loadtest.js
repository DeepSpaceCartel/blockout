#!/usr/bin/env node
// A load test for live classes: CLASSES classes of STUDENTS students each. A
// teacher hosts each class, the students join as guests and keep an event
// stream open, and every round each student answers; the teacher rolls the next
// round when everyone has. It reports how long a new roll takes to reach every
// student (from the teacher's request to the last student's stream), and errors.
//
//   node apps/server/scripts/loadtest.js https://blockout.example.org --classes 30 --students 30 --rounds 10
//
// Hosting needs a teacher: with dev sign-in the script makes one; with Keycloak,
// pass a teacher's access token in TEACHER_TOKEN. Each class sends its own
// X-Forwarded-For (as a school would have its own address); the server only
// believes it with TRUST_PROXY, so run the target with TRUST_PROXY=1.
import { performance } from 'node:perf_hooks';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? def : Number(args[i + 1]);
};
const BASE = (args.find((a) => /^https?:/.test(a)) || 'http://localhost:8080').replace(/\/$/, '');
const CLASSES = opt('classes', 5);
const STUDENTS = opt('students', 25);
const ROUNDS = opt('rounds', 5);

const errors = new Map(); // what -> count
const fail = (what) => errors.set(what, (errors.get(what) || 0) + 1);
const latencies = []; // ms from "next round" to the last student seeing it

async function call(method, path, body, { token, ip } = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(ip ? { 'X-Forwarded-For': ip } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data;
    if (res.status === 503 || res.status === 429) {
      fail(`${method} ${path.replace(/\/[A-Z0-9]{4}\//, '/:code/')} ${res.status} (retried)`);
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      continue;
    }
    throw new Error(`${method} ${path}: ${res.status} ${data.message || ''}`);
  }
  throw new Error(`${method} ${path}: gave up`);
}

// An event stream read with fetch: calls onView(view) for every view
function stream(path, ip, onView) {
  const ctl = new AbortController();
  (async () => {
    try {
      const res = await fetch(BASE + path, { headers: { 'X-Forwarded-For': ip }, signal: ctl.signal });
      if (!res.ok) return fail(`stream ${res.status}`);
      const dec = new TextDecoder();
      let buf = '';
      for await (const chunk of res.body) {
        buf += dec.decode(chunk, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const name = /^event: (.*)$/m.exec(block);
          const data = /^data: (.*)$/m.exec(block);
          if (name && name[1] === 'view' && data) onView(JSON.parse(data[1]));
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') fail(`stream ${e.message}`);
    }
  })();
  return () => ctl.abort();
}

async function runClass(n, teacherToken) {
  const ip = `198.51.100.${n + 1}`; // (a documentation address range: one per "school")
  const { code, teacherKey } = await call('POST', '/api/rooms', { settings: { type: 'class', rounds: Math.max(ROUNDS, 10) } }, { token: teacherToken, ip });
  const students = [];
  for (let s = 0; s < STUDENTS; s++) {
    const me = await call('POST', `/api/rooms/${code}/join`, { name: `Kid${s}` }, { ip });
    students.push({ ...me, round: 0, seen: null });
  }
  // every student listens; a round "arrives" when its view shows the new round number
  let waiting = null; // { round, left, t0, done }
  const closers = students.map((st) =>
    stream(`/api/rooms/${code}/events?id=${st.id}&key=${st.key}`, ip, (view) => {
      const round = view.round ?? (view.game && view.game.round);
      if (typeof round !== 'number' || round === st.round) return;
      st.round = round;
      st.view = view;
      if (waiting && round >= waiting.round && !st.counted) {
        st.counted = true;
        if (--waiting.left === 0) waiting.done(performance.now() - waiting.t0);
      }
    })
  );
  await new Promise((r) => setTimeout(r, 1000)); // (streams open)
  const arrive = (round, fire) =>
    new Promise((resolve) => {
      for (const st of students) st.counted = st.round >= round;
      const left = students.filter((st) => !st.counted).length;
      waiting = { round, left, t0: performance.now(), done: resolve };
      if (!left) resolve(0);
      fire();
      setTimeout(() => resolve(null), 15000); // (counted as lost below)
    });
  for (let round = 1; round <= ROUNDS; round++) {
    const ms = await arrive(round, () => call('POST', `/api/rooms/${code}/teacher`, { key: teacherKey, action: round === 1 ? 'start' : 'next' }, { ip }).catch((e) => fail(e.message)));
    if (ms === null) fail('a roll never reached every student (15 s)');
    else latencies.push(ms);
    // everyone answers (a timeout answer: no board logic needed)
    await Promise.all(students.map((st) => call('POST', `/api/rooms/${code}/result`, { id: st.id, key: st.key, round, kind: 'timeout' }, { ip }).catch((e) => fail(e.message))));
  }
  await call('POST', `/api/rooms/${code}/teacher`, { key: teacherKey, action: 'close' }, { ip }).catch(() => {});
  closers.forEach((close) => close());
}

const pct = (list, p) => {
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]);
};

async function main() {
  let token = process.env.TEACHER_TOKEN;
  if (!token) token = (await call('POST', '/api/auth/dev', { role: 'teacher', firstName: 'Load', lastInitial: 'T' }, { ip: '198.51.100.250' })).token;
  console.log(`${CLASSES} classes × ${STUDENTS} students, ${ROUNDS} rounds, against ${BASE}`);
  const t0 = performance.now();
  const results = await Promise.allSettled(Array.from({ length: CLASSES }, (_, n) => runClass(n, token)));
  for (const r of results) if (r.status === 'rejected') fail(`class: ${r.reason.message}`);
  const report = {
    seconds: Math.round((performance.now() - t0) / 1000),
    streams: CLASSES * STUDENTS,
    rounds: latencies.length,
    rollToEveryStudentMs: { p50: pct(latencies, 50), p95: pct(latencies, 95), max: pct(latencies, 100) },
    errors: Object.fromEntries(errors),
  };
  console.log(JSON.stringify(report, null, 2));
  const failedClasses = results.filter((r) => r.status === 'rejected').length;
  process.exit(failedClasses || errors.has('a roll never reached every student (15 s)') ? 1 : 0);
}

main();
