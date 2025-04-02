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
