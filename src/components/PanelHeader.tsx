import type { ReactNode } from "react";

/** iOS large-title header shared by every side-panel view; `children` sit at
 *  the trailing edge (compose button, sort toggle…). */
export function PanelHeader({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <header className="panel-head">
      <div className="panel-head-text">
        <h1>{title}</h1>
        {sub && <span className="panel-sub">{sub}</span>}
      </div>
      {children && <div className="panel-head-actions">{children}</div>}
    </header>
  );
}
