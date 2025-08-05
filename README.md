# 🏆 Reputation Scoreboard — Solana Smart Contract

This smart contract is a **Reputation Scoreboard** system built on the Solana blockchain using the **Anchor framework**.

It is designed for DAOs, guilds, or Web3 communities that want to **track, reward, and manage contributor reputation on-chain**, with rules for voting, role unlocking, and leaderboard ranking.

> 📌 This project was built as part of the **Codigo DevQuest - Week 2** (Governance Track) in collaboration with Superteam Nigeria.

---

## ✨ Features

- ✅ **Reputation System**: Upvote/downvote contributors using wallet addresses
- 🕒 **Per-Target Cooldown**: Prevent repeated voting on the same user within a cooldown period
- 🪙 **Token-Gated Voting**: Require voters to hold a specific SPL token
- 🔒 **Role Unlock**: Grant "Top Contributor" status when score reaches a threshold
- 🧼 **Score Reset**: Admin can reset any user’s reputation
- 📢 **Events**: Emits events (`Upvoted`, `Downvoted`, `RoleUnlocked`) for frontends and indexers
- 📊 **Leaderboard Pagination**: Fetch top contributors with pagination

---

## 🛠️ Technologies Used

| Stack | Purpose |
|-------|---------|
| [Solana](https://solana.com/) | Layer-1 Blockchain |
| [Anchor](https://book.anchor-lang.com/) | Rust framework for Solana programs |
| [SPL Token](https://spl.solana.com/token) | Token-based voting logic |
| [Codigo AI](https://codigo.ai) | AI-powered smart contract generation |
| [TypeScript](https://www.typescriptlang.org/) | Unit testing |
| [Mocha + Chai](https://mochajs.org/) | Test runner and assertions |

---

## 🧠 Program Overview

### 📦 Accounts

#### `ReputationBoard`
- `authority`: Pubkey (admin)
- `cooldown`: i64 (in seconds)
- `token_mint`: Pubkey (SPL token required to vote)

#### `ReputationEntry`
- `user`: Pubkey
- `reputation`: i64
- `last_vote_ts`: i64
- `top_contributor`: bool

#### `VoteTracker` (per-voter-per-target)
- `voter`: Pubkey
- `target`: Pubkey
- `last_vote_ts`: i64

---

### 📜 Instructions

| Instruction | Description |
|-------------|-------------|
| `initialize_board` | Initializes the scoreboard with authority, cooldown, and token mint |
| `upvote(target: Pubkey)` | Upvotes a target user, enforces cooldown, checks token balance |
| `downvote(target: Pubkey)` | Downvotes a target user, enforces cooldown, checks token balance |
| `reset_score(target: Pubkey)` | Admin-only: resets the target user’s score |
| `unlock_role(target: Pubkey)` | Flags user as `top_contributor` if reputation ≥ threshold |
| `get_leaderboard(offset, limit)` | Returns paginated list of top users (may be off-chain) |

---

## ✅ Unit Tests (Included)

- Initializes the board with cooldown and token mint
- Successfully upvotes and downvotes
- Fails to vote before cooldown expires
- Validates token holding before voting
- Unlocks role at the correct threshold
- Resets score correctly

> All tests written in **TypeScript** using Anchor’s Mocha test framework

---

## 🚀 How to Deploy Locally

```bash
git clone https://github.com/your-username/reputation-scoreboard
cd reputation-scoreboard

anchor sync key
anchor build
anchor deploy
anchor test
