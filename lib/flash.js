/**
 * Express middleware that surfaces session-stored flash messages to views.
 *
 * Controllers set `req.session.flash = { type: 'success'|'error'|'info', message: '...' }`
 * before redirecting; the next request consumes and clears it so the message
 * appears once and only on the page the user lands on.
 *
 * @param {import('express').Request} req Incoming HTTP request.
 * @param {import('express').Response} res Outgoing HTTP response.
 * @param {import('express').NextFunction} next Express continuation callback.
 * @returns {void}
 */
function flashMiddleware(req, res, next) {
  const message = req.session?.flash || null;
  if (req.session) {
    delete req.session.flash;
  }
  res.locals.flash = message;
  next();
}

/**
 * Helper used by controllers: stores a flash payload on the session.
 *
 * @param {import('express').Request} req Incoming HTTP request.
 * @param {'success'|'error'|'info'} type Flash kind controlling colour.
 * @param {string} message Display message.
 */
function setFlash(req, type, message) {
  if (!req.session) return;
  req.session.flash = { type, message };
}

module.exports = { flashMiddleware, setFlash };
