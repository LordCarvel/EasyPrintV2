const UPDATE_CHECK_LOCKED_STATES = new Set(['downloading', 'downloaded', 'installing']);

function shouldSkipUpdateCheck(status = '', { scheduled = false } = {}) {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  return UPDATE_CHECK_LOCKED_STATES.has(normalizedStatus)
    || (scheduled && normalizedStatus === 'checking');
}

module.exports = { shouldSkipUpdateCheck };
