import { Client, Oauth2, Query, Storage, TablesDB } from "node-appwrite";
import { S3Client } from "bun";

const DATABASE_ID = "shoebox";
const GALLERIES_TABLE_ID = "galleries";
const PHOTOS_TABLE_ID = "photos";
const PHOTOS_BUCKET_ID = "photos";
const PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;
const SIGNED_URL_TTL = 3600;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization",
  "Access-Control-Max-Age": "86400",
};

/**
 * GET /?limit=24&offset=0 with "Authorization: Bearer <access token>".
 *
 * Resource server. Requires the gallery.read scope.
 * Exchanges gallery ID for list of signed file URLs.
 */
export default async ({ req, res, log, error }: any) => {
  if (req.method === "OPTIONS") return res.text("", 204, CORS_HEADERS);

  const endpoint = Bun.env.APPWRITE_FUNCTION_API_ENDPOINT!;
  const project = Bun.env.APPWRITE_FUNCTION_PROJECT_ID!;
  const apiKey = String(req.headers["x-appwrite-key"] ?? "");

  const header = String(req.headers["authorization"] ?? "");
  const token = header.startsWith("Bearer ") ? header.slice(7).match(/[A-Za-z0-9._-]+/)?.[0] : undefined;
  if (!token) return res.json({ error: "missing_token" }, 401, CORS_HEADERS);

  const client = new Client().setEndpoint(endpoint).setProject(project).setKey(apiKey);
  const tables = new TablesDB(client);
  const storage = new Storage(client);
  // SDK 30.0.0 bug: Oauth2 is the only service that omits the project header, so it needs its own client.
  const oauth2 = new Oauth2(
    new Client().setEndpoint(endpoint).setProject(project).setKey(apiKey).addHeader("x-appwrite-project", project),
  );

  const info = await oauth2.introspect({ token }).catch((e) => {
    error(`Introspection failed: ${e.message}`);
    return null;
  });
  if (!info?.active) {
    log("Token rejected by introspection");
    return res.json({ error: "invalid_token" }, 401, CORS_HEADERS);
  }

  const scopes = (info.scope ?? "").split(" ");
  if (!scopes.includes("gallery.read")) {
    return res.json({ error: "insufficient_scope", required: "gallery.read" }, 403, CORS_HEADERS);
  }

  const galleryId = info.authorization_details?.find((d) => d.type === "gallery")?.identifiers?.[0];
  if (!galleryId) return res.json({ error: "no_gallery_granted" }, 403, CORS_HEADERS);

  const gallery = await tables
    .getRow({ databaseId: DATABASE_ID, tableId: GALLERIES_TABLE_ID, rowId: galleryId })
    .catch(() => null);
  if (!gallery) {
    return res.json({ error: "gallery_not_found" }, 404, CORS_HEADERS);
  }

  const limit = Math.min(Math.max(Number(req.query.limit) || PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  
  const { rows, total } = await tables.listRows({
    databaseId: DATABASE_ID,
    tableId: PHOTOS_TABLE_ID,
    queries: [
      Query.equal("galleryId", galleryId),
      Query.orderDesc("$createdAt"),
      Query.limit(limit),
      Query.offset(offset),
    ],
  });

  const { files } = rows.length
    ? await storage.listFiles({
        bucketId: PHOTOS_BUCKET_ID,
        queries: [Query.equal("$id", rows.map((r) => r.fileId)), Query.limit(rows.length)],
      })
    : { files: [] };
  const keyOf = new Map(files.map((f) => [f.$id, f.key]));

  const s3 = new S3Client({
    accessKeyId: project,
    secretAccessKey: Bun.env.APPWRITE_API_KEY!, // TODO: Ephemeral key
    endpoint: `${endpoint}/s3`,
    bucket: PHOTOS_BUCKET_ID,
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
      url: keyOf.has(r.fileId) ? s3.presign(keyOf.get(r.fileId)!, { expiresIn: SIGNED_URL_TTL }) : null,
    })),
  }, 200, CORS_HEADERS);
};
