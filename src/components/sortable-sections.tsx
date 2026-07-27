import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { GripVertical, RotateCcw, Save, Check, Pencil, Trash2, Plus, Layers } from "lucide-react";

// ==========================================================
// Dashboard section drag-and-drop reordering
// ----------------------------------------------------------
// - Order persists per user in localStorage
// - Uses native HTML5 drag & drop (no new deps)
// - Reconciles with the canonical section list so newly added
//   sections show up at the bottom and removed ones drop off
// ==========================================================

const MIME = "application/x-dashboard-section";
const storageKey = (userId: string) => `dashboard-order::${userId}`;

const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

function readOrder(userId: string, defaults: string[]): string[] {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) return defaults;
    const filtered = parsed.filter((id) => defaults.includes(id));
    for (const id of defaults) if (!filtered.includes(id)) filtered.push(id);
    return filtered;
  } catch {
    return defaults;
  }
}

export function useDashboardOrder(userId: string, defaults: string[]) {
  // We serialize the array into the snapshot so referential equality works
  // for useSyncExternalStore.
  const defaultsKey = defaults.join("|");
  const snapshot = useSyncExternalStore(
    subscribe,
    () => JSON.stringify(readOrder(userId, defaults)),
    () => JSON.stringify(defaults),
  );
  const order = JSON.parse(snapshot) as string[];

  const setOrder = (next: string[]) => {
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(next));
    } catch { /* ignore quota errors */ }
    emit();
  };
  const reset = () => {
    try { localStorage.removeItem(storageKey(userId)); } catch { /* noop */ }
    emit();
  };

  // Touch defaultsKey so lint knows we care about it for cache invalidation.
  void defaultsKey;
  return { order, setOrder, reset };
}

// ==========================================================
// Movable wrapper - one per section
// ==========================================================
export function MovableSection({
  id, order, setOrder, children, isEditing = false,
}: {
  id: string;
  order: string[];
  setOrder: (next: string[]) => void;
  children: ReactNode;
  isEditing?: boolean;
}) {

  const [dragOver, setDragOver] = useState<"before" | "after" | null>(null);
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const src = e.dataTransfer.getData(MIME);
    setDragOver(null);
    if (!src || src === id) return;
    const next = order.filter((x) => x !== src);
    const targetIdx = next.indexOf(id);
    if (targetIdx < 0) { next.push(src); }
    else {
      const insertAt = dragOver === "after" ? targetIdx + 1 : targetIdx;
      next.splice(insertAt, 0, src);
    }
    setOrder(next);
  };

  return (
    <div
      ref={ref}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setDragOver(e.clientY > rect.top + rect.height / 2 ? "after" : "before");
      }}
      onDragLeave={(e) => {
        // Only clear when leaving the container, not children
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null);
      }}
      onDrop={handleDrop}
      className={`group/movable relative mt-6 transition ${dragging ? "opacity-50" : ""}`}
    >
      {/* Insertion indicator */}
      {dragOver === "before" && (
        <div className="pointer-events-none absolute -top-3 left-0 right-0 h-1 rounded-full bg-brand shadow-[0_0_0_3px_hsl(var(--brand)/0.15)]" />
      )}
      {dragOver === "after" && (
        <div className="pointer-events-none absolute -bottom-3 left-0 right-0 h-1 rounded-full bg-brand shadow-[0_0_0_3px_hsl(var(--brand)/0.15)]" />
      )}

      {/* Drag handle - only visible while editing the dashboard layout */}
      {isEditing && (
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(MIME, id);
            e.dataTransfer.effectAllowed = "move";
            if (ref.current) {
              e.dataTransfer.setDragImage(ref.current, 24, 24);
            }
            setDragging(true);
          }}
          onDragEnd={() => { setDragging(false); setDragOver(null); }}
          title="Drag to reorder"
          className="absolute -top-3 left-4 z-10 inline-flex cursor-grab items-center gap-1 rounded-lg border border-border bg-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground shadow-sm opacity-0 transition hover:text-brand-deep group-hover/movable:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="h-3 w-3" /> Drag
        </div>
      )}


      {children}
    </div>
  );
}

// ==========================================================
// Small toolbar that lets the user reset the layout
// ==========================================================
export function LayoutResetButton({ onReset }: { onReset: () => void }) {
  return (
    <button
      type="button"
      onClick={onReset}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm transition hover:border-brand/40 hover:text-brand-deep"
      title="Reset dashboard layout to default"
    >
      <RotateCcw className="h-3 w-3" /> Reset layout
    </button>
  );
}

// ==========================================================
// Named saved views
// ----------------------------------------------------------
// Reps can save the current arrangement as a named view (e.g.
// "Pipeline focus", "Monday morning"), switch between saved
// views, rename, or delete them. Views persist per user.
// ==========================================================

export type DashboardView = { id: string; name: string; order: string[] };
type ViewsState = { views: DashboardView[]; activeId: string | null };

const viewsKey = (userId: string) => `dashboard-views::${userId}`;

function readViews(userId: string): ViewsState {
  if (typeof window === "undefined") return { views: [], activeId: null };
  try {
    const raw = localStorage.getItem(viewsKey(userId));
    if (!raw) return { views: [], activeId: null };
    const parsed = JSON.parse(raw) as ViewsState;
    if (!parsed || !Array.isArray(parsed.views)) return { views: [], activeId: null };
    return parsed;
  } catch {
    return { views: [], activeId: null };
  }
}

