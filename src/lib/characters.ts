export type CharacterId = 'misaki' | 'hiyori';

export interface Character {
  id: CharacterId;
  displayName: string;
  imagePath: string;
  voicevoxSpeakerId: number;
  promptPath: string;
}

export const CHARACTERS: Record<CharacterId, Character> = {
  misaki: {
    id: 'misaki',
    displayName: 'みさき',
    imagePath: '/characters/misaki.png',
    voicevoxSpeakerId: 2,
    promptPath: 'prompts/characters/misaki.md',
  },
  hiyori: {
    id: 'hiyori',
    displayName: 'ひより',
    imagePath: '/characters/hiyori.png',
    voicevoxSpeakerId: 8,
    promptPath: 'prompts/characters/hiyori.md',
  },
};

export const TURN_ORDER: CharacterId[] = ['misaki', 'hiyori'];
