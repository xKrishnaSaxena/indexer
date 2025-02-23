import mongoose from "mongoose";
import bcrypt from "bcrypt";

export interface IUser {
  username: string;
  email: string;
  password: string;
  ethDepositAddress: string;
  solDepositAddress: string;
  ethPrivateKey: string;
  solPrivateKey: string;
  ethBalance: number;
  solBalance: number;
}

interface UserDocument extends IUser, mongoose.Document {
  comparePassword(password: string): Promise<boolean>;
}

const UserSchema = new mongoose.Schema<UserDocument>({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  ethDepositAddress: {
    type: String,
    default: "",
  },
  solDepositAddress: {
    type: String,
    default: "",
  },
  ethPrivateKey: {
    type: String,
    default: "",
  },
  solPrivateKey: {
    type: String,
    default: "",
  },
  ethBalance: {
    type: Number,
    default: 0,
  },
  solBalance: {
    type: Number,
    default: 0,
  },
});

UserSchema.pre<UserDocument>("save", async function (next) {
  if (this.isModified("password")) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

UserSchema.methods.comparePassword = async function (enteredPassword: string) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export const User = mongoose.model<UserDocument>("User", UserSchema);
