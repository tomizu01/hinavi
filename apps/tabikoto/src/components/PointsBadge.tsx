'use client';

interface Props {
  points: number | null;
  low: boolean;
  onClick?: () => void;
}

export default function PointsBadge({ points, low, onClick }: Props) {
  const label = points === null ? '-' : points.toLocaleString();
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold shadow-md backdrop-blur-sm text-white ${
        low ? 'bg-amber-600/90 hover:bg-amber-500' : 'bg-neutral-800/80 hover:bg-neutral-700'
      }`}
      title="コトポ残高"
    >
      コトポ {label}
    </button>
  );
}
