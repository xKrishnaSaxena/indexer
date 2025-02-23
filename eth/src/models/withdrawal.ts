import mongoose, { Schema } from "mongoose";

export interface IWithdrawal {
  user: mongoose.Types.ObjectId;
  txHash: string;
  amount: number;
  currency: "ETH" | "SOL";
  status: "pending" | "confirmed" | "failed";
  createdAt: Date;
  confirmedAt?: Date;
  fromAddress: string;
  toAddress: string;
  slot?: number;
  blockNumber?: number;
}

interface WithdrawalDocument extends IWithdrawal, mongoose.Document {}

const WithdrawalSchema = new Schema<WithdrawalDocument>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    txHash: { type: String, required: true, unique: true },
    amount: { type: Number, required: true },
    currency: { type: String, enum: ["ETH", "SOL"], required: true },
    status: {
      type: String,
      enum: ["pending", "confirmed", "failed"],
      default: "pending",
    },
    fromAddress: { type: String, required: true },
    toAddress: { type: String, required: true },
    slot: Number,
    blockNumber: Number,
    confirmedAt: Date,
  },
  { timestamps: true }
);

WithdrawalSchema.index({ user: 1 });
WithdrawalSchema.index({ txHash: 1 });
WithdrawalSchema.index({ status: 1 });
WithdrawalSchema.index({ currency: 1 });

export const Withdrawal = mongoose.model<WithdrawalDocument>(
  "Withdrawal",
  WithdrawalSchema
);
