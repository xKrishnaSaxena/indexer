import { Connection } from "@solana/web3.js";
import config from "./utils/config";
import mongoose from "mongoose";
import { User } from "./models/user";
import { Withdrawal } from "./models/withdrawal";
import { Deposit } from "./models/deposit";

const RPC = config.SOLANA_RPC_URL;
const solanaConnection = new Connection(RPC, "confirmed");
let lastProcessedSolSlot = 0;
async function getLatestSolanaSlot(): Promise<number> {
  const slot = await solanaConnection.getSlot();

  return slot;
}

async function pollNewSolanaSlots() {
  while (true) {
    const latestSlot = await getLatestSolanaSlot();
    if (latestSlot > lastProcessedSolSlot) {
      for (let slot = lastProcessedSolSlot + 1; slot <= latestSlot; slot++) {
        await processSolanaBlock(slot);
      }
      lastProcessedSolSlot = latestSlot;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
async function processSolanaBlock(slot: number) {
  const block = await solanaConnection.getBlock(slot, {
    maxSupportedTransactionVersion: 0,
    transactionDetails: "full",
    rewards: false,
  });
  console.log("SLOT -> ", slot);

  if (!block) return;

  const dbUsers = await User.find(
    {},
    { solDepositAddress: 1, _id: 1, solBalance: 1 }
  );

  const depositAddresses = dbUsers.map((u) => u.solDepositAddress);

  for (const tx of block.transactions) {
    try {
      const txId = tx.transaction.signatures[0];

      const message = tx.transaction.message;

      const accountKeys =
        //@ts-ignore
        message?.accountKeys || message?.staticAccountKeys || [];

      if (!accountKeys || accountKeys.length < 2) {
        continue;
      }

      let fromAddress = accountKeys[0]?.toBase58() || "Unknown";

      let toAddress = accountKeys[1]?.toBase58() || "Unknown";

      const preBalance = tx.meta?.preBalances[1];
      const postBalance = tx.meta?.postBalances[1];
      if (!preBalance || !postBalance) {
        continue;
      }
      const transferredAmount = (postBalance - preBalance) / 1e9;

      if (depositAddresses.includes(toAddress)) {
        const user = dbUsers.find((u) => u.solDepositAddress === toAddress);
        if (user) await handleSolDeposit(user, txId, transferredAmount, slot);
      }
      if (depositAddresses.includes(fromAddress)) {
        console.log("Withdrawal Address:", fromAddress);
        console.log("To Address:", toAddress);
        toAddress = toAddress;
        const user = dbUsers.find((u) => u.solDepositAddress === fromAddress);
        if (user)
          await handleSolWithdrawal(
            user,
            txId,
            transferredAmount,
            slot,
            toAddress
          );
      }
    } catch (error) {
      console.error("Error processing transaction:", error);
    }
  }
}
async function handleSolDeposit(
  user: any,
  txHash: string,
  amount: number,
  slot: number
) {
  const existingDeposit = await Deposit.findOne({ txHash, currency: "SOL" });
  if (!existingDeposit) {
    const deposit = new Deposit({
      user: user._id,
      txHash,
      amount,
      currency: "SOL",
      status: "confirmed",
      toAddress: user.solDepositAddress,
      confirmedAt: new Date(),
      slot,
    });
    await deposit.save();
    await User.updateOne({ _id: user._id }, { $inc: { solBalance: amount } });
    console.log(
      `Deposit ${txHash}: +${amount} SOL to ${user.solDepositAddress}`
    );
  }
}

async function handleSolWithdrawal(
  user: any,
  txHash: string,
  amount: number,
  slot: number,
  toAddress: string
) {
  const existingWithdrawal = await Withdrawal.findOne({
    txHash,
    currency: "SOL",
  });
  if (existingWithdrawal) {
    if (existingWithdrawal.status === "pending") {
      existingWithdrawal.status = "confirmed";
      existingWithdrawal.confirmedAt = new Date();
      existingWithdrawal.slot = slot;
      await existingWithdrawal.save();

      console.log(
        `Withdrawal ${txHash}: -${amount} SOL from ${user.solDepositAddress}`
      );
    }
  } else {
    const withdrawal = new Withdrawal({
      user: user._id,
      txHash,
      amount,
      currency: "SOL",
      status: "failed",
      fromAddress: user.solDepositAddress,
      toAddress: toAddress,
      slot,
    });
    await withdrawal.save();
    console.warn(
      `Unauthorized withdrawal from ${user.solDepositAddress}: ${txHash}`
    );
  }
}
async function checkPendingActions() {
  console.log("Checking pending transactions...");

  const pendingSolDeposits = await Deposit.find({
    status: "pending",
    currency: "SOL",
  });
  for (const deposit of pendingSolDeposits) {
    const tx = await solanaConnection.getTransaction(deposit.txHash, {
      commitment: "confirmed",
    });
    if (tx?.slot) {
      deposit.status = "confirmed";
      deposit.confirmedAt = new Date();
      deposit.slot = tx.slot;
      await deposit.save();
    }
  }

  const pendingSolWithdrawals = await Withdrawal.find({
    status: "pending",
    currency: "SOL",
  });
  for (const withdrawal of pendingSolWithdrawals) {
    const tx = await solanaConnection.getTransaction(withdrawal.txHash, {
      commitment: "confirmed",
    });
    if (!tx) {
      withdrawal.status = "failed";
      await withdrawal.save();
    } else if (tx.slot) {
      withdrawal.status = "confirmed";
      withdrawal.confirmedAt = new Date();
      withdrawal.slot = tx.slot;
      await withdrawal.save();
      await User.updateOne(
        { _id: withdrawal.user },
        { $inc: { solBalance: -withdrawal.amount } }
      );
    }
  }
}
const PENDING_CHECK_INTERVAL = 5 * 60 * 1000;
async function main() {
  await mongoose.connect(config.MONGO_URI, {});

  lastProcessedSolSlot = await getLatestSolanaSlot();
  pollNewSolanaSlots();

  setInterval(checkPendingActions, PENDING_CHECK_INTERVAL);
}

main();
