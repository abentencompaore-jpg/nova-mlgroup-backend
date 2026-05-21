// Stub OpenTelemetry complet — Hermes ne supporte pas les dynamic imports
const noop = () => {};
const noopSpan = {
  end: noop, setAttribute: noop, setStatus: noop,
  recordException: noop, isRecording: () => false,
  spanContext: () => ({ traceId: '', spanId: '', traceFlags: 0 }),
};
const noopTracer = {
  startSpan: () => noopSpan,
  startActiveSpan: (name, opts, ctx, fn) => {
    const f = typeof opts === 'function' ? opts
            : typeof ctx  === 'function' ? ctx : fn;
    return f ? f(noopSpan) : noopSpan;
  },
};
module.exports = {
  trace:       { getTracer: () => noopTracer, getActiveSpan: () => noopSpan },
  context:     { active: () => ({}), with: (_c, fn) => fn(), bind: (_c, fn) => fn },
  propagation: { inject: noop, extract: (c) => c, fields: () => [] },
  diag:        { debug: noop, info: noop, warn: noop, error: noop, verbose: noop },
  SpanStatusCode: { OK: 1, ERROR: 2, UNSET: 0 },
  SpanKind:    { INTERNAL: 0, SERVER: 1, CLIENT: 2 },
  default:     {},
};
