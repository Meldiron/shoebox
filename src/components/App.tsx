import { useEffect, useState } from "react";
import { AuthUIUserButton, useAuthUI } from "@getauthui/core/react";
import { MAX_GALLERIES, createGallery, deleteGallery, listGalleries, showError, type Gallery } from "../lib/appwrite";
import { Photos } from "./Photos";

export default function App() {
  const { status, user, open } = useAuthUI();

  return (
    <>
      <header className="border-b border-neutral-800/80">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="/" className="font-semibold tracking-tight">
            Shoebox
          </a>
          <AuthUIUserButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        {status === "loading" ? null : user ? <Galleries key={user.$id} /> : <Preview onSignIn={() => open()} />}
      </main>
    </>
  );
}

const tab = "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors";
const tabActive = "bg-neutral-100 text-neutral-900";
const tabIdle = "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100";

function Galleries() {
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    listGalleries().then((rows) => {
      setGalleries(rows);
      setActiveId(rows[0]?.$id);
    }, showError);
  }, []);

  async function add(name: string) {
    const gallery = await createGallery(name);
    setGalleries([...galleries, gallery]);
    setActiveId(gallery.$id);
    setAdding(false);
  }

  async function remove(gallery: Gallery) {
    if (!confirm(`Delete "${gallery.name}" and its files?`)) return;
    await deleteGallery(gallery);
    const rest = galleries.filter((g) => g.$id !== gallery.$id);
    setGalleries(rest);
    setActiveId(rest[0]?.$id);
  }

  const active = galleries.find((g) => g.$id === activeId);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <div role="tablist" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {galleries.map((g) => (
            <button
              key={g.$id}
              role="tab"
              aria-selected={g.$id === activeId}
              onClick={() => setActiveId(g.$id)}
              className={`${tab} ${g.$id === activeId ? tabActive : tabIdle}`}
            >
              {g.name}
            </button>
          ))}
          {adding ? (
            <input
              autoFocus
              placeholder="Name"
              aria-label="New gallery"
              className="h-8 w-40 rounded-full bg-neutral-900 px-4 text-sm text-neutral-50 ring-1 ring-neutral-700 outline-none placeholder:text-neutral-500 focus:ring-neutral-500"
              onKeyDown={(e) => {
                const name = e.currentTarget.value.trim();
                if (e.key === "Enter" && name) add(name).catch(showError);
                if (e.key === "Escape") setAdding(false);
              }}
              onBlur={() => setAdding(false)}
            />
          ) : (
            galleries.length < MAX_GALLERIES && (
              <button onClick={() => setAdding(true)} aria-label="New gallery" className={`${tab} ${tabIdle} px-3`}>
                +
              </button>
            )
          )}
        </div>

        {active && (
          <button
            onClick={() => remove(active).catch(showError)}
            aria-label="Delete gallery"
            className="grid size-8 shrink-0 place-items-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-900 hover:text-red-300"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="size-4">
              <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12" />
            </svg>
          </button>
        )}
      </div>

      {active && <Photos key={active.$id} gallery={active} />}
    </div>
  );
}

const sampleTiles = [
  "bg-[radial-gradient(circle_at_30%_25%,var(--color-neutral-500),var(--color-neutral-900))]",
  "bg-linear-to-t from-neutral-600 via-neutral-800 to-neutral-900",
  "bg-linear-to-br from-neutral-700 to-neutral-900",
  "bg-[radial-gradient(circle_at_70%_70%,var(--color-neutral-600),var(--color-neutral-950))]",
  "bg-linear-to-tr from-neutral-900 via-neutral-600 to-neutral-900",
  "bg-linear-to-b from-neutral-600 to-neutral-950",
  "bg-[radial-gradient(circle_at_50%_100%,var(--color-neutral-500),var(--color-neutral-900))]",
  "bg-linear-to-bl from-neutral-700 to-neutral-900",
];

/** Signed-out view: a dimmed mock of the app with the sign-in button on top. */
function Preview({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="relative">
      <div className="flex flex-col gap-5 opacity-70 select-none" aria-hidden="true">
        <div className="flex items-center gap-1">
          <span className={`${tab} ${tabActive}`}>Trips</span>
          <span className={`${tab} ${tabIdle}`}>Family</span>
          <span className={`${tab} ${tabIdle}`}>Work</span>
          <span className={`${tab} ${tabIdle} px-3`}>+</span>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {sampleTiles.map((tile, i) => (
            <li key={i} className={`aspect-square rounded-xl border border-neutral-800 ${tile}`} />
          ))}
        </ul>
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-linear-to-b from-transparent via-neutral-950/40 to-neutral-950">
        <button
          onClick={onSignIn}
          className="rounded-lg bg-neutral-100 px-6 py-2.5 text-sm font-medium text-neutral-900 shadow-lg shadow-black/40 hover:bg-white"
        >
          Sign in
        </button>
      </div>
    </div>
  );
}
