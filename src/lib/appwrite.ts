import { AuthUI } from "@getauthui/core";
import {
  ID,
  Query,
  Storage,
  TablesDB,
  type Client,
  type Models,
} from "appwrite";

export const ENDPOINT = "https://fra.cloud.appwrite.io/v1";
export const PROJECT_ID = "6ab43a98000b9aedd03c";
export const DATABASE_ID = "shoebox";
export const GALLERIES_TABLE_ID = "galleries";
export const PHOTOS_TABLE_ID = "photos";
export const PHOTOS_BUCKET_ID = "photos";
export const MAX_GALLERIES = 100;
export const PAGE_SIZE = 24; // Photos per page

export type Gallery = Models.Row & { name: string };
export type Photo = Models.Row & {
  galleryId: string;
  fileId: string;
  name: string;
};
/** A pending OAuth2 authorization request. authorizationDetails is a JSON string (RFC 9396). */
export type Grant = {
  $id: string;
  appId: string;
  scopes: string[];
  redirectUri: string;
  authorizationDetails: string;
};
/** Public details of the client app asking for access. */
export type App = { $id: string; name: string; tagline: string };

/* Auth -------------------------------------------------------------------- */

AuthUI.init({
  endpoint: ENDPOINT,
  project: PROJECT_ID,
  methods: { emailPassword: true },
  branding: { name: "Shoebox", theme: "dark" },
});

const client = AuthUI.getClient() as Client;
const tables = new TablesDB(client);
const storage = new Storage(client);

/* Galleries --------------------------------------------------------------- */

export async function listGalleries() {
  const { rows } = await tables.listRows<Gallery>({
    databaseId: DATABASE_ID,
    tableId: GALLERIES_TABLE_ID,
    queries: [Query.limit(MAX_GALLERIES)],
  });
  
  return rows;
}

export function createGallery(name: string) {
  return tables.createRow<Gallery>({
    databaseId: DATABASE_ID,
    tableId: GALLERIES_TABLE_ID,
    rowId: ID.unique(),
    data: { name },
  });
}

export function renameGallery(gallery: Gallery, name: string) {
  return tables.updateRow<Gallery>({
    databaseId: DATABASE_ID,
    tableId: GALLERIES_TABLE_ID,
    rowId: gallery.$id,
    data: { name },
  });
}

export async function deleteGallery(gallery: Gallery) {
  // TODO: Background job to delete gallery photos
  await tables.deleteRow({
    databaseId: DATABASE_ID,
    tableId: GALLERIES_TABLE_ID,
    rowId: gallery.$id,
  });
}

/* Photos ------------------------------------------------------------------ */

export async function listPhotos(galleryId: string, after?: Photo) {
  const queries = [
    Query.equal("galleryId", galleryId),
    Query.orderDesc("$createdAt"),
    Query.limit(PAGE_SIZE),
  ];
  
  if (after) queries.push(Query.cursorAfter(after.$id));
  
  const { rows } = await tables.listRows<Photo>({
    databaseId: DATABASE_ID,
    tableId: PHOTOS_TABLE_ID,
    queries,
  });
  
  return rows;
}

export async function uploadPhoto(galleryId: string, file: File) {
  const fileId = ID.unique();
  
  const stored = new File([file], `${fileId}.${file.name.split(".").pop()}`, {
    type: file.type,
  });
  
  const uploaded = await storage.createFile({
    bucketId: PHOTOS_BUCKET_ID,
    fileId,
    file: stored,
    folder: galleryId,
  });
  
  return tables.createRow<Photo>({
    databaseId: DATABASE_ID,
    tableId: PHOTOS_TABLE_ID,
    rowId: ID.unique(),
    data: { galleryId, fileId: uploaded.$id, name: file.name },
  });
}

export function movePhoto(photoId: string, galleryId: string) {
  // TODO: Update file's folder

  return tables.updateRow<Photo>({
    databaseId: DATABASE_ID,
    tableId: PHOTOS_TABLE_ID,
    rowId: photoId,
    data: { galleryId },
  });
}

export async function deletePhoto(photo: Photo) {
  await tables.deleteRow({
    databaseId: DATABASE_ID,
    tableId: PHOTOS_TABLE_ID,
    rowId: photo.$id,
  });
  await storage.deleteFile({
    bucketId: PHOTOS_BUCKET_ID,
    fileId: photo.fileId,
  });
}

/* Files ------------------------------------------------------------------- */

export function thumbnailUrl(photo: Photo) {
  return storage.getFilePreview({
    bucketId: PHOTOS_BUCKET_ID,
    fileId: photo.fileId,
    width: 600,
    height: 600,
  });
}

export function fileUrl(photo: Photo) {
  return storage.getFileView({
    bucketId: PHOTOS_BUCKET_ID,
    fileId: photo.fileId,
  });
}

export function downloadUrl(photo: Photo) {
  return storage.getFileDownload({
    bucketId: PHOTOS_BUCKET_ID,
    fileId: photo.fileId,
  });
}

/* OAuth2 server ----------------------------------------------------------- */

const OAUTH2 = `${ENDPOINT}/oauth2/${PROJECT_ID}`;
const json = {
  "X-Appwrite-Project": PROJECT_ID,
  accept: "application/json",
  "content-type": "application/json",
};

export function getGrant(grantId: string): Promise<Grant> {
  return client.call("get", new URL(`${OAUTH2}/grants/${grantId}`), json);
}

export function getApp(appId: string): Promise<App> {
  return client.call("get", new URL(`${ENDPOINT}/apps/${appId}`), json);
}

export function createGrant(
  params: URLSearchParams,
): Promise<{ grantId: string; redirectUrl: string }> {
  return client.call("get", new URL(`${OAUTH2}/authorize?${params}`), json);
}

export async function approveGrant(
  grantId: string,
  galleryId: string,
): Promise<string> {
  const authorization_details = JSON.stringify([
    { type: "gallery", identifiers: [galleryId] },
  ]);
  const { redirectUrl } = await client.call(
    "post",
    new URL(`${OAUTH2}/approve`),
    json,
    {
      grant_id: grantId,
      authorization_details,
    },
  );
  return redirectUrl;
}

export async function rejectGrant(grantId: string): Promise<string> {
  const { redirectUrl } = await client.call(
    "post",
    new URL(`${OAUTH2}/reject`),
    json,
    { grant_id: grantId },
  );
  return redirectUrl;
}

/* Helpers ------------------------------------------------------------------- */

export const showError = (e: Error) => alert(e.message);
