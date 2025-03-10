import session from "express-session";

export interface UserSession extends session.Session {
  user?: {
    _id: string;
    username: string;
    avatar: string;
    email: string;
    isVerified: boolean;
  };
}
