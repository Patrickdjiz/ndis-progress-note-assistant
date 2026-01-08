// backend/mailer.js 
const postmark = require("postmark");

const TOKEN = process.env.POSTMARK_SERVER_TOKEN;

// defaults
const DEFAULT_FROM = process.env.MAIL_FROM || "no-reply@ndisnotes.com";
const DEFAULT_REPLY_TO = process.env.MAIL_REPLY_TO || "support@ndisnotes.com";
const DEFAULT_STREAM = process.env.POSTMARK_MESSAGE_STREAM || "outbound"; // transactional

let client = null;
function getClient() {
  if (!TOKEN) return null;
  if (!client) client = new postmark.ServerClient(TOKEN);
  return client;
}

async function sendMail({ to, subject, text, html, from, replyTo, messageStream }) {
  const c = getClient();

  // Dev fallback: don’t break local testing
  if (!c) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[DEV EMAIL]", { to, subject, text });
      return;
    }
    throw new Error("POSTMARK_SERVER_TOKEN missing in production");
  }

  return c.sendEmail({
    From: from || DEFAULT_FROM,
    To: to,
    Subject: subject,
    TextBody: text,
    HtmlBody: html,
    ReplyTo: replyTo || DEFAULT_REPLY_TO,
    MessageStream: messageStream || DEFAULT_STREAM,
  });
}

module.exports = { sendMail };
