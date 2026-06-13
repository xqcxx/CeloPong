const fs = require("fs");
const crypto = require("crypto");
const dotenv = require("dotenv");
const readline = require("readline/promises");

async function loadEncryptedEnv(file = ".env.enc") {
  if (!fs.existsSync(file)) {
    throw new Error(`${file} not found`);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const password = await rl.question("Secrets password: ");
  rl.close();

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
}

module.exports = { loadEncryptedEnv };
