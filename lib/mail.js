// 发邮件：配置了 SMTP_HOST 就用 SMTP；没配置时（本地开发、测试）放进 outbox 并打印到控制台
const outbox = [];
let transport = null;

const configured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

async function send({ to, subject, text, html }) {
  const from = process.env.MAIL_FROM || 'KaleidoQuest <noreply@visionchinese.com>';
  if (!configured()) {
    outbox.push({ from, to, subject, text });
    if (process.env.NODE_ENV !== 'test') console.log(`[mail:dev] to=${to} subject=${subject}\n${text}`);
    return;
  }
  if (!transport) {
    const nodemailer = require('nodemailer');
    const port = +process.env.SMTP_PORT || 587;
    transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
  }
  await transport.sendMail({ from, to, subject, text, html });
}

module.exports = { send, configured, outbox };
