require('dotenv').config();

const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const zlib = require('zlib');
const { Readable, Writable } = require('stream');
const { pipeline } = require('stream/promises');
const cloudinary = require('cloudinary').v2;

const MAGIC = Buffer.from('JEFBAK01');
const HEADER_SIZE = MAGIC.length + 16 + 12;
const AUTH_TAG_SIZE = 16;
const scrypt = promisify(crypto.scrypt);
const backupRoot = path.resolve(process.env.BACKUP_DIR || path.join(process.cwd(), 'backups'));

function requiredEnvironment() {
  const required = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'BACKUP_ENCRYPTION_KEY'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length) throw new Error(`Faltan variables requeridas: ${missing.join(', ')}`);
  if (Buffer.byteLength(process.env.BACKUP_ENCRYPTION_KEY) < 32) {
    throw new Error('BACKUP_ENCRYPTION_KEY debe tener al menos 32 bytes.');
  }
}

async function createEncryptedStream(readable, outputPath) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = await scrypt(process.env.BACKUP_ENCRYPTION_KEY, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const temporaryPath = `${outputPath}.partial`;

  try {
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    const output = fs.createWriteStream(temporaryPath, { flags: 'wx' });
    output.write(Buffer.concat([MAGIC, salt, iv]));
    await pipeline(readable, zlib.createGzip(), cipher, output);
    await fs.promises.appendFile(temporaryPath, cipher.getAuthTag());
    await fs.promises.rename(temporaryPath, outputPath);
  } catch (error) {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function* decryptEncryptedStream(inputPath) {
  let pending = Buffer.alloc(0);
  let ciphertextTail = Buffer.alloc(0);
  let decipher = null;

  for await (const inputChunk of fs.createReadStream(inputPath)) {
    let chunk = inputChunk;
    if (!decipher) {
      pending = Buffer.concat([pending, chunk]);
      if (pending.length < HEADER_SIZE) continue;
      if (!pending.subarray(0, MAGIC.length).equals(MAGIC)) {
        throw new Error('El respaldo no tiene un formato reconocido.');
      }
      const salt = pending.subarray(MAGIC.length, MAGIC.length + 16);
      const iv = pending.subarray(MAGIC.length + 16, HEADER_SIZE);
      const key = await scrypt(process.env.BACKUP_ENCRYPTION_KEY, salt, 32);
      decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      chunk = pending.subarray(HEADER_SIZE);
      pending = Buffer.alloc(0);
    }

    const combined = Buffer.concat([ciphertextTail, chunk]);
    if (combined.length <= AUTH_TAG_SIZE) {
      ciphertextTail = combined;
      continue;
    }
    const splitAt = combined.length - AUTH_TAG_SIZE;
    ciphertextTail = combined.subarray(splitAt);
    const plaintext = decipher.update(combined.subarray(0, splitAt));
    if (plaintext.length) yield plaintext;
  }

  if (!decipher || ciphertextTail.length !== AUTH_TAG_SIZE) {
    throw new Error('El respaldo está incompleto o dañado.');
  }
  decipher.setAuthTag(ciphertextTail);
  const finalChunk = decipher.final();
  if (finalChunk.length) yield finalChunk;
}

function runMysqlDump(outputPath) {
  return new Promise((resolve, reject) => {
    const child = spawn('mysqldump', [
      '--host', process.env.DB_HOST,
      '--port', String(process.env.DB_PORT),
      '--user', process.env.DB_USER,
      '--single-transaction',
      '--routines',
      '--triggers',
      '--hex-blob',
      process.env.DB_NAME
    ], {
      env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-4000); });
    const childDone = new Promise((done, fail) => {
      child.once('error', error => fail(new Error(`No se pudo iniciar mysqldump (${error.code || error.name}).`)));
      child.once('close', code => code === 0
        ? done()
        : fail(new Error(`mysqldump terminó con código ${code}: ${stderr.trim().substring(0, 500)}`)));
    });
    createEncryptedStream(child.stdout, outputPath)
      .then(() => childDone)
      .then(resolve)
      .catch(error => {
        child.kill();
        reject(error);
      });
  });
}

async function* getCloudinaryResources() {
  let nextCursor;
  do {
    const result = await cloudinary.api.resources({
      type: 'upload',
      resource_type: 'image',
      prefix: 'jefatura/',
      max_results: 500,
      ...(nextCursor ? { next_cursor: nextCursor } : {})
    });
    for (const resource of result.resources || []) yield resource;
    nextCursor = result.next_cursor;
  } while (nextCursor);
}

async function backupCloudinary(directory) {
  const resources = [];
  let index = 0;
  for await (const resource of getCloudinaryResources()) {
    const url = new URL(resource.secure_url);
    if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com') {
      throw new Error('Cloudinary devolvió una URL de origen no válida.');
    }
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(`No se pudo descargar un original de Cloudinary (HTTP ${response.status}).`);
    }

    const relativePath = `cloudinary/${String(++index).padStart(8, '0')}.enc`;
    await createEncryptedStream(Readable.fromWeb(response.body), path.join(directory, relativePath));
    resources.push({
      path: relativePath,
      publicId: resource.public_id,
      format: resource.format,
      bytes: resource.bytes
    });
  }
  return resources;
}

