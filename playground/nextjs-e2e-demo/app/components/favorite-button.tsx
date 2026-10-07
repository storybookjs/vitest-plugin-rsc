"use client";

import { useState, useTransition } from "react";
import { toggleFavorite } from "../lib/actions.ts";

export function FavoriteButton({ id, favorite: initial }: { id: string; favorite: boolean }) {
  const [favorite, setFavorite] = useState(initial);
  const [pending, startTransition] = useTransition();
  return (
    <button
      aria-pressed={favorite}
      disabled={pending}
      onClick={() => startTransition(async () => setFavorite(await toggleFavorite(id)))}
    >
      Favorite
    </button>
  );
}
