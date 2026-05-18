import type { CharacterId } from './characters';

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
  speaker: CharacterId;
  spot: Spot;
  history: ConversationLine[];
}

export interface GenerateResponse {
  text: string;
}
