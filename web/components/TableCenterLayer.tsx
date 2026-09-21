import { useEffect, useState, type ReactNode, type RefObject } from 'react';

interface TableCenterLayerProps {
  tableRef: RefObject<HTMLElement | null>;
  centerRef: RefObject<HTMLDivElement | null>;
  withDiscard: boolean;
  children: ReactNode;
}

/** Out of document flow; follows the visible center when a tall mobile table is scrolled. */
export function TableCenterLayer({
  tableRef,
  centerRef,
  withDiscard,
  children,
}: TableCenterLayerProps) {
  const [center, setCenter] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    const table = tableRef.current;
    if (table === null) return;
    let frame = 0;
    const measure = () => {
      const rect = table.getBoundingClientRect();
      const left = Math.max(rect.left, 0);
      const right = Math.min(rect.right, window.innerWidth);
      const top = Math.max(rect.top, 0);
      const bottom = Math.min(rect.bottom, window.innerHeight);
      const next = {
        left: (left + right) / 2 - rect.left - table.clientLeft,
        top: (top + bottom) / 2 - rect.top - table.clientTop,
      };
      setCenter((previous) =>
        previous?.left === next.left && previous.top === next.top ? previous : next,
      );
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(table);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    measure();
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [tableRef]);

  return (
    <div
      className={`table-center-layer${withDiscard ? ' table-center-layer--with-discard' : ''}`}
      style={center ?? undefined}
      ref={centerRef}
    >
      {children}
    </div>
  );
}
