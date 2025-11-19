"use client";

"use client";

import { format } from "date-fns";
import { ru } from "date-fns/locale";

import { Modal } from "./Modal";

export interface SessionMeta {
    fileName: string;
    characterId: string;
    worldId: string;
    startedAt: string;
    entryCount?: number;
    lastMessage?: string;
}

interface SessionSelectionModalProps {
    open: boolean;
    sessions: SessionMeta[];
    onSelect: (sessionId: string) => void;
    onNewSession: () => void;
    onClose: () => void;
}

export function SessionSelectionModal({
    open,
    sessions,
    onSelect,
    onNewSession,
    onClose,
}: SessionSelectionModalProps) {
    return (
        <Modal open={open} onClose={onClose} title="Выбор сессии">
            <div className="flex flex-col gap-4">
                <p className="text-sm text-slate-400">
                    В этом мире у вас уже есть сохраненные приключения. Вы хотите продолжить одно из них или
                    начать заново?
                </p>

                <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
                    {sessions.map((session) => {
                        let formattedDate: string;
                        try {
                            const date = new Date(session.startedAt);
                            if (isNaN(date.getTime())) {
                                formattedDate = session.startedAt;
                            } else {
                                formattedDate = format(date, "d MMMM yyyy, HH:mm", { locale: ru });
                            }
                        } catch {
                            formattedDate = session.startedAt;
                        }

                        return (
                            <button
                                key={session.fileName}
                                onClick={() => onSelect(session.fileName)}
                                className="flex flex-col items-start gap-1 rounded border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-left transition hover:border-emerald-500/50 hover:bg-emerald-500/10"
                            >
                                <div className="flex items-center justify-between w-full">
                                    <span className="text-sm font-medium text-slate-200">
                                        {formattedDate}
                                    </span>
                                    {session.entryCount !== undefined && (
                                        <span className="text-xs text-slate-500">
                                            {session.entryCount} {session.entryCount === 1 ? "шаг" : "шагов"}
                                        </span>
                                    )}
                                </div>
                                {session.lastMessage && (
                                    <p className="text-xs text-slate-400 line-clamp-2">
                                        {session.lastMessage}
                                    </p>
                                )}
                            </button>
                        );
                    })}
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <button
                        type="button"
                        onClick={onNewSession}
                        className="rounded px-4 py-2 text-sm font-medium text-emerald-400 transition hover:text-emerald-300"
                    >
                        Начать новую игру
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
                    >
                        Отмена
                    </button>
                </div>
            </div>
        </Modal>
    );
}
