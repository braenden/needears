// Signing in with Google, and connecting it in Settings: Google's code
// client opens Google's account chooser in a popup and hands back a one
// time code, which our server swaps for Google's ID token.

// In English like the site.
export const GSI_SCRIPT = "https://accounts.google.com/gsi/client?hl=en";

export const POPUP_BLOCKED =
  "Your browser blocked Google's window. Allow pop-ups for this site and try again.";

export type GoogleCodeResponse = {
  code?: string;
  state?: string;
  error?: string;
};

export type GoogleOAuth2 = {
  initCodeClient: (config: {
    client_id: string;
    scope: string;
    ux_mode: "popup";
    select_account: boolean;
    state: string;
    callback: (response: GoogleCodeResponse) => void;
    error_callback?: (error: { type?: string }) => void;
  }) => { requestCode: () => void };
};

declare global {
  interface Window {
    google?: { accounts: { oauth2?: GoogleOAuth2 } };
  }
}

/** Google's G, for the Google row in Settings. */
export function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1 .7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.9l4-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"
      />
    </svg>
  );
}
