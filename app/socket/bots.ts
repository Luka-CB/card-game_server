import {
  Card,
  Game,
  GameTimer,
  HandBid,
  PlayedCard,
  Room,
  Suit,
} from "../utils/interfaces.util";
import {
  chooseTrumpCard,
  getGameInfo,
  removeCardFromHand,
  setPlayedCards,
  updateGameInfo,
} from "./gameFuncs";
import { getRoom, getRooms, updateUserStatus } from "./roomFuncs";
import { updateBids } from "./scoreBoardFuncs";
import { Server } from "socket.io";
import { removeTimer, startServerTimer } from "./timer";
import { completeNineDealing, handleEndRound } from "./gameFlow";

interface GameState {
  trumpSuit: Suit | null;
  trumpCard: Card | null;
  playedCards: PlayedCard[];
  currentHand: number;
  playerHands: { [playerId: string]: Card[] };
  bids: { [playerId: string]: number };
  wins: { [playerId: string]: number };
  playerOrder: string[];
  currentPlayerId: string;
}

class JokerGameBot {
  private playerId: string;
  private gameState: GameState;

  constructor(playerId: string, gameState: GameState) {
    this.playerId = playerId;
    this.gameState = gameState;
  }

  private isJoker(card: Card): boolean {
    return "joker" in card && card.joker === true;
  }

  private isTrump(card: Card): boolean {
    if (this.isJoker(card)) return false;
    if (!this.gameState.trumpSuit) return false;
    return "suit" in card && card.suit === this.gameState.trumpSuit;
  }

  private getCardStrength(card: Card): number {
    if (this.isJoker(card)) {
      return 100;
    }

    if (this.isTrump(card)) {
      return 50 + card.strength;
    }

    return card.strength;
  }

  private countStrongCards(hand: Card[]): number {
    let strongCount = 0;

    for (const card of hand) {
      if (this.isJoker(card)) {
        strongCount += 2;
      } else if (this.isTrump(card)) {
        if ("rank" in card) {
          if (card.rank === "A" || card.rank === "K") {
            strongCount += 1.5;
          } else if (card.rank === "Q" || card.rank === "J") {
            strongCount += 1;
          } else {
            strongCount += 0.5;
          }
        }
      } else if ("rank" in card) {
        if (card.rank === "A") {
          strongCount += 1;
        } else if (card.rank === "K") {
          strongCount += 0.5;
        }
      }
    }

    return Math.floor(strongCount);
  }

  private getCardsOfSuit(hand: Card[], suit: Suit): Card[] {
    return hand.filter(
      (card) => !this.isJoker(card) && "suit" in card && card.suit === suit,
    );
  }

  private getTrumpCards(hand: Card[]): Card[] {
    return hand.filter((card) => this.isTrump(card));
  }

  private getJokers(hand: Card[]): Card[] {
    return hand.filter((card) => this.isJoker(card));
  }

