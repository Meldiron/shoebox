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
| `listGalleries()`              | Up to 100 rows the signed-in user can read          |
| `createGallery(name)`          | New row with owner-only permissions                 |
| `deleteGallery(gallery)`       | Deletes its photos, then the row                    |
| `listPhotos(galleryId, after?)`| One page of 24, newest first; `after` is the cursor |
| `uploadPhoto(galleryId, file)` | File to Storage, then a row to TablesDB             |
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
