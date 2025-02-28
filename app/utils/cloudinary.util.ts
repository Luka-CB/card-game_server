import cloudinary from "../config/cloudinary";

export const uploadImage = async (image: string, folderName: string) => {
  const result = await cloudinary.v2.uploader.unsigned_upload(
    image,
    "card-game",
    {
      folder: `card-game/${folderName}`,
    }
  );

  return result;
};
