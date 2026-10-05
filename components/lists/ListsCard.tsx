"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import {
  addFromTemplate,
  addList,
  addListItem,
  deleteList,
  deleteListItem,
  resetList,
  toggleListItem,
} from "@/lib/data/lists";
import { progress, sortListItems, templatesFor, type ListItem, type TripList } from "@/lib/model/lists";
import { who } from "@/lib/model/history";
import { useLists } from "./useLists";

/**
 * Checklists, shared by both phones: a summary card that opens the lists.
 * `focus` opens straight onto one list by title (Today's "before you roll").
 */
export default function ListsCard({
  tripId,
  modes,
  email,
  focus,
}: {
  tripId: string;
  modes: string[];
  email: string;
  focus?: string;
}) {
  const { lists, items } = useLists(tripId);
  const [open, setOpen] = useState<string | "all" | null>(null);
  const focused = focus ? lists.find((l) => l.title === focus) : undefined;

  // On Today, only show the card when the list it's about exists.
  if (focus && !focused) return null;

  const shown = focused ? [focused] : lists;
  return (
    <section aria-label={focused ? focused.title : "Checklists"} className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-semibold">{focused ? focused.title : "Checklists"}</h2>
      {shown.length === 0 ? (
        <p className="mt-1 text-sm text-muted">Packing, getting the van ready, your own. Shared and ticked off live on both phones.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {shown.map((l) => {
            const p = progress(items.filter((i) => i.listId === l.id));
            return (
              <li key={l.id}>
                <button type="button" onClick={() => setOpen(l.id)} className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-sm">
                  <span className="font-medium">{l.title}</span>
                  <span className={p.total && p.done === p.total ? "font-semibold text-ok" : "text-muted"}>
                    {p.done} of {p.total} ›
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!focused && (
        <button type="button" onClick={() => setOpen("all")} className="mt-1 min-h-11 text-sm font-medium text-accent">
          {lists.length ? "Add a list ›" : "Start a checklist ›"}
        </button>
      )}
      {open && (
        <ListsSheet
          tripId={tripId}
          modes={modes}
          email={email}
          lists={lists}
          items={items}
          openId={open === "all" ? null : open}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}

function ListsSheet({
  tripId,
  modes,
  email,
  lists,
  items,
  openId,
  onClose,
}: {
  tripId: string;
  modes: string[];
  email: string;
  lists: TripList[];
  items: ListItem[];
  openId: string | null;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState<string | null>(openId);
  const [newTitle, setNewTitle] = useState("");
  const list = lists.find((l) => l.id === current);
  const nextOrder = lists.reduce((m, l) => Math.max(m, l.order), -1) + 1;

  if (list) return <ListView tripId={tripId} email={email} list={list} items={sortListItems(items.filter((i) => i.listId === list.id))} onBack={() => setCurrent(null)} onClose={onClose} />;

  const offers = templatesFor(modes, lists.map((l) => l.title));
  return (
    <Sheet title="Checklists" onClose={onClose}>
      <div className="space-y-4 pb-2">
        {lists.length > 0 && (
          <ul className="space-y-2">
            {lists.map((l) => {
              const p = progress(items.filter((i) => i.listId === l.id));
              return (
                <li key={l.id}>
                  <button type="button" onClick={() => setCurrent(l.id)} className="flex min-h-12 w-full items-center justify-between rounded-xl border border-border px-3 text-left text-sm">
                    <span className="font-medium">{l.title}</span>
                    <span className="text-muted">
                      {p.done} of {p.total} ›
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {offers.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Start from</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {offers.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setCurrent(addFromTemplate(tripId, t, nextOrder, email))}
                  className="min-h-10 rounded-full border border-border px-3 text-sm"
                >
                  + {t.title}
                </button>
              ))}
            </div>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newTitle.trim()) return;
            setCurrent(addList(tripId, newTitle, false, [], nextOrder, email));
            setNewTitle("");
          }}
          className="flex gap-2"
        >
          <input
            aria-label="New list name"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Your own list, e.g. Groceries"
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-border bg-bg px-3 text-base outline-none focus:border-accent"
          />
          <button type="submit" disabled={!newTitle.trim()} className="min-h-12 shrink-0 rounded-xl border border-border px-4 font-medium disabled:opacity-50">
            Add
          </button>
        </form>
      </div>
    </Sheet>
  );
}

function ListView({
  tripId,
  email,
  list,
  items,
  onBack,
  onClose,
}: {
  tripId: string;
  email: string;
  list: TripList;
  items: ListItem[];
  onBack: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Ticks show the moment you tap; the saved value takes over once it arrives.
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const shown = items.map((i) => (i.id in ticked && ticked[i.id] !== i.done ? { ...i, done: ticked[i.id] } : i));
  const p = progress(shown);
  const nextOrder = items.reduce((m, i) => Math.max(m, i.order), -1) + 1;

  return (
    <Sheet title={list.title} onClose={onClose}>
      <div className="space-y-3 pb-2">
        <div className="flex items-center justify-between text-sm">
          <button type="button" onClick={onBack} className="min-h-11 font-medium text-accent">
            ‹ All lists
          </button>
          <span className={p.total && p.done === p.total ? "font-semibold text-ok" : "text-muted"}>
            {p.done} of {p.total} done
          </span>
        </div>
        <ul className="space-y-1">
          {shown.map((i) => (
            <li key={i.id} className="flex items-center gap-2">
              <label className="flex min-h-12 flex-1 cursor-pointer items-center gap-3 rounded-xl px-1">
                <input
                  type="checkbox"
                  checked={i.done}
                  onChange={() => {
                    setTicked((t) => ({ ...t, [i.id]: !i.done }));
                    toggleListItem(tripId, i, email);
                  }}
                  className="h-6 w-6 shrink-0 accent-[var(--accent)]"
                />
                <span className={`text-sm ${i.done ? "text-muted line-through" : ""}`}>
                  {i.text}
                  {i.done && i.doneBy && i.doneBy !== email.toLowerCase() && <span className="ml-1 text-xs no-underline">({who(i.doneBy, email)})</span>}
                </span>
              </label>
              <button type="button" aria-label={`Remove ${i.text}`} onClick={() => deleteListItem(tripId, i.id)} className="h-11 w-9 shrink-0 text-muted">
                ×
              </button>
            </li>
          ))}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            addListItem(tripId, list.id, text, nextOrder);
            setText("");
          }}
          className="flex gap-2"
        >
          <input
            aria-label="Add to this list"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add something"
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-border bg-bg px-3 text-base outline-none focus:border-accent"
          />
          <button type="submit" disabled={!text.trim()} className="min-h-12 shrink-0 rounded-xl border border-border px-4 font-medium disabled:opacity-50">
            Add
          </button>
        </form>
        <div className="flex gap-2 pt-2">
          {p.done > 0 && (
            <button
              type="button"
              onClick={() => {
                setTicked(Object.fromEntries(items.map((i) => [i.id, false])));
                resetList(tripId, shown);
              }}
              className="min-h-11 flex-1 rounded-xl border border-border text-sm font-medium"
            >
              {list.repeat ? "Reset for next time" : "Untick all"}
            </button>
          )}
          {confirmDelete ? (
            <button
              type="button"
              onClick={() => {
                deleteList(tripId, list.id, items);
                onBack();
              }}
              className="min-h-11 flex-1 rounded-xl bg-warn text-sm font-semibold text-on-accent"
            >
              Delete this list
            </button>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="min-h-11 flex-1 rounded-xl border border-border text-sm text-muted">
              Delete list
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
