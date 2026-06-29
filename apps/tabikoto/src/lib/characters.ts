export type CharacterId = 'misaki' | 'hinata';

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
  hinata: {
    id: 'hinata',
    displayName: 'ひなた',
    imagePath: '/characters/hinata.png',
    aivisModelUuid: 'a670e6b8-0852-45b2-8704-1bc9862f2fe6',
    elevenLabsVoiceId: 'OSwaPSNdfituxkWcjlkR',
    promptPath: 'prompts/characters/hinata.md',
  },
};

export const TURN_ORDER: CharacterId[] = ['misaki', 'hinata'];
