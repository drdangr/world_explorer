import React, { type FormEvent, useEffect, useState } from "react";
import { Modal } from "./Modal";

interface LocationSettingsModalProps {
    open: boolean;
    onClose: () => void;
    locationName: string;
    mapDescription: string;
    availableLocations: Array<{ id: string; name: string }>;
    existingConnections: Array<{ id: string; targetName: string; label?: string }>;
    onSave: (
        name: string,
        mapDescription: string,
        newConnectionTargetId?: string,
        deletedConnectionIds?: string[],
    ) => Promise<void>;
}

export function LocationSettingsModal({
    open,
    onClose,
    locationName,
    mapDescription,
    availableLocations,
    existingConnections,
    onSave,
}: LocationSettingsModalProps) {
    const [name, setName] = useState(locationName);
    const [description, setDescription] = useState(mapDescription);
    const [selectedTargetId, setSelectedTargetId] = useState<string>("");
    const [deletedConnectionIds, setDeletedConnectionIds] = useState<Set<string>>(new Set());
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (open) {
            setName(locationName);
            setDescription(mapDescription);
            setSelectedTargetId("");
            setDeletedConnectionIds(new Set());
        }
    }, [open, locationName, mapDescription]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setIsSaving(true);
        try {
            await onSave(
                name,
                description,
                selectedTargetId || undefined,
                Array.from(deletedConnectionIds),
            );
            onClose();
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemoveConnection = (id: string) => {
        setDeletedConnectionIds((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
        });
    };

    const visibleConnections = existingConnections.filter((c) => !deletedConnectionIds.has(c.id));

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Редактирование локации"
            description="Измените название и описание локации для карты."
            size="md"
        >
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="location-name" className="text-sm font-medium text-slate-300">
                        Название
                    </label>
                    <input
                        id="location-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        placeholder="Например: Тёмный лес"
                        required
                    />
                </div>

                <div className="flex flex-col gap-1.5">
                    <label htmlFor="location-desc" className="text-sm font-medium text-slate-300">
                        Описание для карты
                    </label>
                    <textarea
                        id="location-desc"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        className="resize-none rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        placeholder="Краткое описание, которое будет отображаться на карте..."
                    />
                </div>

                <div className="flex flex-col gap-1.5">
                    <label htmlFor="location-link" className="text-sm font-medium text-slate-300">
                        Связать с локацией (необязательно)
                    </label>
                    <select
                        id="location-link"
                        value={selectedTargetId}
                        onChange={(e) => setSelectedTargetId(e.target.value)}
                        className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                        <option value="">-- Не связывать --</option>
                        {availableLocations.map((loc) => (
                            <option key={loc.id} value={loc.id}>
                                {loc.name}
                            </option>
                        ))}
                    </select>
                </div>

                {visibleConnections.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-slate-300">Текущие связи</span>
                        <div className="flex flex-wrap gap-2">
                            {visibleConnections.map((conn) => (
                                <div
                                    key={conn.id}
                                    className="flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-200 border border-slate-700"
                                >
                                    <span>
                                        {conn.label ? `${conn.label} ` : ""}
                                        {conn.targetName}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveConnection(conn.id)}
                                        className="ml-1 rounded-full p-0.5 text-slate-400 hover:bg-slate-700 hover:text-red-400 focus:outline-none"
                                        aria-label="Удалить связь"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="12"
                                            height="12"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        >
                                            <line x1="18" y1="6" x2="6" y2="18"></line>
                                            <line x1="6" y1="6" x2="18" y2="18"></line>
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="mt-2 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
                    >
                        Отмена
                    </button>
                    <button
                        type="submit"
                        disabled={isSaving || !name.trim()}
                        className="flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-50"
                    >
                        {isSaving ? "Сохранение..." : "Сохранить"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