  public makeBid(
    hand: Card[],
    playerOrder: string[],
    currentBids: { [playerId: string]: number } | {},
  ): number {
    const handSize = this.gameState.currentHand;
    const isLastToBid =
      playerOrder.indexOf(this.playerId) === playerOrder.length - 1;
    const totalBidsSum = Object.values(currentBids).reduce(
      (sum, bid) => sum + bid,
      0,
    );

    const suits: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
    const trumpSuit = this.gameState.trumpSuit;

    const jokersCount = this.getJokers(hand).length;
    const trumpCards = this.getTrumpCards(hand);
    const trumpCount = trumpCards.length;

    const bySuit: Record<Suit, Card[]> = {
      hearts: [],
      diamonds: [],
      clubs: [],
      spades: [],
    };

    for (const c of hand) {
      if (this.isJoker(c)) continue;
      if (!("suit" in c) || !c.suit) continue;
      bySuit[c.suit].push(c);
    }

    // Helper: length of top-rank chain (A, AK, AKQ, AKQJ...)
    const chainLen = (suit: Suit) => {
      const order = ["A", "K", "Q", "J", "10", "9", "8", "7", "6"] as const;
      const set = new Set(bySuit[suit].map((c: any) => c.rank).filter(Boolean));
      let len = 0;
      for (const r of order) {
        if (set.has(r)) len++;
        else break;
      }
      return len;
    };

    // Count high-value cards (A, K, Q)
    const countHighCards = () => {
      let count = 0;
      for (const c of hand) {
        if (this.isJoker(c)) continue;
        if ("rank" in c) {
          if (c.rank === "A") count++;
          else if (c.rank === "K" || c.rank === "Q") count += 0.5;
        }
      }
      return count;
    };

    let jokerPotential = 0;
    let trumpPotential = 0;
    let nonTrumpPotential = 0;

    if (!trumpSuit) {
      // Jokers are absolute leverage
      jokerPotential = jokersCount * 1.0;

      // Count Aces (can bid on them with backup)
      const aceCount = hand.filter(
        (c: any) => !this.isJoker(c) && c.rank === "A",
      ).length;

      // With 2+ jokers: bid freely on jokers + high cards
      if (jokersCount >= 2) {
        nonTrumpPotential += jokersCount;

        // Can bid on Aces (with joker leverage to request suits)
        nonTrumpPotential += aceCount;

        // Can bid on same-site high chains (jokers can request highest)
        for (const s of suits) {
          const len = chainLen(s);
          const cards = bySuit[s];

          if (len >= 2) {
            //KQ, AK, AKQ, etc. - with 2 jokers can request highest
            nonTrumpPotential += len - 1;
          } else if (cards.length >= 5) {
            nonTrumpPotential += 1.5;
          }
        }
      }
      // With 1 joker: moderate leverage
      else if (jokersCount === 1) {
        // Can bid on multiple Aces (keep joker as backup)
        if (aceCount >= 2) {
          nonTrumpPotential += aceCount;
        } else if (aceCount === 1) {
          nonTrumpPotential += 0.8;
        }

        // Can bid on same-suit high chains
        for (const s of suits) {
          const len = chainLen(s);

          if (len >= 3) {
            nonTrumpPotential += len - 1;
          } else if (len === 2) {
            nonTrumpPotential += 0.8;
          }
        }

        // Long suits can collect cards
        for (const s of suits) {
          if (bySuit[s].length >= 5) {
            nonTrumpPotential += 1.0;
          }
        }
      }
      // No jokers: conservative but not overly so
      else {
        // Multiple Aces: can bid on all but one (keep backup)
        if (aceCount >= 2) {
          nonTrumpPotential += aceCount - 1;
        } else if (aceCount === 1) {
          nonTrumpPotential += 0.3;
        }

        // Same-suit chains
        for (const s of suits) {
          const len = chainLen(s);

          if (len >= 4) {
            nonTrumpPotential += 2.0;
          } else if (len === 3) {
            nonTrumpPotential += 1.0;
          } else if (len === 2) {
            nonTrumpPotential += 0.4;
          }
        }
      }
    } else {
      // Trump Exists Case
      jokerPotential = jokersCount * 1.0;

      // Trump winners (weighted by rank)
      for (const c of trumpCards as any[]) {
        const r = c.rank as string | null;
        if (r === "A" || r === "K") trumpPotential += 1.0;
        else if (r === "Q" || r === "J") trumpPotential += 0.7;
        else trumpPotential += 0.35;
      }
      if (trumpCount >= 3) trumpPotential += 0.4;

      // Non-trump winners (Only count with leverage)
      for (const s of suits) {
        if (s === trumpSuit) continue;

        const len = chainLen(s);
        if (len === 0) continue;

        if (len >= 3) nonTrumpPotential += 1.0;
        else if (len === 2)
          nonTrumpPotential += jokersCount > 0 || trumpCount >= 2 ? 0.9 : 0.25;
        else
          nonTrumpPotential += jokersCount > 0 && trumpCount >= 2 ? 0.25 : 0.0;
      }

      // If trump exists and we have no leverage, reduce bids
      if (trumpCount === 0 && jokersCount === 0) {
        nonTrumpPotential *= 0.6;
      }
    }

    let estimated = jokerPotential + trumpPotential + nonTrumpPotential;
    let baseBid = Math.max(0, Math.min(handSize, Math.floor(estimated)));

    // 1-card hands
    if (handSize === 1) {
      if (jokersCount > 0) baseBid = 1;
      else if (trumpSuit && trumpPotential >= 0.9) baseBid = 1;
      else {
        const only: any = hand[0];
        if (
          only &&
          !this.isJoker(only) &&
          !this.isTrump(only) &&
          only.rank === "A"
        ) {
          baseBid = 1;
        }
      }
    }

    // Last-to-bid "forbidden bid" rule
    if (isLastToBid) {
      const forbiddenBid = handSize - totalBidsSum;
      if (baseBid === forbiddenBid) {
        const possibleBids: number[] = [];
        for (let b = 0; b <= handSize; b++)
          if (b !== forbiddenBid) possibleBids.push(b);
        baseBid = possibleBids.reduce(
          (best, b) =>
            Math.abs(b - baseBid) < Math.abs(best - baseBid) ? b : best,
          possibleBids[0],
        );
      }
    }

    return Math.max(0, Math.min(baseBid, handSize));
  }

