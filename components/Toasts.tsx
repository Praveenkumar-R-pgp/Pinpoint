"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { Icon } from "./ui";

export default function Toasts() {
  const { state } = useStore();
  const [shown, setShown] = useState<{ id: number; items: { tone: string; text: string }[] } | null>(null);
  useEffect(() => {
    if (!state.toast) return;
    setShown(state.toast);
    const t = setTimeout(() => setShown(null), 6500);
    return () => clearTimeout(t);
  }, [state.toast?.id]);
  if (!shown) return null;
  return (
    <div className="toasts" role="status">
      <div className="toast">
        <button className="icon-btn toast-x" onClick={() => setShown(null)} aria-label="Dismiss"><Icon name="x" size={14} /></button>
        {shown.items.map((it, k) => (
          <div key={k} className={`toast-i t-${it.tone}`}>
            <span className="t-dot" />
            <span>{it.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
