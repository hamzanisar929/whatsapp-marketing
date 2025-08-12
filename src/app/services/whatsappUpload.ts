// services/whatsappTemplateUpload.ts
import fs from "fs";
import path from "path";
import axios from "axios";
import mime from "mime-types";

export async function uploadMediaForTemplateFromSource(source?: {
  file?: Express.Multer.File;
  filePath?: string;
}): Promise<string> {
  // env vars required:
  // process.env.FB_API_VERSION (e.g. 'v20.0')
  // process.env.FB_APP_ID       (your Facebook App ID)
  // process.env.WHATSAPP_ACCESS_TOKEN (token with whatsapp_business_management / system-user permissions)

  const apiVersion = "v20.0";
  const appId = process.env.FB_APP_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!appId) throw new Error("FB_APP_ID missing");
  if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN missing");

  // 1) load file bytes, determine mimeType and size
  let buffer: Buffer;
  let mimeType = "application/octet-stream";
  if (source?.file) {
    const p = source.file.path;
    buffer = fs.readFileSync(p);
    mimeType =
      source.file.mimetype || mime.lookup(source.file.originalname) || mimeType;
  } else if (source?.filePath) {
    if (source.filePath.startsWith("http")) {
      const resp = await axios.get(source.filePath, {
        responseType: "arraybuffer",
      });
      buffer = Buffer.from(resp.data);
      mimeType =
        resp.headers["content-type"] ||
        mime.lookup(source.filePath) ||
        mimeType;
    } else {
      const localPath = path.isAbsolute(source.filePath)
        ? source.filePath
        : path.join(process.cwd(), source.filePath);
      if (!fs.existsSync(localPath)) throw new Error("Local file not found");
      buffer = fs.readFileSync(localPath);
      mimeType = mime.lookup(localPath) || mimeType;
    }
  } else {
    // fallback default file
    const defaultPath = path.join(process.cwd(), "public", "logo.png");
    if (!fs.existsSync(defaultPath)) throw new Error("Default file not found");
    buffer = fs.readFileSync(defaultPath);
    mimeType = mime.lookup(defaultPath) || "image/png";
  }

  const fileSize = buffer.length;

  // 2) Create upload session (POST /{app-id}/uploads?file_length=...&file_type=...)
  const createSessionUrl = `https://graph.facebook.com/${apiVersion}/${appId}/uploads?file_length=${fileSize}&file_type=${encodeURIComponent(
    mimeType
  )}`;
  const sessionRes = await axios.post(createSessionUrl, null, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // session id returned looks like: "upload:MTp....?sig=..." — use that in the next call
  const uploadId =
    sessionRes.data?.id ||
    sessionRes.data?.upload_session_id ||
    sessionRes.data;
  if (!uploadId) throw new Error("Failed to create upload session");

  // 3) Upload bytes to the session (POST /{uploadId} with file body & header file_offset: 0)
  const uploadUrl = `https://graph.facebook.com/${apiVersion}/${uploadId}`;
  const uploadRes = await axios.post(uploadUrl, buffer, {
    headers: {
      Authorization: `Bearer ${token}`,
      file_offset: "0",
      "Content-Type": mimeType,
      "Content-Length": fileSize.toString(),
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  // 4) Result contains the file handle — often in `h` or `handle` (example: "4:::..."). Return it.
  const handle = uploadRes.data?.h || uploadRes.data?.handle || uploadRes.data;
  if (!handle) throw new Error("Upload returned no handle");
  return String(handle);
}
