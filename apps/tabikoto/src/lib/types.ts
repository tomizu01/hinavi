import type { CharacterId } from './characters';

export type ConversationMode = 'spot' | 'rest' | 'time';

export interface Spot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  types: string[];
  primaryType?: string;
}

export interface ConversationLine {
  speaker: CharacterId;
  text: string;
  spotName?: string | null;
  createdAt: number;
}

export interface GenerateRequest {
  mode: ConversationMode;
  turnNo: number;
  sessionId: string;
  history: ConversationLine[];
  spot?: Spot;
  isSpotContinuation?: boolean;
  distanceMeters?: number;
}

export interface GenerateResponse {
  misaki: string;
  hinata: string;
}
