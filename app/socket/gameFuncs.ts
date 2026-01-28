import redisClient from "../config/redisClient";
import { randomUUID } from "crypto";
import {
  Card,
  Game,
  PlayedCard,
  Rank,
  Strength,
  Suit,
  PlayingCard,
  HandWin,
  HandBid,
  ScoreBoard,
} from "../utils/interfaces.util";
import { getRoom } from "./roomFuncs";

const createDeck = (): Card[] => {
  const suits: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
  const ranks: Rank[] = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  let deck: Card[] = [];

  const getStrength = (rank: Rank): Strength => {
    if (rank === "6") return 1;
    if (rank === "7") return 2;
    if (rank === "8") return 3;
    if (rank === "9") return 4;
    if (rank === "10") return 5;
    if (rank === "J") return 6;
    if (rank === "Q") return 7;
    if (rank === "K") return 8;
    if (rank === "A") return 9;
    return 1;
  };

  for (let suit of suits) {
    for (let rank of ranks) {
      deck.push({
        joker: false,
        suit,
        rank,
        strength: getStrength(rank),
        id: randomUUID(),
      });
    }
  }

  deck = deck.filter(
    (card) =>
      !("rank" in card) ||
      !(
        (card.rank === "6" && card.suit === "clubs") ||
        (card.rank === "6" && card.suit === "spades")
      )
  );

  deck.push(
    {
      joker: true,
      suit: null,
      rank: null,
      strength: 10,
      id: randomUUID(),
      color: "black",
    },
    {
      joker: true,
      suit: null,
      rank: null,
      strength: 10,
      id: randomUUID(),
      color: "red",
    }
  );

  return deck;
};

const shuffle = (deck: Card[]): Card[] => {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = deck[i];
    deck[i] = deck[j];
    deck[j] = temp;
  }
  return deck;
};

export const dealCards = (
  playerIds: string[],
  cardsPerPlayer: number
): Record<string, Card[]> => {
  let deck = shuffle(createDeck());
  const hands: Record<string, Card[]> = {};

  for (let playerId of playerIds) {
    hands[playerId] = deck.splice(0, cardsPerPlayer);
  }

  return hands;
};

export const determineDealer = (
  playerIds: string[]
): { dealerId: string; revealSequence: { playerId: string; card: Card }[] } => {
  const deck = shuffle(createDeck());
  const sequence: { playerId: string; card: Card }[] = [];
  let currentPlayerIndex = 0;
  let dealerId: string | null = null;

  const usedCardIds = new Set<string>();

  while (deck.length > 0) {
    const playerId = playerIds[currentPlayerIndex];
    const card = deck.shift();
    if (!card || usedCardIds.has(card.id)) continue;

    usedCardIds.add(card.id);

    const clonedCard = { ...card, id: randomUUID() };
    sequence.push({ playerId, card: clonedCard });

    if ("rank" in card && card.rank === "A") {
      dealerId = playerId;
      break;
    }

    currentPlayerIndex = (currentPlayerIndex + 1) % playerIds.length;
  }

  return {
    dealerId: dealerId || playerIds[0],
    revealSequence: sequence,
  };
};

export const getGameInfo = async (roomId: string) => {
  const game = await redisClient.hget("games", roomId);
  return game ? JSON.parse(game) : null;
};

export const createGameInfo = async (roomId: string) => {
  const existingGameInfo = await getGameInfo(roomId);
  if (existingGameInfo) return existingGameInfo;

  const room = await getRoom(roomId);
  if (!room) return null;

  const playerIds = [...room.users]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((user) => user.id);

  const initialGameInfo = {
    id: randomUUID(),
    roomId,
    status: "dealing",
    players: playerIds,
    dealerId: null,
    currentPlayerId: null,
    currentHand: null,
    handCount: 1,
    trumpCard: null,
    hands: null,
  };
  await redisClient.hset("games", roomId, JSON.stringify(initialGameInfo));
  return initialGameInfo;
};

export const updateGameInfo = async (
  roomId: string,
  gameData: Partial<{
    status: string;
    dealerId: string | null;
    players: string[] | null;
    currentPlayerId: string | null;
    currentHand: number | null;
    handCount: number | null;
    playedCards: PlayedCard[] | null;
    lastPlayedCards: PlayedCard[] | null;
    trumpCard: Card | null;
    hands: { hand: Card[]; playerId: string }[] | null;
    handWins: HandWin[] | null;
    handBids: HandBid[] | null;
    scoreBoard: ScoreBoard[] | null;
  }>
) => {
  const game = await getGameInfo(roomId);
  if (!game) return;

  const updatedGame = {
    ...game,
    ...gameData,
  };

  await redisClient.hset("games", roomId, JSON.stringify(updatedGame));
  return updatedGame;
};

export const setPlayedCards = async (
  roomId: string,
  playerId: string,
  playedCard: Card
) => {
  const game = await getGameInfo(roomId);
  if (!game) return;

  const updatedGameInfo = {
    ...game,
    playedCards: [...(game.playedCards || []), { playerId, card: playedCard }],
  };

  await redisClient.hset("games", roomId, JSON.stringify(updatedGameInfo));
};

