import test from 'node:test';
import assert from 'node:assert';
import { createMetrics } from '../src/metrics.js';

test('metrics: counters, histograms and gauges in Prometheus text format', () => {
  const m = createMetrics();
  const requests = m.counter('http_requests_total', 'HTTP requests', ['route', 'status']);
  requests.inc({ route: '/api/me', status: 200 });
  requests.inc({ route: '/api/me', status: 200 });
  requests.inc({ route: '/api/rooms/:code/join', status: 404 });
  const time = m.histogram('http_request_duration_seconds', 'Time to answer', ['route'], [0.1, 1]);
  time.observe({ route: '/api/me' }, 0.05);
  time.observe({ route: '/api/me' }, 0.5);
  m.gauge('streams', 'Open event streams', () => 3);
  m.gauge('rooms', 'Rooms', () => [{ labels: { owned: 'yes' }, value: 2 }], ['owned']);
  const text = m.render();
  assert.match(text, /# TYPE blockout_http_requests_total counter/);
  assert.match(text, /blockout_http_requests_total\{route="\/api\/me",status="200"\} 2/);
  assert.match(text, /blockout_http_requests_total\{route="\/api\/rooms\/:code\/join",status="404"\} 1/);
  assert.match(text, /blockout_http_request_duration_seconds_bucket\{route="\/api\/me",le="0.1"\} 1/);
  assert.match(text, /blockout_http_request_duration_seconds_bucket\{route="\/api\/me",le="1"\} 2/);
  assert.match(text, /blockout_http_request_duration_seconds_bucket\{route="\/api\/me",le="\+Inf"\} 2/);
  assert.match(text, /blockout_http_request_duration_seconds_count\{route="\/api\/me"\} 2/);
  assert.match(text, /blockout_streams 3/);
  assert.match(text, /blockout_rooms\{owned="yes"\} 2/);
  assert.ok(text.endsWith('\n'));
});

test('metrics: label values are escaped', () => {
  const m = createMetrics();
  m.counter('x_total', 'x', ['a']).inc({ a: 'say "hi"\\\n' });
  assert.match(m.render(), /x_total\{a="say \\"hi\\"\\\\\\n"\} 1/);
});
