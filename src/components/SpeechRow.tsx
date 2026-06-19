'use client';

import Image from 'next/image';
import type { CharacterId } from '@/lib/characters';
import { CHARACTERS } from '@/lib/characters';

interface Props {
  speaker: CharacterId;
  text: string;
  side: 'left' | 'right';
}

export default function SpeechRow({ speaker, text, side }: Props) {
  const char = CHARACTERS[speaker];
  const charImg = (
    <Image
      src={char.imagePath}
      alt={char.displayName}
      width={70}
      height={81}
      sizes="70px"
      className="shrink-0 self-end rounded-lg"
      priority
    />
  );
  const bubble = (
    <div className="flex-1 min-w-0 bg-neutral-800 rounded-2xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words min-h-[3rem] flex items-center">
      {text || <span className="text-neutral-500">…</span>}
    </div>
  );
  return (
    <div className="flex items-end gap-2 px-2">
      {side === 'right' ? (
        <>
          {bubble}
          {charImg}
        </>
      ) : (
        <>
          {charImg}
          {bubble}
        </>
      )}
    </div>
  );
}
