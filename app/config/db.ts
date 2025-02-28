import mongoose, { MongooseError } from "mongoose";

const connectDB = async () => {
  try {
    mongoose.set("strictQuery", true);
    const uri: string = process.env.MONGO_URI || "";
    const conn = await mongoose.connect(uri);
    console.log(
      `MongoDB Connected: ${conn.connection.host}`.green.underline.bold
    );
  } catch (error: MongooseError | any) {
    console.error(`Error: ${error.message}`.red.underline.bold);
    process.exit(1);
  }
};

export default connectDB;
