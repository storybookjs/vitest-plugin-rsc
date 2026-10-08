"use client";

import { useTransition } from "react";
import { like } from "../actions.ts";

export function LikeButton({ id, likes }: { id: string; likes: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <button disabled={pending} onClick={() => startTransition(() => like(id))}>
      Likes: {likes}
    </button>
  );
}
