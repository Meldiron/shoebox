import { AuthUI } from "@getauthui/core";
import {
  Apps,
  ID,
  Oauth2,
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
/** authorizationDetails is a JSON string (RFC 9396). */
export type Grant = Models.Oauth2Grant;
export type App = Models.App;

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
const oauth2 = new Oauth2(client);
const apps = new Apps(client);

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

export function getGrant(grantId: string) {
  return oauth2.getGrant({ grantId });
}

export function getApp(appId: string) {
  return apps.get({ appId });
}

export function createGrant(params: URLSearchParams) {
  const get = (key: string) => params.get(key) ?? undefined;

  return oauth2.authorize({
    clientId: get("client_id"),
    redirectUri: get("redirect_uri"),
    responseType: get("response_type"),
    scope: get("scope"),
    state: get("state"),
    nonce: get("nonce"),
    codeChallenge: get("code_challenge"),
    codeChallengeMethod: get("code_challenge_method"),
    prompt: get("prompt"),
    maxAge: params.has("max_age") ? Number(get("max_age")) : undefined,
    authorizationDetails: get("authorization_details"),
    resource: get("resource"),
    audience: get("audience"),
    requestUri: get("request_uri"),
  });
}

export async function approveGrant(grantId: string, galleryId: string) {
  const details = [{ type: "gallery", identifiers: [galleryId] }];

  const { redirectUrl } = await oauth2.approve({
    grantId,
    authorizationDetails: JSON.stringify(details),
  });

  return redirectUrl;
}

export async function rejectGrant(grantId: string) {
  const { redirectUrl } = await oauth2.reject({ grantId });

  return redirectUrl;
}

/* Helpers ------------------------------------------------------------------- */

export const showError = (e: Error) => alert(e.message);