async function createBackup() {
  requiredEnvironment();
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET) {
    throw new Error('Faltan credenciales de Cloudinary para respaldar las fotos.');
  }
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const directory = path.join(backupRoot, timestamp);
  await fs.promises.mkdir(backupRoot, { recursive: true });
  await fs.promises.mkdir(directory, { recursive: false });
  try {
    const databaseDump = 'database.sql.gz.enc';
    await runMysqlDump(path.join(directory, databaseDump));
    const assets = await backupCloudinary(directory);
    const manifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      timeZone: 'America/Argentina/Buenos_Aires',
      database: databaseDump,
      cloudinaryAssets: assets
    };
    await createEncryptedStream(
      Readable.from([JSON.stringify(manifest)]),
      path.join(directory, 'manifest.json.gz.enc')
    );
    console.log(`Respaldo cifrado creado: ${directory}`);
    console.log(`Incluye la base y ${assets.length} imagen(es) de Cloudinary.`);
  } catch (error) {
    await fs.promises.rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function readDecryptedBuffer(filePath, maxBytes = 32 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  const collect = new Writable({
    write(chunk, _encoding, callback) {
      size += chunk.length;
      if (size > maxBytes) return callback(new Error('El archivo descifrado supera el límite de verificación.'));
      chunks.push(Buffer.from(chunk));
      callback();
    }
  });
  await pipeline(
    Readable.from(decryptEncryptedStream(filePath)),
    zlib.createGunzip(),
    collect
  );
  return Buffer.concat(chunks);
}

function resolveBackupDirectory(input) {
  if (!input) throw new Error('Indicá la carpeta del respaldo.');
  const directory = path.resolve(input);
  if (!directory.startsWith(`${backupRoot}${path.sep}`)) {
    throw new Error('El respaldo debe estar dentro de BACKUP_DIR.');
  }
  return directory;
}

async function verifyBackup(input) {
  requiredEnvironment();
  const directory = resolveBackupDirectory(input);
  const manifest = JSON.parse(
    (await readDecryptedBuffer(path.join(directory, 'manifest.json.gz.enc'))).toString('utf8')
  );
  if (manifest.version !== 1 || !Array.isArray(manifest.cloudinaryAssets) ||
      typeof manifest.database !== 'string') {
    throw new Error('El manifiesto del respaldo no tiene un formato válido.');
  }

  await pipeline(
    Readable.from(decryptEncryptedStream(path.join(directory, manifest.database))),
    zlib.createGunzip(),
    new Writable({ write(_chunk, _encoding, callback) { callback(); } })
  );
  for (const asset of manifest.cloudinaryAssets) {
    const assetPath = path.resolve(directory, asset.path);
    if (!assetPath.startsWith(`${directory}${path.sep}`)) throw new Error('Ruta de imagen inválida en el manifiesto.');
    await pipeline(
      Readable.from(decryptEncryptedStream(assetPath)),
      zlib.createGunzip(),
      new Writable({ write(_chunk, _encoding, callback) { callback(); } })
    );
  }
  console.log(`Respaldo verificado: base y ${manifest.cloudinaryAssets.length} imagen(es).`);
}

async function restoreBackup(input) {
  requiredEnvironment();
  const expectedConfirmation = `${process.env.DB_HOST}/${process.env.DB_NAME}`;
  if (process.env.BACKUP_RESTORE_CONFIRM !== expectedConfirmation) {
    throw new Error(`Restauración bloqueada. Para continuar, definí BACKUP_RESTORE_CONFIRM=${expectedConfirmation}.`);
  }
  const directory = resolveBackupDirectory(input);
  await verifyBackup(directory);
  const manifest = JSON.parse(
    (await readDecryptedBuffer(path.join(directory, 'manifest.json.gz.enc'))).toString('utf8')
  );
  if (manifest.version !== 1 || !Array.isArray(manifest.cloudinaryAssets) ||
      typeof manifest.database !== 'string') {
    throw new Error('El manifiesto del respaldo no tiene un formato válido.');
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });
  for (const asset of manifest.cloudinaryAssets) {
    const assetPath = path.resolve(directory, asset.path);
    if (!assetPath.startsWith(`${directory}${path.sep}`)) throw new Error('Ruta de imagen inválida en el manifiesto.');
    const buffer = await readDecryptedBuffer(assetPath, 12 * 1024 * 1024);
    await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({
        public_id: asset.publicId,
        resource_type: 'image',
        overwrite: true,
        format: asset.format
      }, (error, result) => error ? reject(new Error(`No se pudo restaurar una imagen (${error.http_code || error.name}).`)) : resolve(result));
      stream.end(buffer);
    });
  }

  const child = spawn('mysql', [
    '--host', process.env.DB_HOST,
    '--port', String(process.env.DB_PORT),
    '--user', process.env.DB_USER,
    process.env.DB_NAME
  ], {
    env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD },
    stdio: ['pipe', 'ignore', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-4000); });
  const restoreProcess = new Promise((resolve, reject) => {
    child.once('error', error => reject(new Error(`No se pudo iniciar mysql (${error.code || error.name}).`)));
    child.once('close', code => code === 0
      ? resolve()
      : reject(new Error(`mysql terminó con código ${code}: ${stderr.trim().substring(0, 500)}`)));
  });
  await pipeline(
    Readable.from(decryptEncryptedStream(path.join(directory, manifest.database))),
    zlib.createGunzip(),
    child.stdin
  );
  await restoreProcess;
  console.log(`Restauración completada en ${process.env.DB_HOST}/${process.env.DB_NAME}.`);
}

async function main() {
  const [operation, directory] = process.argv.slice(2);
  if (operation === '--verify') return verifyBackup(directory);
  if (operation === '--restore') return restoreBackup(directory);
  return createBackup();
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Operación de respaldo fallida: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  MAGIC,
  requiredEnvironment,
  createEncryptedStream,
  decryptEncryptedStream,
  readDecryptedBuffer,
  resolveBackupDirectory
};
