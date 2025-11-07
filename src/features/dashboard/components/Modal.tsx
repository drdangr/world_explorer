"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useMemo } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: "md" | "lg";
  children: ReactNode;
}

export function Modal({ open, onClose, title, description, size = "md", children }: ModalProps) {
  const titleId = useId();
  const descriptionId = description ? `${titleId}-description` : undefined;

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const widthClass = useMemo(() => {
    switch (size) {
      case "lg":
        return "max-w-5xl";
      default:
        return "max-w-3xl";
    }
  }, [size]);

  const portalTarget = typeof document === "undefined" ? null : document.body;

  if (!open || !portalTarget) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={`relative z-10 flex max-h-full w-full ${widthClass} flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-slate-100 shadow-xl shadow-slate-950/50`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-slate-100">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm text-slate-400">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-800 text-slate-400 transition hover:border-slate-600 hover:text-white"
            aria-label="Закрыть"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>,
    portalTarget,
  );
}

interface IconProps {
  className?: string;
}

function CloseIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M6 6l8 8M14 6l-8 8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

