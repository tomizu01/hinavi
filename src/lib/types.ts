import type { CharacterId } from './characters';

export type ConversationMode = 'topic' | 'rest' | 'time';

export interface ConversationLine {
  speaker: CharacterId;
  text: string;
  createdAt: number;
}

export interface GenerateRequest {
  mode: ConversationMode;
  turnNo: number;
  sessionId: string;
  history: ConversationLine[];
  climbCount: number;
}

export interface GenerateResponse {
  misaki: string;
  hiyori: string;
}
