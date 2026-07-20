const fs = require("fs");
const crypto = require("crypto");
const dotenv = require("dotenv");
const readline = require("readline/promises");

async function promptForPassword() {
  if (!process.stdin.isTTY) {
    throw new Error(
      "Cannot prompt for secrets password without a TTY. Set ENCRYPTED_ENV_PASSWORD."
    );
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    return await rl.question("Secrets password: ");
  } finally {
    rl.close();
  }
}

async function loadEncryptedEnv(file = ".env.enc", options = {}) {
  if (!fs.existsSync(file)) {
    throw new Error(`${file} not found`);
  }

  const password = options.password
    || process.env.ENCRYPTED_ENV_PASSWORD
    || await promptForPassword();

  const payload = JSON.parse(fs.readFileSync(file, "utf8"));

  const salt = Buffer.from(payload.salt, "base64");
  const iv = Buffer.from(payload.iv, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");
  const encrypted = Buffer.from(payload.encrypted, "base64");

  const key = crypto.scryptSync(password, salt, 32);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");

  const parsed = dotenv.parse(decrypted);

  for (const [key, value] of Object.entries(parsed)) {
    process.env[key] = value;
  }

  return Object.keys(parsed);
}

async function loadBackendEnvironment({
  nodeEnv = process.env.NODE_ENV,
  encryptedFile = ".env.enc",
  password,
} = {}) {
  if (nodeEnv === "production") {
    return { source: "process", loadedKeys: [] };
  }

  const loadedKeys = await loadEncryptedEnv(encryptedFile, { password });
  return { source: "encrypted", loadedKeys };
}

module.exports = { loadBackendEnvironment, loadEncryptedEnv };
