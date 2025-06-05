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
  strength: number;
  joker?: boolean;
  color?: string;
  type?: "need" | "pass" | "takes";
  requestedSuit?: string;
}

export type Suit = "hearts" | "diamonds" | "clubs" | "spades";
export type Rank = "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";
export type Strength = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type Card =
  | { suit: Suit; rank: Rank; strength: Strength; id: string }
  | {
      joker: true;
      strength: number;
      id: string;
      color: string;
      type?: "need" | "pass" | "takes";
      requestedSuit?: string;
    };

export interface HandBid {
  playerId: string;
  bids: {
    gameHand: number;
    bid: number;
  }[];
}

export interface HandWin {
  playerId: string;
  wins: {
    gameHand: number;
    win: number;
  }[];
}

export interface HandPoint {
  playerId: string;
  points: {
    gameHand: number;
    point: number;
  }[];
}

export interface PlayedCard {
  playerId: string;
  playerIndex: number;
  card: Card;
}

export interface Game {
  id: string | null;
  roomId: string;
  status: "trump" | "waiting" | "dealing" | "bid" | "playing" | "finished";
  dealerId: string | null;
  players: string[] | null;
  currentPlayerId: string | null;
  currentHand: number | null;
  handCount: number | null;
  trumpCard: Card | null;
  hands:
    | {
        hand: Card[];
        playerId: string;
      }[]
    | null;
  handBids: HandBid[] | null;
  handWins: HandWin[] | null;
  handPoints: HandPoint[] | null;
  playedCards: PlayedCard[] | null;
  lastPlayedCards:
    | {
        playerId: string;
        playerIndex: number;
        card: Card;
      }[]
    | null;
}
