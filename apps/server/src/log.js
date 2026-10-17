// Structured logs: one JSON object per line, with OpenTelemetry's field names
// (https://opentelemetry.io/docs/specs/otel/logs/data-model/), so a log stack can
// index them without parsing text. Every record is a named event with
// attributes; no free-text messages to grep through.
//
// Never log tokens, keys, codes or children's names: callers pass ids, routes
// and counts only. `redact` is a last line of defence for attribute names that
// look secret.
//
//   const log = createLogger({ format: 'json' });
//   log.info('class.created', { 'user.id': teacher.id, 'class.id': c.id });

const LEVELS = { debug: 5, info: 9, warn: 13, error: 17, silent: Infinity }; // OTel severity numbers
const SECRET = /token|key|code|secret|password|authorization|cookie|name/i;

function redact(attrs) {
  const out = {};
  for (const [k, v] of Object.entries(attrs || {})) {
    // ids, routes and counts are fine; anything named like a secret or a name is not
    const allowed = /\.(id|route|method|status_code|type|kind|role|count|ms)$|^(duration_ms|exception\.(type|message|stacktrace)|http\.|url\.scheme|signal)/.test(k);
    out[k] = !allowed && SECRET.test(k) ? '[redacted]' : v;
  }
  return out;
}

function createLogger({ level = 'info', format = 'json', service = 'blockout', version = '', write = (line) => process.stdout.write(`${line}\n`), now = () => new Date() } = {}) {
  const min = LEVELS[level] ?? LEVELS.info;
  function emit(severity, event, attrs = {}) {
    if (LEVELS[severity] < min) return;
    const record = {
      timestamp: now().toISOString(),
      severity_text: severity.toUpperCase(),
      severity_number: LEVELS[severity],
      'event.name': event,
      'service.name': service,
      ...(version ? { 'service.version': version } : {}),
      ...redact(attrs),
    };
    if (format === 'json') return write(JSON.stringify(record));
    // text, for a person at a terminal: "INFO class.created user.id=… class.id=…"
    const rest = Object.entries(redact(attrs))
      .filter(([k]) => k !== 'exception.stacktrace')
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(' ');
    write(`${record.severity_text.padEnd(5)} ${event}${rest ? ` ${rest}` : ''}${attrs['exception.stacktrace'] ? `\n${attrs['exception.stacktrace']}` : ''}`);
  }
  return {
    debug: (event, attrs) => emit('debug', event, attrs),
    info: (event, attrs) => emit('info', event, attrs),
    warn: (event, attrs) => emit('warn', event, attrs),
    error: (event, attrs) => emit('error', event, attrs),
  };
}

// An error as OTel exception attributes
const exception = (e) => ({ 'exception.type': (e && e.name) || 'Error', 'exception.message': String((e && e.message) || e), 'exception.stacktrace': (e && e.stack) || '' });

const silentLogger = createLogger({ level: 'silent' });

export { createLogger, exception, redact, silentLogger, LEVELS };
