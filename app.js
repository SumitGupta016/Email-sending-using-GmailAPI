const fs = require("fs").promises;
const path = require("path");
const process = require("process");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");

const SCOPES = ["https://mail.google.com/"];
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

async function checkAndReplyEmails(auth) {
  const gmail = google.gmail({ version: "v1", auth });

  // Checking for new emails
  const response = await gmail.users.messages.list({
    userId: "me",
    q: "is:unread",
  });

  const messages = response.data.messages;
  if (!messages) {
    console.log("No new emails.");
    return;
  }

  for (const message of messages) {
    const email = await gmail.users.messages.get({
      userId: "me",
      id: message.id,
    });

    const threadId = email.data.threadId;
    const replyHistory = await gmail.users.messages.list({
      userId: "me",
      q: `in:inbox thread:${threadId} -from:me`,
    });

    if (!replyHistory.data.messages) {
      // Sending reply
      const mailOptions = {
        userId: "me",
        resource: {
          threadId: threadId,
          raw: Buffer.from(
            `From: "Sumit" <sg20924@gmail.com>\n` +
              `To: ${
                email.data.payload.headers.find(
                  (header) => header.name === "From"
                ).value
              }\n` +
              `Subject: RE: ${
                email.data.payload.headers.find(
                  (header) => header.name === "Subject"
                ).value
              }\n` +
              `Content-Type: text/plain; charset=utf-8\n` +
              `\n` +
              `Sorry I'm on a vacation ! I will contact you as soon as possible.`
          ).toString("base64"),
        },
      };

      await gmail.users.messages.send(mailOptions);
      console.log(`Reply sent to thread ${threadId}`);

      // Applying label
      const labelOptions = {
        userId: "me",
        id: threadId,
        resource: {
          addLabelIds: ["Label_1"],
        },
      };

      await gmail.users.threads.modify(labelOptions);
      console.log(`Label applied to thread ${threadId}: Label_1`);
    }
  }
}

async function run() {
  try {
    const client = await authorize();
    await checkAndReplyEmails(client);
  } catch (error) {
    console.error(error);
  }
}

run();
