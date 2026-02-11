const nodemailer = require('nodemailer');
const providers = require('./providers.json');
const { decrypt } = require('../services/crypto');

function createTransport(user) {
  const password = decrypt(user.smtp_password_encrypted);
  if (!password) {
    throw new Error('No SMTP password configured for this user');
  }

  const provider = providers[user.smtp_provider];
  const host = user.smtp_host || (provider && provider.host);
  const port = user.smtp_port || (provider && provider.port);
  const secure = provider ? provider.secure : (port === 465);

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: user.smtp_email,
      pass: password,
    },
    tls: {
      rejectUnauthorized: true,
    },
  });
}

async function testConnection(user) {
  const transport = createTransport(user);
  try {
    await transport.verify();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    transport.close();
  }
}

module.exports = { createTransport, testConnection };
