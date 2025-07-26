import { Card, Game, PlayedCard, Suit } from "../utils/interfaces.util";

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
    const trumpSuit = this.gameState.trumpSuit;

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
      (card) => !this.isJoker(card) && "suit" in card && card.suit === suit
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
    currentBids: { [playerId: string]: number } | {}
  ): number {
    const handSize = this.gameState.currentHand;
    const isLastToBid =
      playerOrder.indexOf(this.playerId) === playerOrder.length - 1;

    const strongCardCount = this.countStrongCards(hand);
    let baseBid = Math.min(strongCardCount, handSize);

    const totalBidsSum = Object.values(currentBids).reduce(
      (sum, bid) => sum + bid,
      0
    );

    if (isLastToBid) {
      if (baseBid + totalBidsSum === handSize) {
        if (baseBid > 0) {
          baseBid === Math.max(0, baseBid - 1);
        } else {
          baseBid = 1;
        }
      }
    }

    if (strongCardCount < 1 && handSize > 3) {
      baseBid = 0;
    }

    return Math.max(0, Math.min(baseBid, handSize));
  }

  public playCard(hand: Card[], playedCardsThisRound: PlayedCard[]): Card {
    const isFirstToPlay = playedCardsThisRound.length === 0;
    const currentBid = this.gameState.bids[this.playerId] || 0;
    const currentWins = this.gameState.wins[this.playerId] || 0;
    const needsToWin = currentBid - currentWins;
    const remainingRounds = hand.length;

    if (isFirstToPlay) {
      return this.playFirstCard(hand, needsToWin, remainingRounds);
    } else {
      return this.playFollowingCard(
        hand,
        playedCardsThisRound,
        needsToWin,
        remainingRounds
      );
    }
  }

  private playFirstCard(
    hand: Card[],
    needsToWin: number,
    remainingRounds: number
  ): Card {
    const jokers = this.getJokers(hand);
    const trumps = this.getTrumpCards(hand);

    if (needsToWin <= 0) {
      const weakestCard = this.getWeakestCard(hand);

      if (jokers.length > 0 && weakestCard.strength > 6) {
        const jokerCard = jokers[0];
        const suits = ["hearts", "diamonds", "clubs", "spades"];
        const getRandomSuit = () => suits[Math.floor(Math.random() * 4)];
        return { ...jokerCard, type: "takes", requestedSuit: getRandomSuit() };
      }

      return weakestCard;
    }

    if (needsToWin >= remainingRounds) {
      const strongestCard = this.getStrongestCard(hand);

      if (jokers.length > 0 && strongestCard.strength < 6) {
        const jokerCard = jokers[0];

        if (this.gameState.trumpSuit) {
          return {
            ...jokerCard,
            type: "need",
            requestedSuit: this.gameState.trumpSuit,
          };
        }

        return {
          ...jokerCard,
          type: "need",
          requestedSuit: strongestCard.suit,
        };
      }

      if (trumps.length > 0) return this.getStrongestCard(trumps);

      return strongestCard;
    }

    const nonTrumpSuits = this.getNonTrumpSuits(hand);
    for (const suit of nonTrumpSuits) {
      const suitCards = this.getCardsOfSuit(hand, suit);
      if (suitCards.length === 1) {
        return suitCards[0];
      }
    }

    return this.getMediumStrengthCard(hand);
  }

  private playFollowingCard(
    hand: Card[],
    playedCards: PlayedCard[],
    needsToWin: number,
    remainingRounds: number
  ): Card {
    const leadSuit = this.getLeadSuit(playedCards[0].card);
    const canFollow = this.canFollowSuit(hand, leadSuit);
    const currentWinningCard = this.getCurrentWinningCard(playedCards);
    const currentWinningStrength = this.getCardStrength(currentWinningCard);

    if (canFollow) {
      const followCards = leadSuit ? this.getCardsOfSuit(hand, leadSuit) : [];

      if (needsToWin > 0) {
        const winningCard = this.getCardThatCanWin(
          followCards,
          currentWinningStrength
        );
        if (winningCard) return winningCard;
      }

      if (needsToWin < 0) {
        const jokers = this.getJokers(hand);

        if (jokers.length > 0) {
          const jokerCard = jokers[0];
          return { ...jokerCard, type: "pass" };
        }
      }

      return this.getWeakestCard(followCards);
    } else {
      if (needsToWin > 0 && remainingRounds <= needsToWin) {
        const trumps = this.getTrumpCards(hand);
        const jokers = this.getJokers(hand);

        if (jokers.length > 0) {
          const jokerCard = jokers[0];
          return { ...jokerCard, type: "need" };
        }

        if (trumps.length > 0) {
          const winningTrump = this.getCardThatCanWin(
            trumps,
            currentWinningStrength
          );
          if (winningTrump) return winningTrump;
        }
      }

      return this.getWeakestCard(hand);
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

    if (jokerCount === 1) {
      for (const suit in suits) {
        if (suits[suit as Suit].length === 2) {
          return suit as Suit;
        }
      }
    }

    for (const suit in suits) {
      const suitCards = suits[suit as Suit];
      if (suitCards.length === 2) {
        const ranks = suitCards
          .map((card) => ("rank" in card ? card.rank : null))
          .filter(Boolean);
        if (ranks.length === 2) {
          const hasAce = ranks.includes("A");
          const hasKing = ranks.includes("K");
          const hasQueen = ranks.includes("Q");

          if (
            (hasAce && hasKing) ||
            (hasAce && hasQueen) ||
            (hasKing && hasQueen)
          ) {
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
    strengthToBeat: number
  ): Card | null {
    const winningCards = cards.filter(
      (card) => this.getCardStrength(card) > strengthToBeat
    );
    return winningCards.length > 0 ? this.getWeakestCard(winningCards) : null;
  }

  private getWeakestCard(cards: Card[]): Card {
    return cards.reduce((weakest, current) => {
      return this.getCardStrength(current) < this.getCardStrength(weakest)
        ? current
        : weakest;
    });
  }

  private getStrongestCard(cards: Card[]): Card {
    return cards.reduce((strongest, current) => {
      return this.getCardStrength(current) > this.getCardStrength(strongest)
        ? current
        : strongest;
    });
  }

  private getMediumStrengthCard(cards: Card[]): Card {
    const sortedCards = cards.sort(
      (a, b) => this.getCardStrength(a) - this.getCardStrength(b)
    );
    return sortedCards[Math.floor(sortedCards.length / 2)];
  }

  private getNonTrumpSuits(hand: Card[]): Suit[] {
    const suits = new Set<Suit>();
    for (const card of hand) {
      if (!this.isJoker(card) && !this.isTrump(card) && "suit" in card) {
        if (card.suit) suits.add(card.suit);
      }
    }
    return Array.from(suits);
  }
}

export function createJokerBot(
  playerId: string,
  gameState: GameState
): JokerGameBot {
  return new JokerGameBot(playerId, gameState);
}

export function getBotBid(
  playerId: string,
  hand: Card[],
  gameState: GameState,
  playerOrder: string[],
  currentBids: { [playerId: string]: number } | {}
): number {
  const bot = createJokerBot(playerId, gameState);
  return bot.makeBid(hand, playerOrder, currentBids);
}

export function getBotCardPlay(
  playerId: string,
  hand: Card[],
  gameState: GameState,
  playedCardsThisRound: PlayedCard[]
): Card {
  const bot = createJokerBot(playerId, gameState);
  return bot.playCard(hand, playedCardsThisRound);
}

export function getBotTrumpChoice(
  playerId: string,
  threeCards: Card[],
  gameState: GameState
): Suit | string {
  const bot = createJokerBot(playerId, gameState);
  return bot.chooseTrump(threeCards);
}

export function integrateBotsWithGame(game: Game) {
  const gameState: GameState = {
    trumpSuit:
      game.trumpCard && "suit" in game.trumpCard ? game.trumpCard.suit : null,
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
        (b) => b.handNumber === game.handCount
      );
      if (currentHandBid) {
        gameState.bids[handBid.playerId] = currentHandBid.bid;
      }
    }
  }

  if (game.handWins) {
    for (const handWin of game.handWins) {
      const currentHandWin = handWin.wins.find(
        (w) => w.handNumber === game.handCount
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
