# Shoebox

A minimal private gallery. Sign in, add galleries, drop files into them.
Files live in Appwrite Storage; each file has a row in Appwrite TablesDB.

Astro + React + Tailwind, Appwrite Cloud, sign-in by [Auth UI](https://authui.appwrite.network).

## Files

```text
src/
├── lib/appwrite.ts         Auth UI setup and every Appwrite call, one named function each
├── components/App.tsx      Header, sign-in gate, gallery tabs
├── components/Photos.tsx   Upload, grid, lightbox
└── pages/index.astro       Page shell and Tailwind
```

`lib/appwrite.ts` is the only file that touches the SDK. It configures Auth UI
(`@getauthui/core`, installed from npm) and reuses the Appwrite client Auth UI
signs in with, so every call carries the session:

| Function                       | Does                                                |
| ------------------------------ | --------------------------------------------------- |
| `listGalleries()`              | Up to 100 rows the signed-in user can read; creates "Inbox" for a user with none |
| `createGallery(name)`          | New row with owner-only permissions                 |
| `renameGallery(gallery, name)` | Updates the name (double-click a tab in the app)    |
| `deleteGallery(gallery)`       | Deletes its photos, then the row                    |
| `listPhotos(galleryId, after?)`| One page of 24, newest first; `after` is the cursor |
| `uploadPhoto(galleryId, file)` | File to Storage, then a row to TablesDB             |
| `movePhoto(photoId, galleryId)`| Row update only (drag a tile onto a gallery tab)    |
| `deletePhoto(photo)`           | Row, then file                                      |
| `thumbnailUrl(photo)`          | 600×600 preview URL                                 |
| `fileUrl(photo)`               | Original file URL                                   |
| `downloadUrl(photo)`           | URL that downloads instead of displaying            |

The React app reads sign-in state with `useAuthUI()` and shows the account
button with `AuthUIUserButton`, both from `@getauthui/core/react`. The island
is `client:only`, so nothing Auth UI related runs during server rendering.

Images are plain `<img src>` tags pointing at the URLs above. Files are
private, so those requests only succeed when the browser sends the Appwrite
session cookie. On `localhost` the API is a third-party site, so Chrome with
default settings works while Safari, Firefox, and Incognito show broken
images. Serving the API from a custom domain on the same site as the app
makes the cookie first-party and fixes this.

## Data

| Resource          | Fields                                                    |
| ----------------- | --------------------------------------------------------- |
| Table `galleries` | `name`                                                    |
| Table `photos`    | `galleryId`, `fileId`, `name`                             |
| Bucket `photos`   | the file bytes, images only (jpg, png, gif, webp, heic, avif) |

Tables and the bucket grant only `create` to signed-in users. Each row and
file is written with `read`, `update`, and `delete` for its owner, so
listing returns only your own data with no filtering in code.

Created with the Appwrite CLI (project `6ab43a98000b9aedd03c`):

```sh
appwrite client --project-id <PROJECT_ID>

appwrite tablesdb create --database-id shoebox --name Shoebox --enabled

appwrite tablesdb create-table --database-id shoebox --table-id galleries --name Galleries \
  --enabled --row-security --permissions 'create("users")'
appwrite tablesdb create-string-column --database-id shoebox --table-id galleries --key name --size 128 --required

appwrite tablesdb create-table --database-id shoebox --table-id photos --name Photos \
  --enabled --row-security --permissions 'create("users")'
appwrite tablesdb create-string-column --database-id shoebox --table-id photos --key galleryId --size 64  --required
appwrite tablesdb create-string-column --database-id shoebox --table-id photos --key fileId    --size 64  --required
appwrite tablesdb create-string-column --database-id shoebox --table-id photos --key name      --size 255 --required
appwrite tablesdb create-index --database-id shoebox --table-id photos --key galleryId_createdAt \
  --type key --columns galleryId --columns '$createdAt' --orders ASC --orders DESC

appwrite storage create-bucket --bucket-id photos --name Photos --enabled \
  --file-security --encryption --transformations --permissions 'create("users")' \
  --allowed-file-extensions jpg --allowed-file-extensions jpeg --allowed-file-extensions png \
  --allowed-file-extensions gif --allowed-file-extensions webp --allowed-file-extensions heic \
  --allowed-file-extensions heif --allowed-file-extensions avif
```

The bucket rejects anything that is not an image, and the file picker only
offers images (`accept="image/*"`).

`localhost` works without registering a platform.

## Run

```sh
npm install
npm run dev     # http://localhost:4321
```

## Sign in with Shoebox (OAuth2 server)

The Appwrite project is also an OAuth 2.1 / OpenID Connect provider, so other
apps can offer "Sign in with Shoebox". Appwrite runs the protocol; this repo
only hosts the consent screen at `/consent` (`src/components/Consent.tsx`).

Discovery document:
`https://fra.cloud.appwrite.io/v1/oauth2/6ab43a98000b9aedd03c/.well-known/openid-configuration`

How the consent screen works:

1. A client sends the user to the authorize endpoint. Appwrite redirects to
   `/consent` with a `grant_id` if the user has a Shoebox session, or with the
   client's original parameters if not.
2. Signed-out users sign in with Auth UI on the page. `createGrant` then turns
   the forwarded parameters into a grant and reloads with its id.
3. `getGrant` and `getApp` load what is being asked and by whom.
4. The user picks exactly one gallery to share. Allow calls `approveGrant`
   with that gallery, Deny calls `rejectGrant`. Both return the URL that
   sends the user back to the client, with a code or `access_denied`.

### One gallery per grant (Rich Authorization Requests)

Scopes say what a client may do; they cannot say which gallery. The consent
screen adds that with an RFC 9396 authorization detail when it approves:

```json
[{ "type": "gallery", "identifiers": ["<GALLERY_ID>"] }]
```

Appwrite validates the type against the server's accepted list, stores it on
the grant, and puts it in the token response, the access token, and
introspection as `authorization_details`. A resource server should require
both the scope and a `gallery` detail that names the gallery being read.

The radio list defaults to the first gallery, or to the one a client
preselected in its own `authorization_details`, and Allow stays disabled
until one is chosen. Every user has at least an "Inbox" gallery.

Enabled with the CLI (the command replaces the whole OAuth2 server config, so
always pass every setting):

```sh
appwrite project update-o-auth-2-server --enabled \
  --authorization-url "https://shoebox.appwrite.network/consent/" \
  --scopes openid --scopes profile --scopes email --scopes phone --scopes gallery.read \
  --default-scopes openid --default-scopes profile --default-scopes email \
  --authorization-details-types gallery
```

The trailing slash matters: the static build emits `consent/index.html`, and
the host's redirect from `/consent` to `/consent/` drops the query string that
carries `grant_id`. To work on the consent screen locally, point
`--authorization-url` at `http://localhost:4321/consent` and switch back after.

A confidential demo client is registered for trying the flow:

```sh
appwrite apps create --app-id demo-consumer --name "Demo consumer" --type confidential --enabled \
  --tagline "Sample app that signs in with Shoebox" --redirect-uris "http://localhost:4100/oauth/callback"
appwrite apps create-secret --app-id demo-consumer --show-secrets   # shown once
```

Open this in a browser to start a sign-in as that client:

```
https://fra.cloud.appwrite.io/v1/oauth2/6ab43a98000b9aedd03c/authorize
  ?client_id=demo-consumer
  &redirect_uri=http://localhost:4100/oauth/callback
  &response_type=code&scope=openid profile email&state=123
```

After Allow, the browser lands on the callback with `?code=…`. Exchange it:

```sh
curl -X POST https://fra.cloud.appwrite.io/v1/oauth2/6ab43a98000b9aedd03c/token \
  -d grant_type=authorization_code -d code=<CODE> -d client_id=demo-consumer \
  -d client_secret=<SECRET> --data-urlencode redirect_uri=http://localhost:4100/oauth/callback
```

## Gallery API for clients (Bun function)

Clients that signed in with Shoebox can list the granted gallery through the
`gallery-api` function at `https://shoebox-gallery-api.fra.appwrite.run`:

```
GET https://shoebox-gallery-api.fra.appwrite.run/?limit=24&offset=0
Authorization: Bearer <ACCESS_TOKEN with scope gallery.read>
```

It validates the token with Appwrite's introspection endpoint, requires the
`gallery.read` scope, reads the gallery from the token's `authorization_details`,
checks the gallery belongs to the token's user, and returns one page of photos
as presigned S3 URLs valid for an hour. See `functions/gallery-api/README.md`.

Setup that was done for it:

- `gallery.read` added to the OAuth2 server's scopes (see the command above).
- A project API key with `oauth2.introspect`, `rows.read`, `tables.read`,
  `files.read`, `buckets.read`, stored on the function as `APPWRITE_API_KEY`.
  The CLI cannot create standard keys, so create it in the Console under
  Overview > Integrations > API keys.
- The `photos` bucket has encryption disabled, which Appwrite's S3 API requires.
  Files uploaded while encryption was on are served as ciphertext over S3 and
  need re-uploading.
- Uploads are stored as `<galleryId>/<fileId>.<ext>` so S3 object keys are unique.

Deploy changes with `appwrite push function --all` (the function is recorded in
`appwrite.config.json`).

## Deploy

The app is an Appwrite Site: https://shoebox.appwrite.network

It was created with the CLI as a static Astro site and is described in
`appwrite.config.json` (`sites[0]`, built from the repo root with
`npm run build`, output `./dist`). Redeploy with:

```sh
appwrite push site
```

The one-time setup, for reference:

```sh
appwrite sites create --site-id shoebox --name Shoebox --framework astro --adapter static \
  --build-runtime node-22 --install-command "npm install" --build-command "npm run build" \
  --output-directory ./dist --enabled --logging
appwrite proxy create-site-rule --site-id shoebox --domain shoebox.appwrite.network
```

Per-deployment preview URLs (`<id>.appwrite.network`) ask for a Console
sign-in; the site domain above is public. The API accepts the
`appwrite.network` origin without a registered platform.

Agents: start the dev server with `astro dev --background` (see `AGENTS.md`)
and do not run `astro build` while it is up; both share `node_modules/.vite`.
