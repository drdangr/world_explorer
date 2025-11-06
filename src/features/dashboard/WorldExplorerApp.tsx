"use client";

import { useEffect } from "react";

import { useGameStore } from "@/store/gameStore";

import { ChatPanel } from "./components/ChatPanel";
import { GraphPanel } from "./components/GraphPanel";
import { Sidebar } from "./components/Sidebar";

export function WorldExplorerApp() {
  const loadInitialData = useGameStore((state) => state.actions.loadInitialData);
  const isInitializing = useGameStore((state) => state.isInitializing);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  return (
    <div className="relative flex h-screen overflow-hidden bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex flex-1 min-h-0">
        <ChatPanel />
        <GraphPanel />
      </div>
      {isInitializing && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-sm text-slate-300">
            <span className="h-10 w-10 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-300" />
            <p>Загружаем локальные данные…</p>
          </div>
        </div>
      )}
    </div>
  );
}

