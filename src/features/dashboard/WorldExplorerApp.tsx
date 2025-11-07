"use client";

import { useEffect } from "react";

import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

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
      <PanelGroup direction="horizontal" className="flex h-full w-full">
        <Panel defaultSize={22} minSize={16} maxSize={32} className="flex h-full min-w-[16rem] max-w-md">
          <Sidebar />
        </Panel>
        <ResizeHandle />
        <Panel defaultSize={48} minSize={32} className="flex h-full min-w-0">
          <ChatPanel />
        </Panel>
        <ResizeHandle />
        <Panel defaultSize={30} minSize={20} maxSize={44} className="flex h-full min-w-0">
          <GraphPanel />
        </Panel>
      </PanelGroup>

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

function ResizeHandle() {
  return (
    <PanelResizeHandle className="group relative z-10 flex w-2 cursor-col-resize items-center justify-center">
      <span className="pointer-events-none h-full w-px rounded bg-slate-800 transition group-data-[panel-resize-handle-active=true]:bg-emerald-400" />
    </PanelResizeHandle>
  );
}

