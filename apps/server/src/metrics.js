// Prometheus metrics in the text exposition format, built by hand (no
// dependency): counters and histograms with labels, and gauges read when
// scraped. Pure apart from what the gauges read.
//
//   const m = createMetrics();
//   const requests = m.counter('http_requests_total', 'HTTP requests', ['route', 'status']);
//   requests.inc({ route: '/api/me', status: 200 });
//   m.render()  // the text Prometheus scrapes
//
// Label values must stay few (routes as patterns, never paths with codes in them).

const esc = (v) => String(v).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
const labelText = (names, values) => (names.length ? `{${names.map((n, i) => `${n}="${esc(values[i])}"`).join(',')}}` : '');

function createMetrics({ prefix = 'blockout_' } = {}) {
  const all = [];

  function counter(name, help, labels = []) {
    const series = new Map(); // label values joined -> { values, n }
    const m = {
      inc(by = {}, n = 1) {
        const values = labels.map((l) => by[l] ?? '');
        const key = values.join('\u0000');
        if (!series.has(key)) series.set(key, { values, n: 0 });
        series.get(key).n += n;
      },
      render: () => [`# HELP ${prefix}${name} ${help}`, `# TYPE ${prefix}${name} counter`, ...[...series.values()].map((s) => `${prefix}${name}${labelText(labels, s.values)} ${s.n}`)],
    };
    all.push(m);
    return m;
  }

  // Seconds, in Prometheus's usual buckets for a web request
  function histogram(name, help, labels = [], buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]) {
    const series = new Map();
    const m = {
      observe(by = {}, value) {
        const values = labels.map((l) => by[l] ?? '');
        const key = values.join('\u0000');
        if (!series.has(key)) series.set(key, { values, counts: buckets.map(() => 0), sum: 0, n: 0 });
        const s = series.get(key);
        buckets.forEach((b, i) => value <= b && s.counts[i]++);
        s.sum += value;
        s.n++;
      },
      render: () => [
        `# HELP ${prefix}${name} ${help}`,
        `# TYPE ${prefix}${name} histogram`,
        ...[...series.values()].flatMap((s) => [
          ...buckets.map((b, i) => `${prefix}${name}_bucket${labelText([...labels, 'le'], [...s.values, b])} ${s.counts[i]}`),
          `${prefix}${name}_bucket${labelText([...labels, 'le'], [...s.values, '+Inf'])} ${s.n}`,
          `${prefix}${name}_sum${labelText(labels, s.values)} ${s.sum}`,
          `${prefix}${name}_count${labelText(labels, s.values)} ${s.n}`,
        ]),
      ],
    };
    all.push(m);
    return m;
  }

  // read() -> a number, or [{ labels: {…}, value }]
  function gauge(name, help, read, labels = []) {
    all.push({
      render: () => {
        const got = read();
        const rows = Array.isArray(got) ? got : [{ labels: {}, value: got }];
        return [`# HELP ${prefix}${name} ${help}`, `# TYPE ${prefix}${name} gauge`, ...rows.map((r) => `${prefix}${name}${labelText(labels, labels.map((l) => r.labels[l] ?? ''))} ${Number(r.value) || 0}`)];
      },
    });
  }

  const render = () => `${all.flatMap((m) => m.render()).join('\n')}\n`;
  return { counter, histogram, gauge, render };
}

export { createMetrics };
