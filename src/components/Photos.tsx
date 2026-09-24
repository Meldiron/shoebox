import { useEffect, useState } from "react";
import {
  PAGE_SIZE,
  deletePhoto,
  downloadUrl,
  fileUrl,
  listPhotos,
  showError,
  thumbnailUrl,
  uploadPhoto,
  type Gallery,
  type Photo,
} from "../lib/appwrite";

export function Photos({ gallery }: { gallery: Gallery }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState<Photo>();

  useEffect(() => {
    listPhotos(gallery.$id).then((rows) => {
      setPhotos(rows);
      setHasMore(rows.length === PAGE_SIZE);
    }, showError);
  }, [gallery.$id]);

  async function loadMore() {
    const rows = await listPhotos(gallery.$id, photos[photos.length - 1]);
    setPhotos([...photos, ...rows]);
    setHasMore(rows.length === PAGE_SIZE);
  }

  async function upload(files: File[]) {
    setUploading(true);
    try {
      for (const file of files) {
        const photo = await uploadPhoto(gallery.$id, file);
        setPhotos((list) => [photo, ...list]);
      }
    } finally {
      setUploading(false);
    }
  }

  async function remove(photo: Photo) {
    if (!confirm(`Delete "${photo.name}"?`)) return;
    await deletePhoto(photo);
    setPhotos(photos.filter((p) => p.$id !== photo.$id));
    setOpen(undefined);
  }

  return (
    <div className="flex flex-col gap-4">
      <label
        className="flex cursor-pointer justify-center rounded-2xl border border-dashed border-neutral-800 py-6 text-sm text-neutral-400 transition-colors hover:border-neutral-600 hover:text-neutral-200"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          upload(Array.from(e.dataTransfer.files)).catch(showError);
        }}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => upload(Array.from(e.target.files ?? [])).catch(showError)}
        />
        {uploading ? "Uploading…" : "Drop files or click to upload"}
      </label>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo) => (
          <li key={photo.$id}>
            <button
              onClick={() => setOpen(photo)}
              className="block aspect-square w-full overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 transition-colors hover:border-neutral-600"
            >
              <img src={thumbnailUrl(photo)} alt={photo.name} className="size-full object-cover" />
            </button>
          </li>
        ))}
      </ul>

      {hasMore && (
        <button
          onClick={() => loadMore().catch(showError)}
          className="mx-auto rounded-full px-4 py-1.5 text-sm text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-100"
        >
          Load more
        </button>
      )}

      {open && <Lightbox photo={open} onClose={() => setOpen(undefined)} onDelete={() => remove(open).catch(showError)} />}
    </div>
  );
}

const action = "rounded-lg px-3 py-1.5 transition-colors hover:bg-neutral-800 hover:text-neutral-100";

function Lightbox({ photo, onClose, onDelete }: { photo: Photo; onClose: () => void; onDelete: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col gap-4 bg-black/95 p-4" onClick={onClose}>
      <div className="flex items-center justify-between gap-4 text-sm text-neutral-400" onClick={(e) => e.stopPropagation()}>
        <span className="truncate">{photo.name}</span>
        <div className="flex shrink-0 gap-1">
          <a href={downloadUrl(photo)} className={action}>
            Download
          </a>
          <button onClick={onDelete} className={`${action} hover:text-red-300`}>
            Delete
          </button>
          <button onClick={onClose} className={action} aria-label="Close">
            ×
          </button>
        </div>
      </div>
      <img src={fileUrl(photo)} alt={photo.name} className="min-h-0 flex-1 object-contain" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}
