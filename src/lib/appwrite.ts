import { AuthUI } from "@getauthui/core";
import { ID, Permission, Query, Role, Storage, TablesDB, type Client, type Models } from "appwrite";

export const DATABASE = "shoebox"; // Database
export const GALLERIES = "galleries"; // Table
export const PHOTOS = "photos"; // Table
export const BUCKET = "photos"; // Bucket
export const MAX_GALLERIES = 100;
export const PAGE_SIZE = 24; // Photos per page

export type Gallery = Models.Row & { name: string };
export type Photo = Models.Row & { galleryId: string; fileId: string; name: string };

/* Auth -------------------------------------------------------------------- */

AuthUI.init({
  endpoint: "https://fra.cloud.appwrite.io/v1",
  project: "6ab43a98000b9aedd03c",
  methods: { emailPassword: true },
  branding: { name: "Shoebox", theme: "dark" },
});

const client = AuthUI.getClient() as Client;
const tables = new TablesDB(client);
const storage = new Storage(client);

function ownerOnly() {
  const user = AuthUI.getUser();
  if (!user) throw new Error("Not signed in");
  const me = Role.user(user.$id);
  return [Permission.read(me), Permission.update(me), Permission.delete(me)];
}

/* Galleries --------------------------------------------------------------- */

/** Row security means this only returns the signed-in user's galleries. */
export async function listGalleries() {
  const { rows } = await tables.listRows<Gallery>({
    databaseId: DATABASE,
    tableId: GALLERIES,
    queries: [Query.limit(MAX_GALLERIES)],
  });
  return rows;
}

export function createGallery(name: string) {
  return tables.createRow<Gallery>({
    databaseId: DATABASE,
    tableId: GALLERIES,
    rowId: ID.unique(),
    data: { name },
    permissions: ownerOnly(),
  });
}

/** Deletes the photos inside first, then the gallery itself. */
export async function deleteGallery(gallery: Gallery) {
  let photos = await listPhotos(gallery.$id);
  while (photos.length) {
    for (const photo of photos) await deletePhoto(photo);
    photos = await listPhotos(gallery.$id);
  }
  await tables.deleteRow({ databaseId: DATABASE, tableId: GALLERIES, rowId: gallery.$id });
}

/* Photos ------------------------------------------------------------------ */

/** One page, newest first. Pass the last photo you have to get the page after it. */
export async function listPhotos(galleryId: string, after?: Photo) {
  const queries = [Query.equal("galleryId", galleryId), Query.orderDesc("$createdAt"), Query.limit(PAGE_SIZE)];
  if (after) queries.push(Query.cursorAfter(after.$id));
  const { rows } = await tables.listRows<Photo>({ databaseId: DATABASE, tableId: PHOTOS, queries });
  return rows;
}

/** The bytes go to Storage; a row describing the file goes to TablesDB. */
export async function uploadPhoto(galleryId: string, file: File) {
  const permissions = ownerOnly();
  const uploaded = await storage.createFile({ bucketId: BUCKET, fileId: ID.unique(), file, permissions });
  return tables.createRow<Photo>({
    databaseId: DATABASE,
    tableId: PHOTOS,
    rowId: ID.unique(),
    data: { galleryId, fileId: uploaded.$id, name: file.name },
    permissions,
  });
}

export async function deletePhoto(photo: Photo) {
  await tables.deleteRow({ databaseId: DATABASE, tableId: PHOTOS, rowId: photo.$id });
  await storage.deleteFile({ bucketId: BUCKET, fileId: photo.fileId });
}

/* Files ------------------------------------------------------------------- */

export function thumbnailUrl(photo: Photo) {
  return storage.getFilePreview({ bucketId: BUCKET, fileId: photo.fileId, width: 600, height: 600 });
}

export function fileUrl(photo: Photo) {
  return storage.getFileView({ bucketId: BUCKET, fileId: photo.fileId });
}

export function downloadUrl(photo: Photo) {
  return storage.getFileDownload({ bucketId: BUCKET, fileId: photo.fileId });
}

/* Helpers ------------------------------------------------------------------- */

export const showError = (e: Error) => alert(e.message);
