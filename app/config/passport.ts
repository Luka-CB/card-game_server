import passport from "passport";
import User from "../models/User.model";

import googleOauth from "passport-google-oauth20";

const GoogleStrategy = googleOauth.Strategy;

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      callbackURL: process.env.GOOGLE_CLIENT_CALLBACK_URL as string,
    },
    async (accessToken, getRefreshToken, profile, done) => {
      try {
        let user = await User.findOne({
          email: profile.emails && profile.emails[0].value,
        });

        if (user && !user.providerId) {
          return done(null, false, {
            message: "This email is already registered!",
          });
        }

        if (user) {
          return done(null, user);
        } else {
          user = await User.create({
            username: profile.displayName,
            email: profile.emails && profile.emails[0]?.value,
            avatar: profile.photos && profile.photos[0].value,
            provider: profile.provider,
            providerId: profile.id,
            isVerified: true,
          });

          return done(null, user);
        }
      } catch (error) {
        if (error instanceof Error) {
          console.log(error.message);
          return done(error, false);
        } else {
          console.log("An unknown error occurred");
          return done(new Error("An unknown error occurred"), false);
        }
      }
    }
  )
);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user: any, done) => done(null, user));
