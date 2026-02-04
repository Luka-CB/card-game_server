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

export const getEmailTemplate = (
  title: string,
  heading: string,
  message: string,
  buttonText: string,
  buttonLink: string,
) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center; border-radius: 8px 8px 0 0;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">
                    🃏 JokerNation
                  </h1>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding: 40px 30px;">
                  <h2 style="margin: 0 0 20px 0; color: #333333; font-size: 24px;">
                    ${heading}
                  </h2>
                  <p style="margin: 0 0 30px 0; color: #666666; font-size: 16px; line-height: 1.6;">
                    ${message}
                  </p>

                  <!-- Button -->
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" style="padding: 20px 0;">
                        <a href="${buttonLink}" style="display: inline-block; padding: 15px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                          ${buttonText}
                        </a>
                      </td>
                    </tr>
                  </table>

                  <p style="margin: 30px 0 0 0; color: #999999; font-size: 14px; line-height: 1.6;">
                    If the button above doesn't work, copy and paste this link into your browser:
                  </p>
                  <p style="margin: 10px 0 0 0; word-break: break-all;">
                    <a href="${buttonLink}" style="color: #667eea; text-decoration: none; font-size: 14px;">
                      ${buttonLink}
                    </a>
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-radius: 0 0 8px 8px;">
                  <p style="margin: 0 0 10px 0; color: #999999; font-size: 14px;">
                    this link will expire in 10 minutes.
                  </p>
                  <p style="margin: 0; color: #999999; font-size: 12px;">
                    &copy; ${new Date().getFullYear()} JokerNation. All rights reserved.
                  </p>
                  <p style="margin: 10px 0 0 0; color: #cccccc; font-size: 12px;">
                    If you didn't request this email, please ignore it.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};
