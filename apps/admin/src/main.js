// The admin page: find accounts and change their role or delete them, make
// teacher codes, add schools. The server checks every request (only accounts
// with the Keycloak realm role admin get through); this page just shows what
// it answers. Everything is built with textContent: names come from people.
import '@blockout/ui/css/tokens.css';
import '@blockout/ui/css/base.css';
import './admin.css';
import * as Auth from '@blockout/auth';

const $ = (id) => document.getElementById(id);
const ROLES = { student: '🎒 Student', teacher: '🍎 Teacher', parent: '👪 Parent' };
const PAGE = 50;

function make(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function button(text, cls, onClick) {
  const b = make('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}
const day = (t) => (t ? new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

function showError(err) {
  $('admin-error').textContent = err ? err.message : '';
  $('admin-error').hidden = !err;
}
// Every action: clear the last error, show a new one
const act = (fn) => async (...args) => {
  showError(null);
  try {
    await fn(...args);
  } catch (err) {
    showError(err);
  }
};

function table(id, head, rows) {
  const t = $(id);
  t.replaceChildren();
  const tr = make('tr');
  for (const h of head) tr.append(make('th', null, h));
  const thead = make('thead');
  thead.append(tr);
  const tbody = make('tbody');
  for (const cells of rows) {
    const row = make('tr');
    for (const c of cells) {
      const td = make('td');
      td.append(c instanceof Node ? c : document.createTextNode(c ?? '—'));
      row.append(td);
    }
    tbody.append(row);
  }
  if (!rows.length) {
    const row = make('tr');
    const td = make('td', 'admin-empty', 'Nothing here.');
    td.colSpan = head.length;
    row.append(td);
    tbody.append(row);
  }
  t.append(thead, tbody);
}

// ---- accounts

let page = 0;

async function loadUsers() {
  const q = new URLSearchParams({ q: $('user-q').value.trim(), page: String(page), limit: String(PAGE) });
  if ($('user-role').value) q.set('role', $('user-role').value);
  const { users, total } = await Auth.api('GET', `/api/admin/users?${q}`);
  const me = Auth.user();
  table(
    'user-table',
    ['Name', 'Role', 'Email domain', 'Joined', 'Last seen', ''],
    users.map((u) => {
      const role = make('select');
      for (const [value, label] of Object.entries(ROLES)) role.append(new Option(label, value, false, value === u.role));
      role.setAttribute('aria-label', `${u.name}'s role`);
      role.addEventListener(
        'change',
        act(async () => {
          try {
            await Auth.api('PUT', `/api/admin/users/${u.id}/role`, { role: role.value });
          } finally {
            await loadUsers();
          }
        })
      );
      const remove =
        u.id === me.id
          ? make('span', 'admin-small', 'you')
          : button(
              'Delete',
              'btn btn-small btn-danger',
              act(async () => {
                const typed = prompt(`Delete ${u.name}'s account and everything in it (progress, classes they teach, homework, links)? This can't be undone. Type DELETE to go ahead.`);
                if (!typed || typed.trim() !== 'DELETE') return;
                await Auth.api('DELETE', `/api/admin/users/${u.id}`);
                await loadUsers();
              })
            );
      return [u.name, role, u.domain, day(u.createdAt), day(u.lastSeen), remove];
    })
  );
  const pages = $('user-pages');
  pages.replaceChildren(make('span', 'admin-small', `${total} account${total === 1 ? '' : 's'}`));
  if (page > 0) pages.append(button('← Newer', 'btn btn-small', act(() => ((page -= 1), loadUsers()))));
  if ((page + 1) * PAGE < total) pages.append(button('Older →', 'btn btn-small', act(() => ((page += 1), loadUsers()))));
}

// ---- teacher codes

async function loadSchools() {
  const { schools } = await Auth.api('GET', '/api/admin/schools');
  table('school-table', ['School', 'Email domain'], schools.map((s) => [s.name, `@${s.domain}`]));
  const pick = $('code-school');
  pick.replaceChildren(new Option('Any school (or none)', ''));
  for (const s of schools) pick.append(new Option(`For ${s.name}`, s.id));
}

async function loadCodes() {
  const { invites } = await Auth.api('GET', '/api/admin/invites?kind=teacher');
  table(
    'code-table',
    ['Made', 'By', 'Used by', 'Until', ''],
    invites.map((i) => [
      day(i.createdAt),
      i.by,
      i.usedBy ? `${i.usedBy} (${day(i.usedAt)})` : i.expired ? 'expired' : 'not yet',
      day(i.expiresAt),
      i.usedAt
        ? ''
        : button(
            'Remove',
            'btn btn-small',
            act(async () => {
              await Auth.api('DELETE', `/api/me/invites/${i.id}`);
              await loadCodes();
            })
          ),
    ])
  );
}

function showCode(invite) {
  const link = `${location.origin}/#code=${invite.code}`;
  const box = make('div', 'admin-code');
  box.append(
    make('strong', 'admin-code-text', invite.code.replace(/(.{4})/, '$1 ')),
    make('span', 'admin-small', `Works once, until ${day(invite.expiresAt)}. Send it to one teacher, or this link:`),
    make('code', null, link)
  );
  $('code-made').replaceChildren(box);
}

// ---- start

function tab(name) {
  for (const b of document.querySelectorAll('[data-tab]')) b.classList.toggle('btn-primary', b.dataset.tab === name);
  for (const t of ['accounts', 'codes', 'schools']) $(`tab-${t}`).hidden = t !== name;
  showError(null);
}

async function start() {
  const gate = (text) => {
    $('admin-gate').textContent = text;
    $('admin-gate').hidden = false;
  };
  if (!Auth.signedIn()) return gate('Sign in on the Blockout page first, then come back here.');
  let me;
  try {
    me = await Auth.refreshUser();
  } catch (err) {
    return gate(err.message);
  }
  if (!me) return gate('Sign in on the Blockout page first, then come back here.');
  $('admin-who').textContent = `Signed in as ${me.name}`;
  if (!me.isAdmin) return gate('Admins only. An admin is an account with the admin role in Keycloak.');
  $('admin-app').hidden = false;
  for (const b of document.querySelectorAll('[data-tab]')) b.addEventListener('click', () => tab(b.dataset.tab));
  $('user-search').addEventListener('submit', (e) => {
    e.preventDefault();
    page = 0;
    act(loadUsers)();
  });
  $('user-role').addEventListener('change', () => ((page = 0), act(loadUsers)()));
  $('code-form').addEventListener(
    'submit',
    act(async (e) => {
      e.preventDefault();
      showCode(await Auth.api('POST', '/api/admin/invites', { schoolId: $('code-school').value || null }));
      await loadCodes();
    })
  );
  $('school-form').addEventListener(
    'submit',
    act(async (e) => {
      e.preventDefault();
      await Auth.api('POST', '/api/admin/schools', { name: $('school-name').value, domain: $('school-domain').value });
      $('school-name').value = $('school-domain').value = '';
      await loadSchools();
    })
  );
  await act(async () => Promise.all([loadUsers(), loadSchools(), loadCodes()]))();
}

start();
