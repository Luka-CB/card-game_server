import { RequestHandler } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import User from "../models/User.model";
import UserStats from "../models/UserStats.model";
import { transporter } from "../config/nodemailer";
import { getEmailTemplate } from "../utils/helper";

export const verifyEmail: RequestHandler = async (req, res, next) => {
  try {
    const { token } = req.query;

    const decoded = jwt.verify(
      token as string,
      process.env.JWT_SECRET as string,
    ) as JwtPayload;

    const updatedUser = await User.updateOne(
      { _id: decoded.id },
      { isVerified: true },
    );
    if (!updatedUser) throw new Error("Request has failed!");

    if (req.session.user && req.session.user._id === decoded.id) {
      req.session.user.isVerified = true;
      req.session.save();
    }

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const sendVerificationEmail: RequestHandler = async (req, res, next) => {
  try {
    const user = req.session.user;
    if (!user) throw new Error("Session user not found!");

    const token = jwt.sign(
      { id: user?._id },
      process.env.JWT_SECRET as string,
      { expiresIn: "10m" },
    );

    const verificationLink = `http://localhost:3000/?auth=verified&token=${token}`;

    const htmlContent = getEmailTemplate(
      "Verify Your Email",
      "Welcome to JokerNation! 🎉",
      `Hello ${user.originalUsername || "Player"},<br><br>
       Thank you for signing up! Please verify your email address to start playing Joker with players around the world.`,
      "verify Email Address",
      verificationLink,
    );

    const result = await transporter.sendMail({
      from: `"JokerNation" <${process.env.EMAIL}>`,
      to: user?.email,
      subject: "Verify Your Email - JokerNation",
      html: htmlContent,
    });
    if (!result) throw new Error("Error Sending Email!");

    res.status(200).json({ success: true, email: user?.email });
  } catch (error) {
    next(error);
  }
};

export const sendChangePasswordEmail: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) throw new Error(`${email} is not in our database!`);

    const token = jwt.sign(
      { id: user?._id },
      process.env.JWT_SECRET as string,
      { expiresIn: "10m" },
    );

    const changePasswordLink = `http://localhost:3000/?auth=change-password&token=${token}`;

    const htmlContent = getEmailTemplate(
      "Reset Your Password",
      "Password Reset Request 🔐",
      `Hello ${user.originalUsername || "Player"},<br><br>
       We received a request to reset your password. Click the button below to create a new password.`,
      "Reset Password",
      changePasswordLink,
    );

    const result = await transporter.sendMail({
      from: `"JokerNation" <${process.env.EMAIL}>`,
      to: user?.email,
      subject: "Reset Your Password - JokerNation",
      html: htmlContent,
    });
    if (!result) throw new Error("Error Sending Email!");

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const updateEmail: RequestHandler = async (req, res, next) => {
  try {
    const user = req.session.user;
    const { email } = req.body;

    if (!user) throw new Error("Session user not found!");

    const updatedUser = await User.updateOne({ _id: user._id }, { email });
    if (!updatedUser) throw new Error("Request has failed!");

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};
