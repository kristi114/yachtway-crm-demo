import type { RelatedType, Task } from "@/lib/mock-data";
import { TASKS } from "@/lib/mock-data";

const store: Task[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribeTasks(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getTasksSnapshot(): Task[] {
  return store;
}

export function tasksFor(type: RelatedType, id: string): Task[] {
  const added = store.filter((t) => t.relatedType === type && t.relatedId === id);
  const seeded = TASKS.filter((t) => t.relatedType === type && t.relatedId === id);
  return [...added, ...seeded];
}

export function addTask(entry: Omit<Task, "id">): Task {
  const created: Task = {
    ...entry,
    id: `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
  };
  store.unshift(created);
  emit();
  return created;
}

export function updateTaskStatus(id: string, status: Task["status"]) {
  const inStore = store.find((t) => t.id === id);
  if (inStore) {
    inStore.status = status;
  } else {
    const seeded = TASKS.find((t) => t.id === id);
    if (seeded) seeded.status = status;
  }
  emit();
}
