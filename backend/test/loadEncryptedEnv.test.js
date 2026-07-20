const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  loadBackendEnvironment,
  loadEncryptedEnv,
} = require('../loadEncryptedEnv');

function encrypt(contents, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(password, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(contents, 'utf8'),
    cipher.final(),
  ]);

  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    encrypted: encrypted.toString('base64'),
  };
}

test('decrypts an env file and injects its values into process.env', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pong-env-'));
  const encryptedFile = path.join(directory, '.env.enc');
  const previousSigningKey = process.env.SIGNING_WALLET_PRIVATE_KEY;
  const previousChainId = process.env.CELO_CHAIN_ID;

  t.after(() => {
    fs.rmSync(directory, { recursive: true, force: true });
    if (previousSigningKey === undefined) {
      delete process.env.SIGNING_WALLET_PRIVATE_KEY;
    } else {
      process.env.SIGNING_WALLET_PRIVATE_KEY = previousSigningKey;
    }
    if (previousChainId === undefined) {
      delete process.env.CELO_CHAIN_ID;
    } else {
      process.env.CELO_CHAIN_ID = previousChainId;
    }
  });

  fs.writeFileSync(
    encryptedFile,
    JSON.stringify(encrypt(
      'SIGNING_WALLET_PRIVATE_KEY=0xabc123\nCELO_CHAIN_ID=42220\n',
      'test-password'
    ))
  );

  const loadedKeys = await loadEncryptedEnv(encryptedFile, {
    password: 'test-password',
  });

  assert.deepEqual(loadedKeys, [
    'SIGNING_WALLET_PRIVATE_KEY',
    'CELO_CHAIN_ID',
  ]);
  assert.equal(process.env.SIGNING_WALLET_PRIVATE_KEY, '0xabc123');
  assert.equal(process.env.CELO_CHAIN_ID, '42220');
});

test('rejects an incorrect password without injecting values', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pong-env-'));
  const encryptedFile = path.join(directory, '.env.enc');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  fs.writeFileSync(
    encryptedFile,
    JSON.stringify(encrypt('SECRET_VALUE=protected\n', 'correct-password'))
  );

  await assert.rejects(
    loadEncryptedEnv(encryptedFile, { password: 'wrong-password' })
  );
  assert.equal(process.env.SECRET_VALUE, undefined);
});

test('production uses process.env without reading an encrypted file', async () => {
  const result = await loadBackendEnvironment({
    nodeEnv: 'production',
    encryptedFile: '/file/does/not/exist',
  });

  assert.deepEqual(result, {
    source: 'process',
    loadedKeys: [],
  });
});
