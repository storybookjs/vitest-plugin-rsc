"use client";

import { use, useState } from "react";

export function Like({
  likesPromise,
  onLike,
}: {
  likesPromise: Promise<number>;
  onLike: (count: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  const likes = use(likesPromise);
  return (
    <>
      <button onClick={() => setOpen(!open)}>Toggle</button>
      {open && (
        <>
          <button onClick={() => onLike(likes + 1)}>Like</button>
          <span>{likes === 0 ? "" : ` +${likes} `}</span>
        </>
      )}
    </>
  );
}