  private chooseRequestedSuitNeed(hand: Card[]): Suit {
    const isRealSuit = (s: any): s is Suit =>
      s === "hearts" || s === "diamonds" || s === "clubs" || s === "spades";

    if (isRealSuit(this.gameState.trumpSuit)) return this.gameState.trumpSuit;

    const suits: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
    let best: { suit: Suit; score: number } = { suit: suits[0], score: -1 };

    for (const s of suits) {
      const cards = hand.filter(
        (c) => !this.isJoker(c) && "suit" in c && c.suit === s,
      );
      if (cards.length === 0) continue;
      const strongest = Math.max(...cards.map((c) => this.getCardStrength(c)));
      if (strongest > best.score) best = { suit: s, score: strongest };
    }
    return best.score >= 0 ? best.suit : suits[Math.floor(Math.random() * 4)];
  }

  private chooseRequestedSuitTakes(hand: Card[]): Suit {
    const suits: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
    const counts = suits.map((s) => ({
      suit: s,
      count: hand.filter((c) => !this.isJoker(c) && "suit" in c && c.suit === s)
        .length,
    }));
    counts.sort((a, b) => a.count - b.count);
    return counts[0].suit;
  }

  private getHighestOfSuit(cards: Card[], suit: Suit): Card | null {
    const suited = cards.filter(
      (c) => !this.isJoker(c) && "suit" in c && c.suit === suit,
    );
    if (!suited.length) return null;
    return suited.reduce((best, cur) =>
      this.getCardStrength(cur) > this.getCardStrength(best) ? cur : best,
    );
  }

  private isLeadJokerWithRequest(
    playedCards: PlayedCard[],
  ): playedCards is [PlayedCard, ...PlayedCard[]] {
    if (!playedCards.length) return false;

    const isRealSuit = (s: any): s is Suit =>
      s === "hearts" || s === "diamonds" || s === "clubs" || s === "spades";

    const lead = playedCards[0].card as any;
    return this.isJoker(lead) && isRealSuit(lead.requestedSuit);
  }

  public playCard(hand: Card[], playedCardsThisRound: PlayedCard[]): Card {
    const isFirstToPlay = playedCardsThisRound.length === 0;
    const currentBid = this.gameState.bids[this.playerId] || 0;
    const currentWins = this.gameState.wins[this.playerId] || 0;
    const needsToWin = currentBid - currentWins;
    const remainingRounds = hand.length;

    return isFirstToPlay
      ? this.playFirstCard(hand, needsToWin)
      : this.playFollowingCard(
          hand,
          playedCardsThisRound,
          needsToWin,
          remainingRounds,
        );
  }