export function useDashboardViews(userId: string) {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => JSON.stringify(readViews(userId)),
    () => JSON.stringify({ views: [], activeId: null }),
  );
  const state = JSON.parse(snapshot) as ViewsState;

  const write = (next: ViewsState) => {
    try { localStorage.setItem(viewsKey(userId), JSON.stringify(next)); }
    catch { /* noop */ }
    emit();
  };

  return {
    views: state.views,
    activeId: state.activeId,
    saveAs: (name: string, order: string[]) => {
      const id = `v_${Date.now().toString(36)}`;
      const trimmed = name.trim() || "Untitled view";
      write({ views: [...state.views, { id, name: trimmed, order: [...order] }], activeId: id });
      return id;
    },
    update: (id: string, patch: Partial<DashboardView>) => {
      write({
        ...state,
        views: state.views.map((v) => (v.id === id ? { ...v, ...patch } : v)),
      });
    },
    remove: (id: string) => {
      write({
        views: state.views.filter((v) => v.id !== id),
        activeId: state.activeId === id ? null : state.activeId,
      });
    },
    setActive: (id: string | null) => write({ ...state, activeId: id }),
  };
}

// ==========================================================
// Full toolbar with saved views + save/reset controls
// ==========================================================
export function DashboardLayoutToolbar({
  userId, order, setOrder, onReset,
}: {
  userId: string;
  order: string[];
  setOrder: (next: string[]) => void;
  onReset: () => void;
}) {
  const { views, activeId, saveAs, update, remove, setActive } = useDashboardViews(userId);
  const activeView = views.find((v) => v.id === activeId) ?? null;
  const isDirty = activeView
    ? JSON.stringify(activeView.order) !== JSON.stringify(order)
    : views.length === 0 ? false : true;

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const handleSaveAs = () => {
    const name = window.prompt("Name this dashboard view", `View ${views.length + 1}`);
    if (name === null) return;
    saveAs(name, order);
  };

  const handleSaveOverActive = () => {
    if (!activeView) return handleSaveAs();
    update(activeView.id, { order: [...order] });
  };

  const applyView = (v: DashboardView) => {
    setOrder([...v.order]);
    setActive(v.id);
  };

  const handleRenameCommit = (id: string) => {
    const name = renameDraft.trim();
    if (name) update(id, { name });
    setRenamingId(null);
    setRenameDraft("");
  };

  return (
    <div className="mt-6 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-deep">
          <Layers className="h-3.5 w-3.5" /> Dashboard views
        </span>

        {/* View pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {views.length === 0 && (
            <span className="text-[11px] italic text-muted-foreground">
              No saved views yet - arrange the panels, then save your layout.
            </span>
          )}
          {views.map((v) => {
            const isActive = v.id === activeId;
            if (renamingId === v.id) {
              return (
                <input
                  key={v.id}
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={() => handleRenameCommit(v.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameCommit(v.id);
                    if (e.key === "Escape") { setRenamingId(null); setRenameDraft(""); }
                  }}
                  className="h-6 rounded-full border border-brand/40 bg-background px-2 text-[11px] font-medium text-brand-deep outline-none focus:ring-2 focus:ring-brand/30"
                />
              );
            }
            return (
              <span
                key={v.id}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${
                  isActive
                    ? "border-brand bg-brand/10 text-brand-deep shadow-sm"
                    : "border-border bg-surface text-muted-foreground hover:border-brand/40 hover:text-brand-deep"
                }`}
              >
                <button
                  type="button"
                  onClick={() => applyView(v)}
                  className="inline-flex items-center gap-1"
                  title={isActive ? "Currently applied" : `Apply "${v.name}"`}
                >
                  {isActive && <Check className="h-3 w-3" />}
                  {v.name}
                </button>
                {isActive && (
                  <>
                    <button
                      type="button"
                      onClick={() => { setRenamingId(v.id); setRenameDraft(v.name); }}
                      title="Rename view"
                      className="ml-0.5 rounded p-0.5 hover:bg-brand/10"
                    >
                      <Pencil className="h-2.5 w-2.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { if (window.confirm(`Delete view "${v.name}"?`)) remove(v.id); }}
                      title="Delete view"
                      className="rounded p-0.5 hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  </>
                )}
              </span>
            );
          })}
        </div>

        {/* Right-side actions */}
        <div className="ml-auto flex items-center gap-1.5">
          {activeView && isDirty && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
              Unsaved changes
            </span>
          )}
          {activeView && (
            <button
              type="button"
              onClick={handleSaveOverActive}
              disabled={!isDirty}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-[11px] font-semibold text-brand-foreground shadow-sm transition hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-50 ${
                isDirty ? "animate-pulse border-0 bg-brand" : "border border-brand bg-brand"
              }`}
              title={`Save changes to "${activeView.name}"`}
            >
              <Save className="h-3 w-3" /> Save
            </button>
          )}
          <button
            type="button"
            onClick={handleSaveAs}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-[11px] font-semibold shadow-sm transition ${
              isDirty
                ? "animate-pulse border-0 bg-brand text-brand-foreground hover:bg-brand-deep"
                : "border border-border bg-surface text-brand-deep hover:border-brand/40"
            }`}
            title={isDirty ? "You have unsaved changes - save your layout" : "Save current arrangement as a new view"}
          >
            <Plus className="h-3 w-3" /> Save as…
          </button>
          <button
            type="button"
            onClick={() => { onReset(); setActive(null); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm transition hover:border-brand/40 hover:text-brand-deep"
            title="Reset to default order"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Drag the <span className="font-semibold text-brand-deep">Drag</span> chip on any panel to rearrange, then save your layout as a named view you can jump back to.
      </p>
    </div>
  );
}
