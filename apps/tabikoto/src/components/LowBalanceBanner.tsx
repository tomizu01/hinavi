'use client';

interface Props {
  points: number;
  onPurchase: () => void;
}

export default function LowBalanceBanner({ points, onPurchase }: Props) {
  return (
    <div className="absolute top-12 left-2 right-2 z-[1100] flex items-center gap-2 px-3 py-2 rounded-md bg-amber-700/90 text-white text-xs shadow-lg backdrop-blur-sm">
      <span className="flex-1">
        コトポ残量が少なくなっています（残 {points.toLocaleString()}）
      </span>
      <button
        onClick={onPurchase}
        className="px-2 py-1 rounded bg-white/20 hover:bg-white/30 font-semibold"
      >
        チャージ
      </button>
    </div>
  );
}
