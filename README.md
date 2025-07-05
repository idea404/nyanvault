# NYANVault

**Network:** Worldchain Sepolia (testnet)

| Contract            | Address                                         |
|---------------------|-------------------------------------------------|
| NYANVault           | `0x160521A3f3Caec20c0eF62bFFB846892f5769ae6`    |

---

## What is NYANVault?
NYANVault is a minimal, gas-efficient ERC-4626–style vault (without the interface) built for the hackathon.  Users deposit USDC and receive **NYAN** (18-decimal) vault shares.  An off-chain strategy program periodically updates the vault's Net Asset Value (`totalAssets`) so that 1 share automatically tracks underlying performance.

Key features:

* 🔄 **Deposits** – 1-step `deposit(assets, receiver)` mints proportional shares.
* 📤 **Redemptions** – Users submit a `redeemRequest(shares, receiver)` which burns shares and queues a withdrawal processed off-chain (useful for large/slow liquidity movements).
* 📈 **Dynamic NAV** – Owner can call `setTotalAssets()` to reflect strategy gains/losses; price per share updates automatically.
* 🔑 **Owner hooks** – `pullUnderlying()` enables moving USDC into external yield strategies.
* 🐱 **NYAN flavour** – Fun branding for the hackathon! 😸

---

## Quick Start (Local)

```bash
# 1. Install deps
npm install

# 2. Compile & test
npx hardhat test

# 3. (Optional) Deploy locally
npx hardhat run scripts/deploy.ts  # defaults to Hardhat network
```

To deploy to Worldchain Sepolia:

```bash
# Set RPC + private key via env vars or hardhat.config.ts, then
npx hardhat run --network worldchainSepolia scripts/deploy.ts
```

> The deploy script will reuse an existing USDC address if provided; otherwise it deploys a mock implementation for local use.

---

## Contract Details

### `NYANVault.sol`
* Inherits `ERC20` & `Ownable` from OpenZeppelin.
* Overrides `decimals()` to 18 while the underlying USDC uses 6 decimals.
* Events: `Deposit`, `WithdrawalRequested`, `WithdrawalProcessed`, `TotalAssetsUpdated`.
* Withdrawal queue is stored on-chain (`withdrawalRequests`) so off-chain executors can mark items as processed.

### Important Numbers
* **Price per share**: `pricePerShare()` returns `totalAssets * 1e18 / totalSupply()`.
* **1 USDC in shares**: `1e12` (because 6 dp -> 18 dp).

---

## Running the Hardhat Tests
The test-suite covers deposits, proportional minting, redemption queueing, admin functions, and edge cases.

```bash
npx hardhat test
```

Expect output similar to:
```
  NYANVault
    deposit
      ✓ mints correct shares on first deposit (###ms)
      ✓ mints proportional shares on subsequent deposit (###ms)
    redeemRequest
      ✓ burns shares and logs withdrawal request (###ms)
    owner functions
      ✓ allows owner to mark withdrawal processed (###ms)
      ✓ prevents non-owner from marking processed (###ms)
      ✓ updates totalAssets via setTotalAssets (###ms)
```

---

## Security & Disclaimers
* This code has **NOT** been audited. Use at your own risk.
* Designed for hackathon demo purposes; many production-grade safety checks (re-entrancy guards, pausing, time-locks) are omitted for brevity.
* Off-chain components (strategy & withdrawal executor) are **out of scope** for this repo.

---

## License
MIT © 2024 Hackathon Team 