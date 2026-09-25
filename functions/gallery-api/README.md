# Gallery API (Bun function)

A resource server for "Sign in with Shoebox" clients. Give it an OAuth2 access
token and it returns the photos of the one gallery the user granted, as
presigned S3 URLs.

## Request

```
GET https://<FUNCTION_DOMAIN>/?limit=24&offset=0
Authorization: Bearer <ACCESS_TOKEN>
```

| Param    | Default | Range   |
| -------- | ------- | ------- |
| `limit`  | 24      | 1 – 100 |
| `offset` | 0       | ≥ 0     |

## Response

```json
{
  "gallery": { "id": "…", "name": "Work" },
  "total": 3,
  "limit": 2,
  "offset": 0,
  "files": [
    { "id": "…", "name": "tile-03.png", "url": "https://fra.cloud.appwrite.io/v1/s3/photos/<gallery>/<file>.png?X-Amz-…" }
  ]
}
```

URLs are valid for one hour and need no Appwrite credentials.

Every response carries `Access-Control-Allow-Origin: *` and `OPTIONS` answers the
preflight for the `Authorization` header, so browser apps can call it directly.

| Status | Body                                          | When                                         |
| ------ | --------------------------------------------- | -------------------------------------------- |
| 401    | `missing_token`, `invalid_token`              | No bearer token, or Appwrite says it is not active |
| 403    | `insufficient_scope` (requires `gallery.read`) | Token lacks the scope                       |
| 403    | `no_gallery_granted`                          | Token has no `gallery` authorization detail  |
| 404    | `gallery_not_found`                           | Gallery missing or not owned by the token's user |

## How it works

1. `Oauth2.introspect` (node-appwrite 30) validates the token and returns its
   `scope`, `sub`, and `authorization_details`.
2. The `gallery` detail names the gallery chosen on the consent screen.
3. The gallery row must carry `read("user:<sub>")`, so a token can only reach
   its own user's gallery.
4. Rows come from TablesDB with `limit` / `offset`; the matching Storage files
   give the object keys (`<galleryId>/<fileId>.<ext>`).
5. `Bun.S3Client.presign` signs each key against Appwrite's S3-compatible
   endpoint `https://<REGION>.cloud.appwrite.io/v1/s3` (access key = project
   ID, secret = a stored API key with `files.read` and `buckets.read`).

## Configuration

| Setting     | Value                                                         |
| ----------- | ------------------------------------------------------------- |
| Runtime     | Bun 1.4                                                       |
| Entrypoint  | `src/main.ts`                                                 |
| Build       | `bun install`                                                 |
| Execute     | `any` (the bearer token is the real access control)          |
| Scopes      | `oauth2.introspect`, `rows.read`, `tables.read`, `files.read`, `buckets.read` |
| Variables   | `APPWRITE_API_KEY`: secret of a project API key with `files.read` and `buckets.read`, used only to sign S3 URLs |

Every Appwrite call uses the dynamic API key Appwrite issues per execution
(`x-appwrite-key` request header), which carries the scopes above. The S3
signature is the one exception: Appwrite's S3 API only accepts signatures made
with a stored project API key, so that one stays in a variable.

The `photos` bucket must have encryption disabled; Appwrite's S3 API refuses
encrypted or compressed buckets.
