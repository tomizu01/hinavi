export type CharacterId = 'misaki' | 'hiyori';

export type PromptVariant = 1 | 2;

export interface Character {
  id: CharacterId;
  displayName: string;
  imagePath: string;
  voicevoxSpeakerId: number;
  elevenLabsVoiceId: string;
  promptPaths: Record<PromptVariant, string>;
}

export const CHARACTERS: Record<CharacterId, Character> = {
  misaki: {
    id: 'misaki',
    displayName: 'みさき',
    imagePath: '/characters/misaki.png',
    voicevoxSpeakerId: 2,
    elevenLabsVoiceId: 'ugYcuAusTuWCSOpJD0Xd',
    promptPaths: {
      1: 'prompts/characters/misaki1.md',
      2: 'prompts/characters/misaki2.md',
    },
  },
  hiyori: {
    id: 'hiyori',
    displayName: 'ひより',
    imagePath: '/characters/hiyori.png',
    voicevoxSpeakerId: 8,
    elevenLabsVoiceId: 'OSwaPSNdfituxkWcjlkR',
    promptPaths: {
      1: 'prompts/characters/hiyori1.md',
      2: 'prompts/characters/hiyori2.md',
    },
  },
};

export const TURN_ORDER: CharacterId[] = ['misaki', 'hiyori'];
