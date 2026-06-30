export type CharacterId = 'misaki' | 'hiyori';

export interface Character {
  id: CharacterId;
  displayName: string;
  imagePath: string;
  aivisModelUuid: string;
  promptPath: string;
}

export const CHARACTERS: Record<CharacterId, Character> = {
  misaki: {
    id: 'misaki',
    displayName: 'みさき',
    imagePath: '/characters/misaki.png',
    aivisModelUuid: 'e9339137-2ae3-4d41-9394-fb757a7e61e6',
    promptPath: 'prompts/characters/misaki.md',
  },
  hiyori: {
    id: 'hiyori',
    displayName: 'ひより',
    imagePath: '/characters/hiyori.png',
    aivisModelUuid: 'a670e6b8-0852-45b2-8704-1bc9862f2fe6',
    promptPath: 'prompts/characters/hiyori.md',
  },
};

export const TURN_ORDER: CharacterId[] = ['misaki', 'hiyori'];
