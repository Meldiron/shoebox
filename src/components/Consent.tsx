import { useEffect, useState } from "react";
import { useAuthUI } from "@getauthui/core/react";
import {
  approveGrant,
  createGrant,
  getApp,
  getGrant,
  rejectGrant,
  showError,
  type App,
  type Grant,
} from "../lib/appwrite";

const SCOPE_LABELS: Record<string, string> = {
  openid: "Confirm who you are",
  profile: "See your name",
  email: "See your email address",
  phone: "See your phone number",
};

const button = "h-10 flex-1 rounded-lg text-sm font-medium transition-colors";

/**
 * OAuth2 consent screen. Appwrite sends users here with either a grant_id
 * (signed in) or the client's original authorize parameters (signed out).
 */
export default function Consent() {
  const { status, user, open } = useAuthUI();
  const [grant, setGrant] = useState<Grant>();
  const [app, setApp] = useState<App>();
  const params = new URLSearchParams(location.search);
  const grantId = params.get("grant_id");

  useEffect(() => {
    if (!user) return;
    if (!grantId) {
      // Signed in without a grant yet: turn the forwarded request into one.
      createGrant(params)
        .then(({ grantId, redirectUrl }) => location.replace(redirectUrl || `?grant_id=${grantId}`))
        .catch(showError);
      return;
    }
    getGrant(grantId)
      .then(async (g) => {
        setGrant(g);
        setApp(await getApp(g.appId));
      })
      .catch(showError);
  }, [user, grantId]);

  const decide = (action: (id: string) => Promise<string>) =>
    action(grant!.$id).then((url) => location.assign(url), showError);

  if (status === "loading") return null;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6">
        <p className="text-sm font-semibold tracking-tight">Shoebox</p>

        {!user ? (
          <>
            <h1 className="mt-4 text-lg font-semibold">Sign in to continue</h1>
            <p className="mt-1 text-sm text-neutral-400">An app is asking to use your Shoebox account.</p>
            <button
              onClick={() => open()}
              className={`${button} mt-6 w-full bg-neutral-100 text-neutral-900 hover:bg-white`}
            >
              Sign in
            </button>
          </>
        ) : !grant || !app ? (
          <p className="mt-4 text-sm text-neutral-400">Loading…</p>
        ) : (
          <>
            <h1 className="mt-4 text-lg font-semibold">
              {app.name} wants to access your account
            </h1>
            {app.tagline && <p className="mt-1 text-sm text-neutral-400">{app.tagline}</p>}

            <ul className="mt-5 flex flex-col gap-2 text-sm text-neutral-300">
              {grant.scopes.map((scope) => (
                <li key={scope} className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-neutral-500" />
                  {SCOPE_LABELS[scope] ?? scope}
                </li>
              ))}
            </ul>

            <div className="mt-6 flex gap-2">
              <button
                onClick={() => decide(rejectGrant)}
                className={`${button} border border-neutral-800 text-neutral-300 hover:bg-neutral-800`}
              >
                Deny
              </button>
              <button
                onClick={() => decide(approveGrant)}
                className={`${button} bg-neutral-100 text-neutral-900 hover:bg-white`}
              >
                Allow
              </button>
            </div>
            <p className="mt-4 text-center text-xs text-neutral-500">Signed in as {user.email}</p>
          </>
        )}
      </div>
    </div>
  );
}
