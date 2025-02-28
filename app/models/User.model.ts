import mongoose from "mongoose";
import bcrypt from "bcrypt";

export interface UserIFace {
  _id: string;
  username: string;
  email: string;
  avatar: string;
  avatarId: string;
  provider: "local" | "google" | "facebook";
  providerId: string;
  password: string;
  isVerified: boolean;
  matchPassword?: (password: string) => void;
}

const userSchema = new mongoose.Schema<UserIFace>(
  {
    username: {
      type: String,
      required: [true, "Please provide a username"],
      unique: true,
    },
    email: {
      type: String,
      required: [true, "Please provide an email"],
      unique: true,
    },
    avatar: {
      type: String,
    },
    avatarId: {
      type: String,
    },
    provider: {
      type: String,
      default: "local",
    },
    providerId: {
      type: String,
    },
    password: {
      type: String,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPasswords = async function (password: string) {
  return await bcrypt.compare(password, this.password);
};

export default mongoose.model("User", userSchema);
