const mailer = require('./mailer');
const { db } = require('./db');
const { SESSION_LENGTH } = require('./access');
const { expireOrders } = require('./marketplace');
const { notifyShortfalls } = require('./routes/labourRoutes');
const { expireNegotiations } = require('./routes/produceRoutes');

function emailWorker() {
  if (mailer.emailMode() === 'off') return null;
  return async () => {
    const now = new Date();
    const due = { emailedAt: null, emailAttempts: { lt: 5 },
      OR: [{ emailNextAttemptAt: null }, { emailNextAttemptAt: { lte: now } }],
    };
    const notifications = await db.notification.findMany({ where: due, orderBy: { createdAt: 'asc' }, take: 20 });
    for (const item of notifications) {
      const claimed = await db.notification.updateMany({
        where: { ...due, id: item.id, emailAttempts: item.emailAttempts },
        data: { emailAttempts: { increment: 1 }, emailNextAttemptAt: new Date(Date.now() + (item.emailAttempts + 1) * 60000) },
      });
      if (!claimed.count) continue;
      try {
        const user = await db.user.findFirst({ where: { id: item.userId, active: true, deletedAt: null }, select: { email: true } });
        if (user) await mailer.sendMail({
          to: user.email, subject: 'AgriConnect notification',
          text: item.message, messageId: '<agriconnect-' + item.id + '@notifications.agriconnect>',
        });
        await db.notification.update({ where: { id: item.id }, data: { emailedAt: new Date() } });
      } catch (error) {
        console.warn('Notification email failed', item.id, mailer.emailError(error));
      }
    }
  };
}

function schedule(label, task, interval) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await task();
    } catch (error) {
      console.error('Background task failed', label, error.code || error.name);
    } finally {
      running = false;
    }
  };
  setInterval(tick, interval).unref();
  void tick();
}

function startBackgroundJobs() {
  schedule('marketplace holds', expireOrders, 15_000);
  schedule('labour shortfalls', notifyShortfalls, 30_000);
  schedule('produce offers', expireNegotiations, 30_000);
  schedule('sessions', () => db.session.deleteMany({ where: {
    lastActiveAt: { lte: new Date(Date.now() - SESSION_LENGTH) },
  } }), 60_000);
  schedule('expired password reset links', () => db.passwordReset.deleteMany({ where: { expiresAt: { lte: new Date() } } }), 60_000);
  const email = emailWorker();
  if (email) schedule('email', email, 30_000);
}

module.exports = { startBackgroundJobs };
