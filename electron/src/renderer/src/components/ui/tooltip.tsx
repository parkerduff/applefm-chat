import React, { useState, useRef, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom";
}

export function Tooltip({ label, children, side = "bottom" }: TooltipProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout>>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleEnter = useCallback(() => {
    timeout.current = setTimeout(() => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (rect) {
        setPos({
          x: rect.left + rect.width / 2,
          y: side === "bottom" ? rect.bottom + 6 : rect.top - 6,
        });
      }
    }, 600);
  }, [side]);

  const handleLeave = useCallback(() => {
    if (timeout.current) clearTimeout(timeout.current);
    setPos(null);
  }, []);

  return (
    <div ref={wrapperRef} className="relative inline-flex" onMouseEnter={handleEnter} onMouseLeave={handleLeave} style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
      {children}
      {pos && createPortal(
        <span
          className="pointer-events-none fixed z-9999 -translate-x-1/2 whitespace-nowrap rounded bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md border"
          style={{
            left: pos.x,
            top: side === "bottom" ? pos.y : undefined,
            bottom: side === "top" ? `calc(100vh - ${pos.y}px)` : undefined,
          }}
        >
          {label}
        </span>,
        document.body
      )}
    </div>
  );
}
