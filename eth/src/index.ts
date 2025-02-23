import { formatEther, JsonRpcProvider } from "ethers";
import axios from "axios";
import config from "./utils/config";
import mongoose from "mongoose";
import { User } from "./models/user";
import { Deposit } from "./models/deposit";
import { Withdrawal } from "./models/withdrawal";

const alchemyUrl = config.BLOCKCHAIN_RPC_URL;
const provider = new JsonRpcProvider(alchemyUrl);
let lastProcessedBlock = 0;

const PENDING_CHECK_INTERVAL = 30 * 1000;

interface BlockNumberResponse {
  result: string;
}

async function getLatestBlockNumber(): Promise<number> {
  const response = await axios.post<BlockNumberResponse>(alchemyUrl, {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_blockNumber",
    params: [],
  });
  return parseInt(response.data.result, 16);
}

async function main() {
  await mongoose.connect(config.MONGO_URI, {});
  lastProcessedBlock = await getLatestBlockNumber();
  pollNewBlocks();
  setInterval(checkPendingActions, PENDING_CHECK_INTERVAL);
}

async function pollNewBlocks() {
  while (true) {
    const latestBlock = await getLatestBlockNumber();
    console.log("Latest Block -> ", latestBlock);
    console.log("Last Processed Block -> ", lastProcessedBlock);

    if (latestBlock > lastProcessedBlock) {
      for (
        let blockNumber = lastProcessedBlock + 1;
        blockNumber <= latestBlock;
        blockNumber++
      ) {
        await processBlockTransactions(blockNumber);
      }
      lastProcessedBlock = latestBlock;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

async function getTransactionReceipt(
  blockNumber: number
): Promise<TransactionReceiptResponse> {
  const response = await axios.post(alchemyUrl, {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_getBlockReceipts",
    params: ["0x" + blockNumber.toString(16)],
  });
  //@ts-ignore
  return response.data;
}

interface TransactionReceipt {
  transactionHash: string;
  from: string;
  to: string;
}

interface TransactionReceiptResponse {
  result: TransactionReceipt[];
}

async function processBlockTransactions(blockNumber: number) {
  const transactions = await getTransactionReceipt(blockNumber);

  if (!transactions?.result) return;

  const dbUsers = await User.find(
    {},
    { ethDepositAddress: 1, _id: 1, ethBalance: 1 }
  );

  const dbAddresses = dbUsers.map((user) =>
    user.ethDepositAddress.toLowerCase()
  );

  const depositTransactions = transactions.result.filter(
    (tx) => tx.to && dbAddresses.includes(tx.to)
  );

  await processDeposits(depositTransactions, blockNumber);

  const withdrawalTransactions = transactions.result.filter(
    (tx) => tx.from && dbAddresses.includes(tx.from)
  );

  await processWithdrawals(withdrawalTransactions, blockNumber);
}

async function processDeposits(
  transactions: TransactionReceipt[],
  blockNumber: number
) {
  const fullTxns = await Promise.all(
    transactions.map(
      async ({ transactionHash }) =>
        await provider.getTransaction(transactionHash)
    )
  );

  for (const txn of fullTxns) {
    if (!txn || !txn.to || !txn.value) continue;

    const recipient = txn.to;
    const amountInEth = parseFloat(formatEther(txn.value));
    const user = await User.findOne({ ethDepositAddress: recipient });

    if (user) {
      const existingDeposit = await Deposit.findOne({ txHash: txn.hash });
      if (!existingDeposit) {
        const deposit = new Deposit({
          user: user._id,
          txHash: txn.hash,
          amount: amountInEth,
          currency: "ETH",
          status: "confirmed",
          toAddress: recipient,
          confirmedAt: new Date(),
        });
        await deposit.save();
      }

      await User.updateOne(
        { _id: user._id },
        { $inc: { ethBalance: amountInEth } }
      );
      console.log(`Deposit ${txn.hash}: +${amountInEth} ETH to ${recipient}`);
    }
  }
}

async function processWithdrawals(
  transactions: TransactionReceipt[],
  blockNumber: number
) {
  const fullTxns = await Promise.all(
    transactions.map(
      async ({ transactionHash }) =>
        await provider.getTransaction(transactionHash)
    )
  );

  for (const txn of fullTxns) {
    if (!txn || !txn.from || !txn.value) continue;

    const sender = txn.from;

    const amountInEth = parseFloat(formatEther(txn.value));

    const user = await User.findOne({ ethDepositAddress: sender });

    if (user) {
      const withdrawal = await Withdrawal.findOne({ txHash: txn.hash });

      if (withdrawal) {
        if (withdrawal.status === "pending") {
          withdrawal.status = "confirmed";
          withdrawal.confirmedAt = new Date();
          await withdrawal.save();

          console.log(
            `Withdrawal ${txn.hash}: -${amountInEth} ETH from ${sender} (pending->confirmed)`
          );
        }
      } else {
        const unexpectedWithdrawal = new Withdrawal({
          user: user._id,
          txHash: txn.hash,
          currency: "ETH",
          amount: amountInEth,
          status: "pending",
          fromAddress: sender,
          toAddress: txn.to || "",
        });
        console.warn(
          `Unauthorized withdrawal detected from ${sender}: ${txn.hash}`
        );
        await unexpectedWithdrawal.save();
      }
    }
  }
}

async function checkPendingActions() {
  console.log("Checking pending transactions...");

  const pendingDeposits = await Deposit.find({ status: "pending" });
  for (const deposit of pendingDeposits) {
    const tx = await provider.getTransaction(deposit.txHash);
    if (tx && tx.blockNumber) {
      deposit.status = "confirmed";
      deposit.confirmedAt = new Date();
      await deposit.save();
    }
  }

  const pendingWithdrawals = await Withdrawal.find({ status: "pending" });
  for (const withdrawal of pendingWithdrawals) {
    const tx = await provider.getTransaction(withdrawal.txHash);

    if (!tx) {
      withdrawal.status = "failed";
      await withdrawal.save();
      continue;
    }

    if (tx.blockNumber) {
      withdrawal.status = "confirmed";
      withdrawal.confirmedAt = new Date();
      await withdrawal.save();

      await User.updateOne(
        { _id: withdrawal.user },
        { $inc: { ethBalance: -withdrawal.amount } }
      );
      console.log(
        `Withdrawal ${withdrawal.txHash} confirmed: -${withdrawal.amount} ETH`
      );
    }
  }
}

main();
