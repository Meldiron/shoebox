import { Client, Query, Storage, TablesDB } from "node-appwrite";
import { S3Client } from "bun";

const DATABASE = "shoebox";
const GALLERIES = "galleries";
const PHOTOS = "photos";
const BUCKET = "photos";
const URL_TTL = 3600; // presigned URLs live for one hour

// Browser clients ("Sign in with Shoebox" apps) call this API directly, so every
// response carries CORS headers and the preflight for the Authorization header is answered.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization",
  "Access-Control-Max-Age": "86400",
};

/**
 * GET /?limit=24&offset=0 with "Authorization: Bearer <access token>".
 *
 * Shoebox is an OAuth2 provider; this function is a resource server. It asks
 * Appwrite whether the token is valid, requires the gallery.read scope, reads
 * the gallery the user picked on the consent screen from the token's Rich
 * Authorization Request details, and returns that gallery's photos as
 * short-lived S3 URLs.
 */
export default async ({ req, res, log, error }: any) => {
  if (req.method === "OPTIONS") return res.text("", 204, cors);

  const endpoint = Bun.env.APPWRITE_FUNCTION_API_ENDPOINT;
  const project = Bun.env.APPWRITE_FUNCTION_PROJECT_ID;
  // A stored API key (oauth2.introspect, rows.read, tables.read, files.read, buckets.read).
  // It also serves as the S3 secret; the execution's auto-generated key cannot do either.
  const apiKey = Bun.env.APPWRITE_API_KEY;

  // 1. Bearer token
  // Appwrite adds its own Authorization credential to every execution, and the
  // two values arrive comma-joined, so take only the first JWT-safe run of characters.
  const header = String(req.headers["authorization"] ?? "");
  const token = header.startsWith("Bearer ") ? header.slice(7).match(/[A-Za-z0-9._-]+/)?.[0] : undefined;
  if (!token) return res.json({ error: "missing_token" }, 401, cors);

  // 2. Validate it with Appwrite (RFC 7662 token introspection)
  const introspection = await fetch(`${endpoint}/oauth2/${project}/introspect`, {
    method: "POST",
    headers: {
      "X-Appwrite-Project": project,
      "X-Appwrite-Key": apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ token }),
  });
  if (!introspection.ok) {
    error(`Introspection failed: ${introspection.status} ${await introspection.text()}`);
    return res.json({ error: "invalid_token" }, 401, cors);
  }
  const info = await introspection.json();
  if (!info.active) {
    log("Token rejected by introspection");
    return res.json({ error: "invalid_token" }, 401, cors);
  }

  // 3. Scope
  const scopes = String(info.scope ?? "").split(" ");
  if (!scopes.includes("gallery.read")) {
    return res.json({ error: "insufficient_scope", required: "gallery.read" }, 403, cors);
  }

  // 4. Which gallery? The consent screen put it in authorization_details.
  const details = typeof info.authorization_details === "string"
    ? JSON.parse(info.authorization_details)
    : (info.authorization_details ?? []);
  const galleryId = details.find((d: any) => d.type === "gallery")?.identifiers?.[0];
  if (!galleryId) return res.json({ error: "no_gallery_granted" }, 403, cors);

  const client = new Client().setEndpoint(endpoint).setProject(project).setKey(apiKey);
  const tables = new TablesDB(client);
  const storage = new Storage(client);

  // 5. The gallery must belong to the user the token was issued for.
  const gallery = await tables
    .getRow({ databaseId: DATABASE, tableId: GALLERIES, rowId: galleryId })
    .catch(() => null);
  if (!gallery || !gallery.$permissions.includes(`read("user:${info.sub}")`)) {
    return res.json({ error: "gallery_not_found" }, 404, cors);
  }

  // 6. One page of photos, newest first
  const limit = Math.min(Math.max(Number(req.query.limit) || 24, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const { rows, total } = await tables.listRows({
    databaseId: DATABASE,
    tableId: PHOTOS,
    queries: [
      Query.equal("galleryId", galleryId),
      Query.orderDesc("$createdAt"),
      Query.limit(limit),
      Query.offset(offset),
    ],
  });

  // 7. Object keys for those files, then a presigned S3 URL for each
  const { files } = rows.length
    ? await storage.listFiles({
        bucketId: BUCKET,
        queries: [Query.equal("$id", rows.map((r) => r.fileId)), Query.limit(rows.length)],
      })
    : { files: [] };
  const keyOf = new Map(files.map((f) => [f.$id, f.key]));

  const s3 = new S3Client({
    accessKeyId: project,
    secretAccessKey: apiKey,
    endpoint: `${endpoint}/s3`,
    bucket: BUCKET,
    region: "auto",
  });

  return res.json({
    gallery: { id: gallery.$id, name: gallery.name },
    total,
    limit,
    offset,
    files: rows.map((r) => ({
      id: r.$id,
      name: r.name,
      url: keyOf.has(r.fileId) ? s3.presign(keyOf.get(r.fileId)!, { expiresIn: URL_TTL }) : null,
    })),
  }, 200, cors);
};
