"use client";

import { useState } from "react";
import { like } from "../actions.ts";

// A Client Component that calls a Server Action: it posts to the page it is
// on, through Next's router. Without a page, it shows why it could not.
export function Like() {
  const [likes, setLikes] = useState(0);
  const [error, setError] = useState<string>();
  return (
    <>
      <button
        onClick={() => like(likes).then(setLikes, (thrown: Error) => setError(thrown.message))}
      >
        Likes: {likes}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