  private playFirstCard(hand: Card[], needsToWin: number): Card {
    const jokers = this.getJokers(hand);
    const trumps = this.getTrumpCards(hand);

    if (needsToWin > 0) {
      if (jokers.length > 0) {
        const jokerCard = jokers[0];
        const suit = this.chooseRequestedSuitNeed(hand);
        return { ...jokerCard, type: "need", requestedSuit: suit };
      }

      if (trumps.length > 0) {
        const strongest = this.getStrongestCard(trumps);
        if (!strongest) return hand[0]; // fallback: just play the first card
        return strongest;
      }

      return this.getStrongestCard(hand)
        ? this.getStrongestCard(hand)!
        : hand[0]; // fallback: just play the first card
    } else {
      if (jokers.length > 0) {
        const jokerCard = jokers[0];
        const suit = this.chooseRequestedSuitTakes(hand);
        return { ...jokerCard, type: "takes", requestedSuit: suit };
      }

      const nonTrump = hand.filter((c) => !this.isJoker(c) && !this.isTrump(c));
      if (nonTrump.length > 0) {
        const weakest = this.getWeakestCard(nonTrump);
        if (!weakest) return hand[0]; // fallback: just play the first card
        return weakest;
      }

      return this.getWeakestCard(hand) ? this.getWeakestCard(hand)! : hand[0]; // fallback: just play the first card
    }
  }

  private playFollowingCard(
    hand: Card[],
    playedCards: PlayedCard[],
    needsToWin: number,
    remainingRounds: number,
  ): Card {
    const bidAlreadyMet = needsToWin <= 0;

    if (this.isLeadJokerWithRequest(playedCards)) {
      const leadJoker: any = playedCards[0].card;
      const requestedSuit: Suit = leadJoker.requestedSuit;
      const haveRequested = this.getCardsOfSuit(hand, requestedSuit);
      const jokers = this.getJokers(hand);
      const trumps = this.getTrumpCards(hand);

      if (haveRequested.length) {
        if (bidAlreadyMet) {
          const currentWinningStrength = this.getCardStrength(
            this.getCurrentWinningCard(playedCards),
          );
          const safeCards = haveRequested.filter(
            (c) => this.getCardStrength(c) < currentWinningStrength,
          );
          if (safeCards.length > 0) {
            return this.getStrongestCard(safeCards)!;
          }
          return this.getHighestOfSuit(hand, requestedSuit)!;
        }
        return this.getHighestOfSuit(hand, requestedSuit)!;
      }

      if (trumps.length) {
        if (bidAlreadyMet) {
          const highestTrump = this.getStrongestCard(trumps);
          if (!highestTrump) return hand[0];
          return highestTrump;
        }

        const lowestTrump = this.getWeakestCard(trumps);
        if (!lowestTrump) return hand[0];
        return lowestTrump;
      }

      if (jokers.length) {
        const jokerType = needsToWin > 0 ? "need" : "pass";
        return { ...jokers[0], type: jokerType, requestedSuit: null };
      }

      if (bidAlreadyMet) {
        return this.getStrongestCard(hand)
          ? this.getStrongestCard(hand)!
          : hand[0];
      }
      return this.getWeakestCard(hand) ? this.getWeakestCard(hand)! : hand[0];
    }

    const leadSuit = this.getLeadSuit(playedCards[0].card);
    const canFollow = this.canFollowSuit(hand, leadSuit);
    const currentWinningCard = this.getCurrentWinningCard(playedCards);
    const currentWinningStrength = this.getCardStrength(currentWinningCard);
    const jokers = this.getJokers(hand);
    const trumps = this.getTrumpCards(hand);

    if (canFollow && leadSuit) {
      const followCards = this.getCardsOfSuit(hand, leadSuit);

      if (needsToWin > 0) {
        const winning = this.getCardThatCanWin(
          followCards,
          currentWinningStrength,
        );
        if (winning) return winning;

        if (jokers.length > 0 && remainingRounds <= needsToWin) {
          return { ...jokers[0], type: "need", requestedSuit: null };
        }
        return this.getWeakestCard(followCards)
          ? this.getWeakestCard(followCards)!
          : hand[0];
      } else {
        // Bid already met - play highest card that WON'T win (if possible)
        if (jokers.length > 0) {
          return { ...jokers[0], type: "pass", requestedSuit: null };
        }

        const safeCards = followCards.filter(
          (c) => this.getCardStrength(c) < currentWinningStrength,
        );

        if (safeCards.length > 0) {
          return this.getStrongestCard(safeCards)!;
        }

        return this.getStrongestCard(followCards)
          ? this.getStrongestCard(followCards)!
          : hand[0];
      }
    } else {
      if (bidAlreadyMet) {
        const nonTrumpNonJoker = hand.filter(
          (c) => !this.isJoker(c) && !this.isTrump(c),
        );

        if (nonTrumpNonJoker.length > 0) {
          return this.getStrongestCard(nonTrumpNonJoker)!;
        }

        if (trumps.length > 0) {
          return this.getStrongestCard(trumps)!;
        }

        if (jokers.length > 0) {
          return { ...jokers[0], type: "pass", requestedSuit: null };
        }

        return this.getStrongestCard(hand)
          ? this.getStrongestCard(hand)!
          : hand[0];
      } else {
        if (trumps.length || jokers.length) {
          if (needsToWin > 0 || remainingRounds <= needsToWin) {
            const winningTrump = this.getCardThatCanWin(
              trumps,
              currentWinningStrength,
            );
            if (winningTrump) return winningTrump;

            if (jokers.length)
              return { ...jokers[0], type: "need", requestedSuit: null };
            if (trumps.length) {
              const strongest = this.getStrongestCard(trumps);
              if (!strongest) return hand[0];
              return strongest;
            }
          } else {
            if (jokers.length)
              return { ...jokers[0], type: "pass", requestedSuit: null };

            return this.getWeakestCard(trumps.length ? trumps : hand)
              ? this.getWeakestCard(trumps.length ? trumps : hand)!
              : hand[0];
          }
        }
        return this.getWeakestCard(hand) ? this.getWeakestCard(hand)! : hand[0];
      }
    }
  }

