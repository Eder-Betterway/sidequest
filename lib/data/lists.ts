"use client";

import { collection, deleteDoc, doc, orderBy, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { getFirebase } from "@/lib/firebase/client";
import type { ListDoc, ListItem, ListItemDoc, Template, TripList } from "@/lib/model/lists";
import { watchCollection } from "./watch";

function db() {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase isn't configured");
  return fb.db;
}

const fail = (what: string) => (err: unknown) => console.error(`Sidequest: ${what} failed`, err);

export function watchLists(tripId: string, onData: (rows: TripList[]) => void) {
  return watchCollection<ListDoc>(`trips/${tripId}/lists`, `lists-${tripId}`, [orderBy("order")], onData);
}

export function watchListItems(tripId: string, onData: (rows: ListItem[]) => void) {
  return watchCollection<ListItemDoc>(`trips/${tripId}/listItems`, `list-items-${tripId}`, [], onData);
}

/** A new list, empty or from a template, in one batch. */
export function addList(tripId: string, title: string, repeat: boolean, items: string[], order: number, me: string): string {
  const d = db();
  const batch = writeBatch(d);
  const ref = doc(collection(d, "trips", tripId, "lists"));
  const now = Date.now();
  const list: ListDoc = { title: title.trim().slice(0, 80), repeat, order, createdBy: me, createdAt: now };
  batch.set(ref, list);
  items.forEach((text, i) => {
    const item: ListItemDoc = { listId: ref.id, text: text.slice(0, 200), done: false, doneBy: null, order: i, updatedAt: now };
    batch.set(doc(collection(d, "trips", tripId, "listItems")), item);
  });
  batch.commit().catch(fail("adding the list"));
  return ref.id;
}

export function addFromTemplate(tripId: string, t: Template, order: number, me: string): string {
  return addList(tripId, t.title, t.repeat, t.items, order, me);
}

export function addListItem(tripId: string, listId: string, text: string, order: number) {
  const item: ListItemDoc = { listId, text: text.trim().slice(0, 200), done: false, doneBy: null, order, updatedAt: Date.now() };
  setDoc(doc(collection(db(), "trips", tripId, "listItems")), item).catch(fail("adding to the list"));
}

export function toggleListItem(tripId: string, item: Pick<ListItem, "id" | "done">, me: string) {
  updateDoc(doc(db(), "trips", tripId, "listItems", item.id), {
    done: !item.done,
    doneBy: item.done ? null : me,
    updatedAt: Date.now(),
  }).catch(fail("ticking the item"));
}

export function deleteListItem(tripId: string, id: string) {
  deleteDoc(doc(db(), "trips", tripId, "listItems", id)).catch(fail("removing the item"));
}

/** Untick everything (for lists you run every move). */
export function resetList(tripId: string, items: Pick<ListItem, "id" | "done">[]) {
  const batch = writeBatch(db());
  const now = Date.now();
  for (const i of items) if (i.done) batch.update(doc(db(), "trips", tripId, "listItems", i.id), { done: false, doneBy: null, updatedAt: now });
  batch.commit().catch(fail("resetting the list"));
}

export function deleteList(tripId: string, listId: string, items: Pick<ListItem, "id">[]) {
  const batch = writeBatch(db());
  for (const i of items) batch.delete(doc(db(), "trips", tripId, "listItems", i.id));
  batch.delete(doc(db(), "trips", tripId, "lists", listId));
  batch.commit().catch(fail("deleting the list"));
}
