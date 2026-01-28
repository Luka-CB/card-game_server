import mongoose from "mongoose";

interface AvatarAttrs {
  _id: string;
  url: string;
  name?: string;
}

const avatarSchema = new mongoose.Schema<AvatarAttrs>({
  url: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: false,
  },
});

export default mongoose.model<AvatarAttrs>("Avatar", avatarSchema);
