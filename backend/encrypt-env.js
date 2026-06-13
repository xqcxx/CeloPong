const fs = require("fs");
const crypto = require("crypto");
const readline = require("readline/promises");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function main() {
  const password = await rl.question("Encryption password: ");
  rl.close();

  const plaintext = fs.readFileSync(".env.key", "utf8");

  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);

  const key = crypto.scryptSync(password, salt, 32);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  const payload = {
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    encrypted: encrypted.toString("base64"),
  };

  fs.writeFileSync(".env.enc", JSON.stringify(payload, null, 2));

  console.log("Created .env.enc");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
