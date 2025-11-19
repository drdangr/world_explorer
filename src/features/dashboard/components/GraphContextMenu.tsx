import React, { useEffect, useRef } from "react";

interface GraphContextMenuProps {
    x: number;
    y: number;
    onClose: () => void;
    onAction: (action: "edit" | "delete") => void;
}

export function GraphContextMenu({ x, y, onClose, onAction }: GraphContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [onClose]);

    return (
        <div
            ref={menuRef}
            className="absolute z-50 min-w-[160px] overflow-hidden rounded-md border border-slate-700 bg-slate-900 shadow-xl"
            style={{ top: y, left: x }}
        >
            <div className="p-1">
                <button
                    onClick={() => onAction("edit")}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-emerald-400"
                >
                    <EditIcon className="h-4 w-4" />
                    Редактировать
                </button>
                <button
                    onClick={() => onAction("delete")}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-300 hover:bg-red-900/30 hover:text-red-400"
                >
                    <TrashIcon className="h-4 w-4" />
                    Удалить
                </button>
            </div>
        </div>
    );
}

function EditIcon({ className }: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                d="M11.05 3l-6.842 7.242c-.258.273-.422.628-.472 1.002l-.53 3.96c-.06.45.325.835.775.775l3.96-.53c.374-.05.729-.214 1.002-.472L16.242 7.75 11.05 3zM11.05 3L15 6.95"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function TrashIcon({ className }: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                d="M3 6h14M8 6V4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2m3 0v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h10zM10 11v5M14 11v5M6 11v5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
