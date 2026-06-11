/**
 * Upload built frontend to beta.scriptcheck.co.za via FTP (cPanel).
 *
 * Required env:
 *   FTP_HOST=169.239.218.72
 *   FTP_USER=your_cpanel_username
 *   FTP_PASS=your_cpanel_password
 *   FTP_REMOTE_DIR=/public_html/beta   (or subdomain docroot)
 *
 *   node scripts/upload-beta-frontend-ftp.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Client } from "basic-ftp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "../frontend/dist");
const HTACCESS = path.join(__dirname, "../deploy/beta.htaccess");

const FTP_HOST = process.env.FTP_HOST || "169.239.218.72";
const FTP_USER = process.env.FTP_USER || "";
const FTP_PASS = process.env.FTP_PASS || "";
const FTP_REMOTE_DIR = process.env.FTP_REMOTE_DIR || "/public_html/beta";

async function uploadDir(client, localDir, remoteDir) {
  await client.ensureDir(remoteDir);
  const entries = fs.readdirSync(localDir, { withFileTypes: true });
  for (const entry of entries) {
    const localPath = path.join(localDir, entry.name);
    const remotePath = `${remoteDir}/${entry.name}`;
    if (entry.isDirectory()) {
      await uploadDir(client, localPath, remotePath);
    } else {
      console.log(`  upload ${entry.name}`);
      await client.uploadFrom(localPath, remotePath);
    }
  }
}

async function main() {
  if (!FTP_USER || !FTP_PASS) {
    console.error("Set FTP_USER and FTP_PASS");
    process.exit(1);
  }
  if (!fs.existsSync(DIST)) {
    console.error("Run npm run build:beta first");
    process.exit(1);
  }

  const client = new Client(60000);
  client.ftp.verbose = true;
  try {
    console.log(`Connecting to ${FTP_HOST}…`);
    await client.access({
      host: FTP_HOST,
      user: FTP_USER,
      password: FTP_PASS,
      secure: false,
    });
    console.log(`Uploading to ${FTP_REMOTE_DIR}…`);
    await uploadDir(client, DIST, FTP_REMOTE_DIR);
    if (fs.existsSync(HTACCESS)) {
      await client.uploadFrom(HTACCESS, `${FTP_REMOTE_DIR}/.htaccess`);
      console.log("  upload .htaccess");
    }
    console.log("\nFrontend uploaded to beta.scriptcheck.co.za");
  } finally {
    client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
