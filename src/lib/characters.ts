export type CharacterId = 'misaki' | 'hiyori';

export interface Character {
  id: CharacterId;
  displayName: string;
  imagePath: string;
  aivisModelUuid: string;
  elevenLabsVoiceId: string;
  promptPath: string;
}

export const CHARACTERS: Record<CharacterId, Character> = {
  misaki: {
    id: 'misaki',
    displayName: 'みさき',
    imagePath: '/characters/misaki.png',
    aivisModelUuid: 'e9339137-2ae3-4d41-9394-fb757a7e61e6',
    elevenLabsVoiceId: 'ugYcuAusTuWCSOpJD0Xd',
    promptPath: 'prompts/characters/misaki.md',
  },
  hiyori: {
    id: 'hiyori',
    displayName: 'ひより',
    imagePath: '/characters/hiyori.png',
    aivisModelUuid: '734c12b6-eaf2-4dbd-8596-8663c72d2afa',
    elevenLabsVoiceId: 'OSwaPSNdfituxkWcjlkR',
    promptPath: 'prompts/characters/hiyori.md',
  },
};

export const TURN_ORDER: CharacterId[] = ['misaki', 'hiyori'];