export const setLastPlayedCards = async (
  roomId: string,
  playedCards: PlayedCard[]
) => {
  const game = await getGameInfo(roomId);
  if (!game) return;

  const updatedGameInfo = {
    ...game,
    lastPlayedCards: playedCards,
  };

  await redisClient.hset("games", roomId, JSON.stringify(updatedGameInfo));
};

export const clearPlayedCards = async (roomId: string) => {
  const game = await getGameInfo(roomId);
  if (!game) return;

  await redisClient.hset(
    "games",
    roomId,
    JSON.stringify({ ...game, playedCards: [] } as Game)
  );
};

export const removeGameInfo = async (roomId: string) => {
  await redisClient.hdel("games", roomId);
};

export const removeCardFromHand = async (
  roomId: string,
  playerId: string,
  card: Card
) => {
  const game = await getGameInfo(roomId);
  if (!game) return;

  const updatedGameInfo = {
    ...game,
    hands: game.hands?.map((hand: { playerId: string; hand: Card[] }) => {
      if (hand.playerId !== playerId) return hand;

      return {
        ...hand,
        hand: hand.hand.filter((c) => c.id !== card.id),
      };
    }),
  };

  await redisClient.hset("games", roomId, JSON.stringify(updatedGameInfo));
};

export const getTrumpCard = async (roomId: string) => {
  const gameInfo = await getGameInfo(roomId);
  if (!gameInfo || !gameInfo.hands) return null;

  let deck = createDeck();

  const dealtCards = gameInfo.hands.flatMap(
    (hand: { hand: Card; playerId: string }) => hand.hand
  );

  deck = deck.filter(
    (card: any) =>
      !dealtCards.some(
        (dealtCard: any) =>
          (dealtCard.joker && card.joker) ||
          (dealtCard.suit === card.suit && dealtCard.rank === card.rank)
      )
  );

  if (deck.length === 0) {
    console.log("No cards left in the deck");
    return null;
  }

  deck = shuffle(deck);
  const trumpCard: any = deck.pop();

  if (!trumpCard) return null;

  await updateGameInfo(roomId, { trumpCard });

  return trumpCard;
};

export const chooseTrumpCard = async (
  roomId: string,
  trumpCard: PlayingCard
) => {
  const gameInfo = await getGameInfo(roomId);
  if (!gameInfo) return;

  const updatedGameInfo = {
    ...gameInfo,
    trumpCard,
  };

  await redisClient.hset("games", roomId, JSON.stringify(updatedGameInfo));
  return updatedGameInfo;
};

export const getRoundCount = async (roomId: string) => {
  const roundCount = await redisClient.hget("roundCount", roomId);
  return roundCount ? JSON.parse(roundCount).count : 0;
};

export const setPlayRoundCount = async (roomId: string, count: number) => {
  const gameInfo = await getGameInfo(roomId);
  if (!gameInfo || count > gameInfo.currentHand) return;

  const newData = {
    roomId,
    count,
  };

  await redisClient.hset("roundCount", roomId, JSON.stringify(newData));
  return newData;
};

export const removeRoundCount = async (roomId: string) => {
  await redisClient.hdel("roundCount", roomId);
};

export const dealRemainingToNine = async (roomId: string) => {
  const gameInfo = await getGameInfo(roomId);
  if (!gameInfo || !gameInfo.hands || gameInfo.currentHand !== 9) return null;

  let deck = createDeck();

  const dealtCards = gameInfo.hands.flatMap(
    (h: { hand: Card[]; playerId: string }) => h.hand
  );

  const dealtNonJokerKeys = new Set(
    dealtCards
      .filter((c: Card) => !c.joker)
      .map((c: Card) => `${c.suit}-${c.rank}`)
  );
  let jokersToRemove = dealtCards.filter((c: Card) => c.joker).length;

  deck = deck.filter((card) => {
    if (card.joker) {
      if (jokersToRemove > 0) {
        jokersToRemove--;
        return false;
      }
      return true;
    }
    const key = `${card.suit}-${card.rank}`;
    return !dealtNonJokerKeys.has(key);
  });

  deck = shuffle(deck);

  const handsMap: Record<string, Card[]> = {};
  for (const h of gameInfo.hands) {
    handsMap[h.playerId] = [...h.hand];
  }

  const players: string[] = gameInfo.players || [];
  const dealerIndex = players.indexOf(gameInfo.dealerId as string);
  const dealOrder =
    dealerIndex >= 0
      ? [
          ...players.slice(dealerIndex + 1),
          ...players.slice(0, dealerIndex + 1),
        ]
      : players;

  const needMap: Record<string, number> = {};
  let totalNeeded = 0;
  for (const pid of players) {
    const need = Math.max(0, 9 - (handsMap[pid]?.length || 0));
    needMap[pid] = need;
    totalNeeded += need;
  }
  if (totalNeeded === 0) return gameInfo.hands;

  while (totalNeeded > 0 && deck.length > 0) {
    for (const pid of dealOrder) {
      if (needMap[pid] > 0 && deck.length > 0) {
        const next = deck.shift() as Card;
        handsMap[pid].push(next);
        needMap[pid] -= 1;
        totalNeeded -= 1;
      }
    }
  }

  const updatedHands = gameInfo.hands.map(
    (h: { playerId: string; hand: Card[] }) => ({
      playerId: h.playerId,
      hand: handsMap[h.playerId],
    })
  );

  await updateGameInfo(roomId, { hands: updatedHands });
  return updatedHands;
};