  public chooseTrump(threeCards: Card[]): Suit | string {
    const suits: { [key in Suit]: Card[] } = {
      hearts: [],
      diamonds: [],
      clubs: [],
      spades: [],
    };

    let jokerCount = 0;

    for (const card of threeCards) {
      if (this.isJoker(card)) {
        jokerCount++;
      } else if ("suit" in card) {
        if (card.suit) suits[card.suit].push(card);
      }
    }

    for (const suit in suits) {
      if (suits[suit as Suit].length === 3) {
        return suit as Suit;
      }
    }

    if (jokerCount >= 1) {
      for (const suit in suits) {
        if (suits[suit as Suit].length === 2) {
          return suit as Suit;
        }
      }
    }

    for (const suit in suits) {
      if (suits[suit as Suit].length === 2) {
        return suit as Suit;
      }
    }

    if (jokerCount >= 1) {
      for (const suit in suits) {
        if (suits[suit as Suit].length === 1) {
          const card = suits[suit as Suit][0];
          if ("rank" in card && ["A", "K", "Q"].includes(card.rank || "")) {
            return suit as Suit;
          }
        }
      }
    }

    return "pass";
  }

  private getLeadSuit(card: Card): Suit | null {
    if (this.isJoker(card) || this.isTrump(card)) return null;
    return "suit" in card ? card.suit : null;
  }

  private canFollowSuit(hand: Card[], leadSuit: Suit | null): boolean {
    if (!leadSuit) return false;
    return this.getCardsOfSuit(hand, leadSuit).length > 0;
  }

  private getCurrentWinningCard(playedCards: PlayedCard[]): Card {
    return playedCards.reduce((winner, current) => {
      return this.getCardStrength(current.card) >
        this.getCardStrength(winner.card)
        ? current
        : winner;
    }).card;
  }

  private getCardThatCanWin(
    cards: Card[],
    strengthToBeat: number,
  ): Card | null {
    const winningCards = cards.filter(
      (card) => this.getCardStrength(card) > strengthToBeat,
    );
    return winningCards.length > 0 ? this.getWeakestCard(winningCards) : null;
  }

  private getWeakestCard(cards: Card[]): Card | null {
    if (!cards.length) return null;
    return cards.reduce((weakest, current) => {
      return this.getCardStrength(current) < this.getCardStrength(weakest)
        ? current
        : weakest;
    });
  }

  private getStrongestCard(cards: Card[]): Card | null {
    if (!cards.length) return null;
    return cards.reduce((strongest, current) => {
      return this.getCardStrength(current) > this.getCardStrength(strongest)
        ? current
        : strongest;
    });
  }
}

export function createJokerBot(
  playerId: string,
  gameState: GameState,
): JokerGameBot {
  return new JokerGameBot(playerId, gameState);
}

