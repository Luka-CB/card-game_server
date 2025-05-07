export interface UserSessionData {
  _id: string;
  username: string;
  avatar: string;
  email: string;
  isVerified: boolean;
}

declare module "express-session" {
  interface SessionData {
    user?: UserSessionData;
  }
}

export interface Room {
  id: string;
  name: string;
  password: string | null;
  bett: string | null;
  type: "classic" | "nines" | "betting";
  status: "public" | "private";
  hisht: string;
  isActive?: boolean;
  createdAt: Date;
  user: {
    id: string;
    username: string;
    status: "active" | "busy" | "inactive" | "left";
    avatar: string | null;
    botAvatar: string | null;
  }[];
}

export interface RejoinRoom {
  id: string;
  name: string;
  password: string | null;
  bett: string | null;
  type: "classic" | "nines" | "betting";
  status: "public" | "private";
  hisht: string;
  isActive?: boolean;
  createdAt: Date;
}

export interface PlayingCard {
  id: string;
  suit: string;
  rank: string;
  joker?: boolean;
  color?: string;
}

export type Suit = "hearts" | "diamonds" | "clubs" | "spades";
export type Rank = "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";
export type Card =
  | { suit: Suit; rank: Rank; id: string }
  | { joker: true; id: string; color: string };

export interface Score {
  gameHand: number;
  bid: number;
  win: number;
  points: number;
}

export interface ScoreBoard {
  playerId: string;
  playerName: string;
  scores: Score[] | null;
}

export interface Game {
  id: string | null;
  roomId: string;
  status: "trump" | "waiting" | "dealing" | "bid" | "playing" | "finished";
  dealerId: string | null;
  players: string[] | null;
  activePlayerindex: number | null;
  activePlayerId: string | null;
  currentHand: number | null;
  trumpCard: Card | null;
  hands:
    | {
        hand: Card[];
        playerId: string;
      }[]
    | null;
  scoreBoard: ScoreBoard[] | null;
}
