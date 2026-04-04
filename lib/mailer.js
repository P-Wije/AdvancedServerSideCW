const nodemailer = require('nodemailer');
const config = require('./config');

let transporter;

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

async function sendMail({ to, subject, html, text }) {
  const info = await getTransporter().sendMail({
    from: config.smtp.from,
    to,
    subject,
    html,
    text,
  });

  if (info.message) {
    console.log('Mail preview:', info.message.toString());
  }

  return info;
}

module.exports = {
  sendMail,
};