export function getBotBid(
  playerId: string,
  hand: Card[],
  gameState: GameState,
  playerOrder: string[],
  currentBids: { [playerId: string]: number } | {},
): number {
  const bot = createJokerBot(playerId, gameState);
  return bot.makeBid(hand, playerOrder, currentBids);
}

export function getBotCardPlay(
  playerId: string,
  hand: Card[] | undefined,
  gameState: GameState,
  playedCardsThisRound: PlayedCard[],
): Card {
  const bot = createJokerBot(playerId, gameState);
  return bot.playCard(hand || [], playedCardsThisRound);
}

export function getBotTrumpChoice(
  playerId: string,
  threeCards: Card[],
  gameState: GameState,
): Suit | string {
  const bot = createJokerBot(playerId, gameState);
  return bot.chooseTrump(threeCards);
}

export function integrateBotsWithGame(game: Game) {
  const isRealSuit = (s: any): s is Suit =>
    s === "hearts" || s === "diamonds" || s === "clubs" || s === "spades";
  const rawTrumpSuit =
    game.trumpCard && "suit" in game.trumpCard
      ? (game.trumpCard as any).suit
      : null;

  const gameState: GameState = {
    trumpSuit: isRealSuit(rawTrumpSuit) ? rawTrumpSuit : null,
    trumpCard: game.trumpCard,
    playedCards: game.playedCards || [],
    currentHand: game.currentHand || 1,
    playerHands: {},
    bids: {},
    wins: {},
    playerOrder: game.players || [],
    currentPlayerId: game.currentPlayerId || "",
  };

  if (game.handBids) {
    for (const handBid of game.handBids) {
      const currentHandBid = handBid.bids.find(
        (b) => b.handNumber === game.handCount,
      );
      if (currentHandBid) {
        gameState.bids[handBid.playerId] = currentHandBid.bid;
      }
    }
  }

  if (game.handWins) {
    for (const handWin of game.handWins) {
      const currentHandWin = handWin.wins.find(
        (w) => w.handNumber === game.handCount,
      );
      if (currentHandWin) {
        gameState.wins[handWin.playerId] = currentHandWin.win;
      }
    }
  }

  if (game.hands) {
    for (const hand of game.hands) {
      gameState.playerHands[hand.playerId] = hand.hand;
    }
  }

  return gameState;
}

