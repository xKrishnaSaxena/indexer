# Blockchain Indexer for Ethereum and Solana

A real-time blockchain indexer that tracks Ethereum (ETH) and Solana (SOL) transactions, processes deposits/withdrawals, and maintains user balances in MongoDB.

## Features

- **Dual Blockchain Support**
  - Ethereum (ETH) transaction indexing
  - Solana (SOL) transaction indexing
- **Real-time Processing**
  - Monitors new blocks/slots on both chains
  - Processes transactions as they are confirmed
- **Balance Management**
  - Automatic ETH/SOL balance updates for users
  - Handles both deposits and withdrawals
- **Transaction Tracking**
  - Stores all deposit/withdrawal transactions
  - Tracks transaction status (pending/confirmed/failed)
- **Pending Transaction Resolution**
  - Regular checks for pending transaction confirmations
  - Automatic status updates and balance adjustments

## Tech Stack

- **Ethereum**: ethers.js, Alchemy RPC
- **Solana**: @solana/web3.js
- **Database**: MongoDB with Mongoose ODM
- **Backend**: Node.js, TypeScript
