import { RequestHandler } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import User from "../models/User.model";
import { transporter } from "../config/nodemailer";

export const verifyEmail: RequestHandler = async (req, res, next) => {
  try {
    const { token } = req.query;

    const decoded = jwt.verify(
      token as string,
      process.env.JWT_SECRET as string
    ) as JwtPayload;

    const updatedUser = await User.updateOne(
      { _id: decoded.id },
      { isVerified: true }
    );
    if (!updatedUser) throw new Error("Request has failed!");

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
      { expiresIn: "10m" }
    );

    const verificationLink = `http://localhost:3000/?auth=verified&token=${token}`;

    const result = await transporter.sendMail({
      from: process.env.EMAIL,
      to: user?.email,
      subject: "Email Verification",
      html: `<p>Please click the link to <a href="${verificationLink}">verify your email</a>!</p>`,
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
  next
) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) throw new Error(`${email} is not in our database!`);

    const token = jwt.sign(
      { id: user?._id },
      process.env.JWT_SECRET as string,
      { expiresIn: "10m" }
    );

    const changePasswordLink = `http://localhost:3000/?auth=change-password&token=${token}`;

    const result = await transporter.sendMail({
      from: process.env.EMAIL,
      to: user?.email,
      subject: "Change Password",
      html: `<p>Please click the link to <a href="${changePasswordLink}">change your password</a>!</p>`,
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
