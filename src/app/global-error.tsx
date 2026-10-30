"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/monitoring/report-error";

// Last resort when the root layout itself fails. No app styles load here,
// so it keeps to plain HTML.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error);
  }, [error]);
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          background: "#171513",
          color: "#eee9e2",
          display: "grid",
          placeItems: "center",
          minHeight: "100vh",
          margin: 0,
        }}
      >
        <main style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 22 }}>Something broke on our side.</h1>
          <p>Try again, or come back in a minute.</p>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 12, padding: "8px 14px", borderRadius: 8 }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
