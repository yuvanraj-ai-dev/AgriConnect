const nodemailer = require('nodemailer');

let transport;

function emailMode() {
  const host = process.env.SMTP_HOST?.trim().toLowerCase();
  if (!host || !process.env.SMTP_FROM?.trim()) return 'off';
  return ['sandbox.smtp.mailtrap.io', 'smtp.mailtrap.io', 'smtp.mailtrap.pro'].includes(host) ? 'sandbox' : 'live';
}

function sendMail({ to, ...message }) {
  if (!transport) {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;
    const port = Number(SMTP_PORT || 587);
    const secure = SMTP_SECURE === 'true' || port === 465;
    transport = nodemailer.createTransport({
      host: SMTP_HOST.trim(), port, secure, requireTLS: !secure,
      auth: SMTP_USER ? { user: SMTP_USER.trim(), pass: SMTP_PASS } : undefined,
      connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000,
    });
  }
  return transport.sendMail({ ...message, from: process.env.SMTP_FROM.trim(), to: { address: to.trim(), name: '' } });
}

function emailError(error) {
  return {
    code: /^[A-Z][A-Z_0-9]{1,24}$/.test(error.code || '') ? error.code : 'EMAIL_ERROR',
    responseCode: Number.isInteger(error.responseCode) ? error.responseCode : undefined,
    command: ['CONN', 'EHLO', 'STARTTLS', 'AUTH', 'MAIL FROM', 'RCPT TO', 'DATA'].includes(error.command) ? error.command : undefined,
  };
}

module.exports = { emailMode, sendMail, emailError };
