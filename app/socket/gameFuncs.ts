import redisClient from "../config/redisClient";
import { randomUUID } from "crypto";
import { Card, PlayingCard, Rank, Suit } from "../utils/interfaces.util";

const createDeck = (): Card[] => {
  const suits: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
  const ranks: Rank[] = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  let deck: Card[] = [];

  for (let suit of suits) {
    for (let rank of ranks) {
      deck.push({ suit, rank, id: randomUUID() });
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
    { joker: true, id: randomUUID(), color: "black" },
    { joker: true, id: randomUUID(), color: "red" }
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

  const initialGameInfo = {
    id: randomUUID(),
    roomId,
    status: "dealing",
    dealerId: null,
    currentHand: null,
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
    currentHand: number | null;
    trumpCard: Card | null;
    hands: { hand: Card[]; playerId: string }[] | null;
  }>
) => {
  const game = await getGameInfo(roomId);
  if (!game) return;

  console.log("Updating game info:", gameData);

  const updatedGame = {
    ...game,
    ...gameData,
  };

  console.log("Updated game info:", updatedGame);

  await redisClient.hset("games", roomId, JSON.stringify(updatedGame));
  return updatedGame;
};

export const removeGameInfo = async (roomId: string) => {
  await redisClient.hdel("games", roomId);
};

export const getTrumpCard = async (roomId: string) => {
  const deck = shuffle(createDeck());
  const trumpCard = deck.pop();
  if (!trumpCard) return null;
  await updateGameInfo(roomId, { trumpCard });
  return trumpCard;
};
