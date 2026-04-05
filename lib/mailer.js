const nodemailer = require('nodemailer');
const config = require('./config');
const logger = require('./logger');

let transporter;

/**
 * Lazily creates and reuses the configured mail transport.
 *
 * @returns {import('nodemailer').Transporter} Nodemailer transport instance.
 */
function getTransporter() {
  if (transporter) {
    return transporter;
  }

  if (config.smtp.host && config.smtp.user) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });
    return transporter;
  }

  transporter = nodemailer.createTransport({
    jsonTransport: true,
  });
  return transporter;
}

/**
 * Sends an application email through SMTP or the local JSON preview transport.
 *
 * @param {{to: string, subject: string, html?: string, text?: string}} mailOptions Outgoing message payload.
 * @returns {Promise<import('nodemailer/lib/smtp-transport').SentMessageInfo>} Mail delivery result.
 */
async function sendMail({ to, subject, html, text }) {
  const info = await getTransporter().sendMail({
    from: config.smtp.from,
    to,
    subject,
    html,
    text,
  });

  if (info.message) {
    logger.info('Generated local mail preview.', {
      to,
      subject,
      preview: info.message.toString(),
    });
  } else {
    logger.info('Mail dispatched through configured transport.', { to, subject });
  }

  return info;
}

module.exports = {
  sendMail,
};
