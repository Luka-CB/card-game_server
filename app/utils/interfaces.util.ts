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

export interface RoomUser {
  id: string;
  username: string;
  status: "active" | "busy" | "inactive" | "left";
  avatar: string | null;
  botAvatar: string | null;
}

export interface Room {
  id: string;
  name: string;
  password: string | null;
  bett: string | null;
  type: "classic" | "nines";
  status: "public" | "private";
  hisht: string;
  isActive?: boolean;
  createdAt: Date;
  lastActivityAt: Date;
  users: RoomUser[];
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
export type Strength = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type Card = {
  joker: boolean;
  suit: Suit | null;
  rank: Rank | null;
  strength: Strength;
  color?: string | null;
  isJoker?: boolean;
  isTrump?: boolean;
  id: string;
  type?: "need" | "pass" | "takes" | null;
  requestedSuit?: string | null;
};

export interface HandBid {
  playerId: string;
  bids: {
    gameHand: number;
    handNumber: number;
    bid: number;
  }[];
}

export interface HandWin {
  playerId: string;
  wins: {
    gameHand: number;
    handNumber: number;
    win: number;
  }[];
}

export interface HandPoint {
  playerId: string;
  points: {
    gameHand: number;
    handNumber: number;
    point: number;
  }[];
}

export interface PlayedCard {
  playerId: string;
  playerIndex: number;
  card: Card;
}

export interface Round {
  id: number;
  gameHand: number;
  handNumber: number;
  bid: number | null;
  win: number | null;
  points: {
    value: number;
    isCut: boolean;
    isBonus: boolean;
  };
}

export interface ScoreBoard {
  playerId: string;
  roundOne: Round[];
  roundSumOne: number;
  roundTwo: Round[];
  roundSumTwo: number;
  roundThree: Round[];
  roundSumThree: number;
  roundFour: Round[];
  roundSumFour: number;
  totalSum: number;
}

export interface GameTimer {
  roomId: string;
  startTime: number;
  duration: number;
  isActive: boolean;
  type: "bid" | "playing" | "trump" | "general";
  playerId?: string;
}

export interface Game {
  id: string | null;
  roomId: string;
  status:
    | "trump"
    | "choosingTrump"
    | "waiting"
    | "dealing"
    | "bid"
    | "playing"
    | "finished";
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
  lastPlayedCards: PlayedCard[] | null;
  scoreBoard: ScoreBoard[] | null;
  currentTimer?: GameTimer | null;
}
