import mongoose from "mongoose";
import bcrypt from "bcrypt";

export interface UserIFace {
  _id: string;
  username: string;
  originalUsername: string;
  email: string;
  avatar: string;
  provider: "local" | "google" | "facebook";
  providerId: string;
  password: string;
  isVerified: boolean;
  matchPasswords: (password: string) => Promise<boolean>;
}

const userSchema = new mongoose.Schema<UserIFace>(
  {
    username: {
      type: String,
      lowercase: true,
      required: [true, "Please provide a username"],
      unique: true,
      trim: true,
    },
    originalUsername: {
      type: String,
      required: [true, "Please provide an original username"],
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Please provide an email"],
      unique: true,
      trim: true,
    },
    avatar: {
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
      trim: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPasswords = async function (
  password: string,
): Promise<boolean> {
  return await bcrypt.compare(password, this.password);
};

export default mongoose.model("User", userSchema);