export const handleBotMoves = async (
  roomId: string,
  type: GameTimer["type"],
  gameInfo: Game,
  io: Server,
  playerId?: string,
) => {
  const MAX_RETRIES = 2;
  let retryCount = 0;

  const executeMove = async (): Promise<boolean> => {
    try {
      console.log(
        `[Bot] Starting move for ${
          playerId || gameInfo.currentPlayerId
        } - ${type} (Attempt ${retryCount + 1}/${MAX_RETRIES + 1})`,
      );

      const gameState = integrateBotsWithGame(gameInfo);

      const room: Room = await getRoom(roomId);
      if (!room) {
        console.error(`[Bot] Room ${roomId} not found`);
        return false;
      }

      const currentPlayerStatus = room.users.find(
        (user) => user.id === gameInfo.currentPlayerId,
      )?.status;

      const playerIndex =
        gameInfo?.players?.findIndex(
          (p: string) => p === gameInfo?.currentPlayerId,
        ) || 0;

      const nextPlayerId =
        gameInfo.players &&
        gameInfo?.players[(playerIndex + 1) % gameInfo?.players?.length];

      switch (type) {
        case "bid": {
          if (gameInfo?.status !== "bid") {
            console.warn(
              `[Bot] Status mismatch - expected 'bid, got '${gameInfo?.status}'`,
            );
            return false;
          }

          const currentBids: { [playerId: string]: number } =
            Object.fromEntries(
              gameInfo?.handBids
                ?.filter(
                  (bid: HandBid) => bid.playerId !== gameInfo.currentPlayerId,
                )
                ?.map((bid: HandBid) => {
                  const currentHandScore = bid.bids.find(
                    (b) => b.handNumber === gameInfo.handCount,
                  );
                  return [bid.playerId, currentHandScore?.bid || 0];
                }) || [],
            ) || {};

          let botBid = getBotBid(
            gameInfo?.currentPlayerId as string,
            gameInfo.hands?.find(
              (h: { playerId: string; hand: Card[] }) =>
                h.playerId === gameInfo.currentPlayerId,
            )?.hand || [],
            gameState,
            gameInfo.players || [],
            currentBids,
          );

          if (botBid === undefined) botBid = 0;

          let bid = botBid;

          if (gameInfo?.dealerId === gameInfo?.currentPlayerId) {
            const currentBidSum = Object.values(currentBids).reduce(
              (sum, bid) => sum + bid,
              0,
            );
            const bidSum = currentBidSum + botBid;

            if (bidSum === gameInfo?.currentHand) {
              bid = 1;
            } else {
              bid = botBid;
            }
          }

          await updateBids(roomId, {
            playerId: gameInfo?.currentPlayerId as string,
            bid: bid,
            gameHand: gameInfo?.currentHand as number,
          });

          await updateGameInfo(roomId, {
            currentPlayerId: nextPlayerId,
            status:
              gameInfo?.dealerId === gameInfo?.currentPlayerId
                ? "playing"
                : "bid",
          });

          if (currentPlayerStatus === "active") {
            await updateUserStatus(
              roomId,
              gameInfo?.currentPlayerId as string,
              "busy",
            );
          }

          removeTimer(roomId, gameInfo?.currentPlayerId as string);

          const latest = await getGameInfo(roomId);
          if (!latest) {
            console.error(`[Bot] Failed to get latest game info after bid`);
            return false;
          }

          io.to(roomId).emit("getGameInfo", latest);

          const updatedRooms = await getRooms();
          if (updatedRooms) {
            io.emit("getRooms", updatedRooms);

            const foundRoom = updatedRooms.find((r: Room) => r.id === roomId);
            if (foundRoom) {
              io.to(roomId).emit("getRoom", foundRoom);
            }
          }

          if (
            latest.currentPlayerId &&
            (latest.status === "bid" || latest.status === "playing")
          ) {
            await startServerTimer(
              roomId,
              latest.currentPlayerId,
              io,
              latest.status,
            );
          }

          console.log(
            `[Bot] Bid completed successfully for ${gameInfo?.currentPlayerId}`,
          );
          return true;
        }

        case "playing": {
          if (gameInfo?.status !== "playing") {
            console.warn(
              `[Bot] Status mismatch - expected 'playing', got '${gameInfo?.status}'`,
            );
            return false;
          }

          const currentPlayerId = gameInfo.currentPlayerId;
          if (!currentPlayerId) {
            console.error(`[Bot] No current player ID`);
            return false;
          }

          const handObj = gameInfo.hands?.find(
            (h: { playerId: string; hand: Card[] }) =>
              h.playerId === currentPlayerId,
          );

          if (!handObj) {
            console.error(`[Bot] No hand found for player ${currentPlayerId}`);
            return false;
          }

          let botPlayedCard = getBotCardPlay(
            currentPlayerId,
            handObj.hand,
            gameState,
            gameInfo.playedCards || [],
          );

          if (!botPlayedCard && handObj.hand.length > 0) {
            console.warn(
              `[Bot] getBotCardPlay returned null, using first card`,
            );
            botPlayedCard = handObj.hand[0];
          }

          if (!botPlayedCard) {
            console.error(`[Bot] No card to play for ${currentPlayerId}`);
            return false;
          }

          await removeCardFromHand(roomId, currentPlayerId, botPlayedCard);
          await setPlayedCards(roomId, currentPlayerId, botPlayedCard);

          if (currentPlayerStatus === "active") {
            await updateUserStatus(roomId, currentPlayerId, "busy");
          }

          io.to(roomId).emit("botPlayedCard", botPlayedCard);
          removeTimer(roomId, currentPlayerId);

          await new Promise((resolve) => setTimeout(resolve, 100));
          let latest = await getGameInfo(roomId);
          if (!latest) {
            console.error(
              `[playCard] Failed to fetch game info for room ${roomId}`,
            );
            return false;
          }

          if (latest.playedCards && latest.playedCards.length === 4) {
            await handleEndRound(roomId, latest, io);
          } else {
            await updateGameInfo(roomId, {
              currentPlayerId: nextPlayerId,
            });

            const latest = await getGameInfo(roomId);
            if (!latest) {
              console.error(`[Bot] Failed to get latest game info after play`);
              return false;
            }

            io.to(roomId).emit("getGameInfo", latest);

            const updatedRoom = await getRooms();
            if (updatedRoom) {
              io.emit("getRooms", updatedRoom);
            }

            const foundRoom = updatedRoom.find((r: Room) => r.id === roomId);
            if (foundRoom) {
              io.to(roomId).emit("getRoom", foundRoom);
            }

            if (latest.currentPlayerId) {
              await startServerTimer(
                roomId,
                latest.currentPlayerId,
                io,
                "playing",
              );
            }
          }

          console.log(
            `[Bot] Card play completed successfully for ${currentPlayerId}`,
          );
          return true;
        }

        case "trump": {
          const currentPlayerId = playerId;
          if (!currentPlayerId) {
            console.error(`[Bot] No player ID for trump selection`);
            return false;
          }

          const hand = gameInfo.hands?.find(
            (hand) => hand.playerId === currentPlayerId,
          );
          if (!hand) {
            console.error(`[Bot] No hand found for trump selection`);
            return false;
          }

          const threeCards = hand.hand.slice(0, 3);
          if (!threeCards.length) {
            console.error(`[Bot] No cards available for trump selection`);
            return false;
          }

          let botTrumpCard = getBotTrumpChoice(
            currentPlayerId,
            threeCards,
            gameState,
          );

          if (!botTrumpCard) botTrumpCard = "pass";

          await chooseTrumpCard(roomId, {
            id: "none",
            suit: botTrumpCard as string,
            rank: "none",
            strength: 0,
          });

          if (currentPlayerStatus === "active") {
            await updateUserStatus(roomId, currentPlayerId, "busy");
          }
          removeTimer(roomId, currentPlayerId);

          const latest = await getGameInfo(roomId);
          if (!latest) {
            console.error(`[Bot] Failed to get latest game info after trump`);
            return false;
          }

          io.to(roomId).emit("getGameInfo", latest);

          const updatedRoom = await getRooms();
          if (updatedRoom) {
            io.emit("getRooms", updatedRoom);
          }

          const foundRoom = updatedRoom.find((r: Room) => r.id === roomId);
          if (foundRoom) {
            io.to(roomId).emit("getRoom", foundRoom);
          }

          await completeNineDealing(roomId, io);

          console.log(
            `[Bot] Trump selection completed successfully for ${currentPlayerId}`,
          );
          return true;
        }

        default:
          console.warn(`[Bot] Unknown timer type: ${type}`);
          return false;
      }
    } catch (error) {
      console.error(
        `[Bot] Critical error in handleBotMoves for ${roomId}:`,
        error,
      );
      return false;
    }
  };

  while (retryCount <= MAX_RETRIES) {
    const success = await executeMove();

    if (success) return;

    retryCount++;

    if (retryCount <= MAX_RETRIES) {
      console.log(
        `[Bot] Retrying move for ${
          playerId || gameInfo.currentPlayerId
        } (${retryCount}/${MAX_RETRIES})`,
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const refreshedGameInfo = await getGameInfo(roomId);
      if (refreshedGameInfo) {
        gameInfo = refreshedGameInfo;
      }
    }
  }

  console.error(
    `[Bot] Allretry attempt failed for ${roomId}, attempting recovery`,
  );

  setTimeout(async () => {
    try {
      const latest = await getGameInfo(roomId);
      if (latest && latest.currentPlayerId) {
        console.log(
          `[Bot]Recovery: restarting timer for ${latest.currentPlayerId}`,
        );

        io.to(roomId).emit("getGameInfo", latest);

        if (
          latest.status === "bid" ||
          latest.status === "playing" ||
          latest.status === "choosingTrump"
        ) {
          const timerType =
            latest.status === "choosingTrump" ? "trump" : latest.status;
          await startServerTimer(
            roomId,
            latest.currentPlayerId,
            io,
            timerType as GameTimer["type"],
          );
        }
      }
    } catch (recoveryError) {
      console.error(`[Bot] Recovery failed for ${roomId}:`, recoveryError);
    }
  }, 2000);
};
