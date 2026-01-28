import { UserStatsIFace } from "../models/UserStats.model";

export const getHandNumber = (
  handCount: number,
  gameType: "classic" | "nines",
): number => {
  const hc = Math.max(1, handCount || 1);

  if (gameType === "nines") {
    return 9;
  }

  if (hc >= 1 && hc <= 8) return hc;
  if (hc >= 9 && hc <= 12) return 9;
  if (hc >= 13 && hc <= 20) return 21 - hc;
  if (hc >= 21 && hc <= 24) return 9;

  return 9;
};

export const calculateRating = (userStats: UserStatsIFace): number => {
  const { gamesPlayed, gamesFinished, gamesLeft } = userStats;

  let rating = 0;

  const totalGamesFinished =
    gamesFinished.first +
    gamesFinished.second +
    gamesFinished.third +
    gamesFinished.fourth;

  if (totalGamesFinished > 0) {
    const placementPoints =
      gamesFinished.first * 1.5 +
      gamesFinished.second * 0.5 +
      gamesFinished.third * 0.0 +
      gamesFinished.fourth * -0.5;

    rating += placementPoints;

    const topTwoFinishes = gamesFinished.first + gamesFinished.second;
    const bottomFinish = gamesFinished.fourth;
    const winRate = (topTwoFinishes - bottomFinish) / totalGamesFinished;

    rating += winRate * 2;
  }

  if (gamesLeft > 0) {
    const abandonPenalty = gamesLeft * -0.3;
    rating += abandonPenalty;
  }

  if (gamesPlayed > 0) {
    const unfinishedGames = gamesPlayed - totalGamesFinished;
    if (unfinishedGames > 0) {
      rating += unfinishedGames * -0.5;
    }
  }

  return Math.round(rating * 10) / 10;
};
