/**
 * Normalizes arbitrary metadata into a compact log-safe payload.
 *
 * @param {unknown} meta Additional metadata to include in the log line.
 * @returns {Record<string, unknown>|undefined} Serializable log metadata.
 */
function normalizeMeta(meta) {
  if (!meta) {
    return undefined;
  }

  if (meta instanceof Error) {
    return {
      name: meta.name,
      message: meta.message,
      stack: meta.stack,
    };
  }

  if (typeof meta === 'object') {
    return meta;
  }

  return { value: meta };
}

/**
 * Writes a structured log line using a consistent timestamped format.
 *
 * @param {'INFO'|'WARN'|'ERROR'} level Severity level for the log line.
 * @param {string} message Human-readable event description.
 * @param {unknown} [meta] Optional structured metadata.
 * @returns {void}
 */
function writeLog(level, message, meta) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  const normalizedMeta = normalizeMeta(meta);
  if (normalizedMeta) {
    payload.meta = normalizedMeta;
  }

  const line = JSON.stringify(payload);
  if (level === 'ERROR') {
    console.error(line);
    return;
  }

  if (level === 'WARN') {
    console.warn(line);
    return;
  }

  console.log(line);
}

/**
 * Logs an informational event.
 *
 * @param {string} message Human-readable event description.
 * @param {unknown} [meta] Optional structured metadata.
 * @returns {void}
 */
function info(message, meta) {
  writeLog('INFO', message, meta);
}

/**
 * Logs a warning event.
 *
 * @param {string} message Human-readable event description.
 * @param {unknown} [meta] Optional structured metadata.
 * @returns {void}
 */
function warn(message, meta) {
  writeLog('WARN', message, meta);
}

/**
 * Logs an error event.
 *
 * @param {string} message Human-readable event description.
 * @param {unknown} [meta] Optional structured metadata or error instance.
 * @returns {void}
 */
function error(message, meta) {
  writeLog('ERROR', message, meta);
}

module.exports = {
  error,
  info,
  warn,
};
