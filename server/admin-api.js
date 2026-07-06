const crypto = require("crypto");
const fs = require("fs/promises");
const http = require("http");
const path = require("path");

const siteRoot = process.env.SITE_ROOT || path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 3097);
const defaultPasswordHash = "122f51af686b46c88122e03bd8ca568ac2cab408aa2094dc95f1f87f4a7fd6b4";
const tokenSecret = process.env.ADMIN_TOKEN_SECRET || crypto.randomBytes(32).toString("hex");

const dataPath = path.join(siteRoot, "data", "site-content.json");
const uploadsDir = path.join(siteRoot, "images", "uploads");
const blogFallbackPath = path.join(siteRoot, "blog", "yazi", "index.html");
const allowedImageTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"]
]);

function send(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function readBody(req, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("Payload too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readJson() {
  const raw = await fs.readFile(dataPath, "utf8");
  return JSON.parse(raw);
}

async function writeJson(filePath, value) {
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(value, null, 2));
  await fs.rename(tmp, filePath);
}

function sha256(value = "") {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", tokenSecret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyToken(token = "") {
  try {
    const [body, sig] = token.split(".");
    if (!body || !sig) return false;
    const expected = crypto.createHmac("sha256", tokenSecret).update(body).digest("base64url");
    const actualBuffer = Buffer.from(sig);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length) return false;
    if (!crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return false;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return payload.exp && payload.exp > Date.now();
  } catch {
    return false;
  }
}

function requireAuth(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return verifyToken(token);
}

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "yazi";
}

async function syncBlogPages(content) {
  let template;
  try {
    template = await fs.readFile(blogFallbackPath, "utf8");
  } catch {
    return;
  }
  const posts = Array.isArray(content.blogPosts) ? content.blogPosts : [];
  for (const post of posts) {
    if (post.active === false) continue;
    const slug = slugify(post.slug || post.title || "");
    const dir = path.join(siteRoot, "blog", slug);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "index.html"), template);
  }
}

function safeFilename(name = "", type = "image/jpeg") {
  const ext = allowedImageTypes.get(type) || ".jpg";
  const base = slugify(path.basename(name, path.extname(name)));
  return `${Date.now()}-${base}${ext}`;
}

async function handleLogin(req, res) {
  const body = JSON.parse(await readBody(req, 1024 * 1024) || "{}");
  const content = await readJson();
  const currentHash = content.settings?.adminPasswordHash || defaultPasswordHash;
  if (sha256(body.password || "") !== currentHash) {
    send(res, 401, { ok: false, error: "Şifre yanlış." });
    return;
  }
  send(res, 200, {
    ok: true,
    token: signToken({ sub: "admin", exp: Date.now() + 8 * 60 * 60 * 1000 })
  });
}

async function handleContentSave(req, res) {
  if (!requireAuth(req)) {
    send(res, 401, { ok: false, error: "Oturum geçersiz." });
    return;
  }
  const body = JSON.parse(await readBody(req) || "{}");
  if (!body.content || typeof body.content !== "object") {
    send(res, 400, { ok: false, error: "Geçersiz içerik." });
    return;
  }
  await writeJson(dataPath, body.content);
  await syncBlogPages(body.content);
  send(res, 200, { ok: true });
}

async function handleUpload(req, res) {
  if (!requireAuth(req)) {
    send(res, 401, { ok: false, error: "Oturum geçersiz." });
    return;
  }
  const body = JSON.parse(await readBody(req) || "{}");
  if (!body.data || !allowedImageTypes.has(String(body.type || ""))) {
    send(res, 400, { ok: false, error: "Sadece görsel yüklenebilir." });
    return;
  }
  const buffer = Buffer.from(String(body.data).replace(/^data:[^,]+,/, ""), "base64");
  if (!buffer.length || buffer.length > 8 * 1024 * 1024) {
    send(res, 400, { ok: false, error: "Görsel boyutu uygun değil." });
    return;
  }
  await fs.mkdir(uploadsDir, { recursive: true });
  const filename = safeFilename(body.name || "gorsel.jpg", body.type);
  await fs.writeFile(path.join(uploadsDir, filename), buffer);
  send(res, 200, { ok: true, path: `images/uploads/${filename}` });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/health") {
      send(res, 200, { ok: true });
    } else if (req.method === "POST" && url.pathname === "/login") {
      await handleLogin(req, res);
    } else if (req.method === "PUT" && url.pathname === "/content") {
      await handleContentSave(req, res);
    } else if (req.method === "POST" && url.pathname === "/upload") {
      await handleUpload(req, res);
    } else {
      send(res, 404, { ok: false, error: "Bulunamadı." });
    }
  } catch (error) {
    const status = error.status || 500;
    send(res, status, { ok: false, error: status === 500 ? "Sunucu hatası." : error.message });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Concept Mobilya admin API listening on ${port}`);
});
