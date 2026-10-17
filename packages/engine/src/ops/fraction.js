// Exact fractions for the prototypes. Always stored reduced, with a positive denominator.

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

const lcm = (a, b) => (a / gcd(a, b)) * b;

function F(n, d = 1) {
  if (!Number.isInteger(n) || !Number.isInteger(d) || d === 0) throw new Error(`Bad fraction ${n}/${d}`);
  if (d < 0) [n, d] = [-n, -d];
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

const add = (x, y) => F(x.n * y.d + y.n * x.d, x.d * y.d);
const sub = (x, y) => F(x.n * y.d - y.n * x.d, x.d * y.d);
const mul = (x, y) => F(x.n * y.n, x.d * y.d);
const div = (x, y) => F(x.n * y.d, x.d * y.n);
const cmp = (x, y) => x.n * y.d - y.n * x.d;
const eq = (x, y) => cmp(x, y) === 0;
const ZERO = F(0);
const ONE = F(1);

// How many 1/units a fraction is (e.g. 3/4 of 24 units = 18). Must come out whole.
function toUnits(x, units) {
  const u = (x.n * units) / x.d;
  if (!Number.isInteger(u)) throw new Error(`${str(x)} is not a whole number of 1/${units}`);
  return u;
}

// "3/4", "2", "-1/2"
function str(x) {
  return x.d === 1 ? String(x.n) : `${x.n}/${x.d}`;
}

// "2 3/4" for scores; "3/4" and "2" as usual
function mixed(x) {
  if (x.d === 1 || Math.abs(x.n) < x.d) return str(x);
  const whole = Math.trunc(x.n / x.d);
  const rest = Math.abs(x.n - whole * x.d);
  return `${whole} ${rest}/${x.d}`;
}

// What a child typed: numerator and (optional) denominator strings, unreduced.
// Returns { value, simplest } or null when it isn't a number.
function parseAnswer(num, den) {
  if (!/^\d+$/.test(num)) return null;
  if (den !== '' && den != null && !/^\d+$/.test(den)) return null;
  const n = Number(num);
  const d = den === '' || den == null ? 1 : Number(den);
  if (d === 0) return null;
  const value = F(n, d);
  return { value, simplest: value.n === n && value.d === d };
}

export {
  gcd,
  lcm,
  F,
  add,
  sub,
  mul,
  div,
  cmp,
  eq,
  ZERO,
  ONE,
  toUnits,
  str,
  mixed,
  parseAnswer,
};
