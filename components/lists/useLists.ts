"use client";

import { useEffect, useState } from "react";
import { watchListItems, watchLists } from "@/lib/data/lists";
import type { ListItem, TripList } from "@/lib/model/lists";

/** A trip's checklists and their items, live on both phones. */
export function useLists(tripId: string): { lists: TripList[]; items: ListItem[] } {
  const [lists, setLists] = useState<TripList[]>([]);
  const [items, setItems] = useState<ListItem[]>([]);
  useEffect(() => {
    const a = watchLists(tripId, setLists);
    const b = watchListItems(tripId, setItems);
    return () => {
      a();
      b();
    };
  }, [tripId]);
  return { lists, items };
}
