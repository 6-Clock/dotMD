import { useCallback } from "react";
import { todoIndex, useStore } from "../store";
import { ContextMenu } from "./ContextMenu";

/** The right-click menu for a task card (To-do list, Board, Calendar).
 *  One instance, opened through `store.setTaskMenu`. */
export function TaskMenu() {
  const menu = useStore((s) => s.taskMenu);
  // Found again by identity on every change: if todo.md reloads while the
  // menu is open, it still acts on the task that was clicked (or closes).
  const index = useStore((s) => (s.taskMenu ? todoIndex(s.todos, s.taskMenu.todo) : -1));
  const todo = useStore((s) => (index >= 0 ? s.todos[index] : undefined));
  const close = useCallback(() => useStore.getState().setTaskMenu(null), []);

  if (!menu || !todo) return null;
  const st = useStore.getState();
  return (
    <ContextMenu
      x={menu.x}
      y={menu.y}
      onClose={close}
      items={[
        { label: todo.done ? "Mark not done" : "Mark done", onClick: () => st.toggleTodoAt(index) },
        { label: "Edit…", onClick: () => st.setEditingTodo(index) },
        { label: "-" },
        { label: "Delete", danger: true, onClick: () => st.deleteTodoAt(index) },
      ]}
    />
  );
}
