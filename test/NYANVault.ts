import { expect } from "chai";
import { ethers as hardhatEthers } from "hardhat";
import { ethers as ethersLib } from "ethers";

const USDC_DECIMALS = 6;
const WEI_PER_ETHER = 1_000_000_000_000_000_000n; // 1e18

// Helpers
const toUSDC = (amount: string | number): bigint => {
  return ethersLib.parseUnits(amount.toString(), USDC_DECIMALS);
};

const ONE_USDC_IN_SHARES = 1_000_000_000_000n; // 1e12

describe("NYANVault", function () {
  let owner: any;
  let user1: any;
  let user2: any;
  let usdc: any;
  let vault: any;

  beforeEach(async function () {
    [owner, user1, user2] = await hardhatEthers.getSigners();

    const ownerAddr = await owner.getAddress();
    const user1Addr = await user1.getAddress();
    const user2Addr = await user2.getAddress();

    const USDC = await hardhatEthers.getContractFactory("MockUSDC");
    usdc = (await USDC.deploy()) as any;
    await usdc.waitForDeployment();

    // Mint USDC to users
    await usdc.mint(user1Addr, toUSDC(1000)); // 1,000 USDC
    await usdc.mint(user2Addr, toUSDC(1000));

    const usdcAddr = await usdc.getAddress();

    const Vault = await hardhatEthers.getContractFactory("NYANVault");
    vault = (await Vault.deploy(usdcAddr)) as any;
    await vault.waitForDeployment();

    // Store addresses for later use in tests
    (this as any).addrs = { ownerAddr, user1Addr, user2Addr, usdcAddr, vaultAddr: await vault.getAddress() };
  });

  describe("deposit", function () {
    it("mints correct shares on first deposit", async function () {
      const depositAmount = toUSDC(100); // 100 USDC

      const { user1Addr, vaultAddr } = (this as any).addrs;
      await usdc.connect(user1).approve(vaultAddr, depositAmount);
      await expect(vault.connect(user1).deposit(depositAmount, user1Addr))
        .to.emit(vault, "Deposit");

      // shares = assets * 1e12
      const expectedShares = depositAmount * ONE_USDC_IN_SHARES;
      expect(await vault.balanceOf(user1Addr)).to.equal(expectedShares);

      // totalAssets updated
      expect(await vault.totalAssets()).to.equal(depositAmount);

      // pricePerShare should equal (totalAssets * 1e18) / totalSupply
      const totalSupply = await vault.totalSupply();
      const expectedPrice = (depositAmount * WEI_PER_ETHER) / totalSupply;
      expect(await vault.pricePerShare()).to.equal(expectedPrice);
    });

    it("mints proportional shares on subsequent deposit", async function () {
      const firstDeposit = toUSDC(100);
      const { user1Addr, vaultAddr } = (this as any).addrs;
      await usdc.connect(user1).approve(vaultAddr, firstDeposit);
      await vault.connect(user1).deposit(firstDeposit, user1Addr);

      const secondDeposit = toUSDC(50);
      const { user2Addr } = (this as any).addrs;
      await usdc.connect(user2).approve(vaultAddr, secondDeposit);
      await vault.connect(user2).deposit(secondDeposit, user2Addr);

      // Expected shares: first deposit 100*1e12, second deposit 50*1e12
      const expectedUser1Shares = firstDeposit * ONE_USDC_IN_SHARES;
      const expectedUser2Shares = secondDeposit * ONE_USDC_IN_SHARES;

      expect(await vault.balanceOf(user1Addr)).to.equal(expectedUser1Shares);
      expect(await vault.balanceOf(user2Addr)).to.equal(expectedUser2Shares);

      // Total supply == 150*1e12
      expect(await vault.totalSupply()).to.equal(expectedUser1Shares + expectedUser2Shares);

      // totalAssets == 150 USDC
      expect(await vault.totalAssets()).to.equal(firstDeposit + secondDeposit);
    });
  });

  describe("redeemRequest", function () {
    beforeEach(async function () {
      const depositAmount = toUSDC(150); // user1 deposits 150 USDC
      const { user1Addr, vaultAddr } = (this as any).addrs;
      await usdc.connect(user1).approve(vaultAddr, depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1Addr);
    });

    it("burns shares and logs withdrawal request", async function () {
      const totalSupplyBefore = await vault.totalSupply();
      const totalAssetsBefore = await vault.totalAssets();

      const burnShares = toUSDC(50) * ONE_USDC_IN_SHARES; // 50 shares in USDC -> shares

      // assets expected from redemption
      const expectedAssets = burnShares * totalAssetsBefore / totalSupplyBefore;

      const { user1Addr, vaultAddr } = (this as any).addrs;
      await expect(vault.connect(user1).redeemRequest(burnShares, user1Addr))
        .to.emit(vault, "WithdrawalRequested");

      // Shares burned
      expect(await vault.balanceOf(user1Addr)).to.equal(totalSupplyBefore - burnShares);

      // withdrawal request stored correctly
      const requestId = 0; // first request
      const request = await vault.withdrawalRequests(requestId);
      expect(request.receiver).to.equal(user1Addr);
      expect(request.assets).to.equal(expectedAssets);
      expect(request.shares).to.equal(burnShares);
      expect(request.processed).to.equal(false);

      // nextWithdrawalRequestId incremented
      expect(await vault.nextWithdrawalRequestId()).to.equal(1n);
    });
  });

  describe("owner functions", function () {
    beforeEach(async function () {
      const depositAmount = toUSDC(100);
      const { user1Addr, vaultAddr } = (this as any).addrs;
      await usdc.connect(user1).approve(vaultAddr, depositAmount);
      await vault.connect(user1).deposit(depositAmount, user1Addr);
      await vault.connect(user1).redeemRequest(depositAmount * ONE_USDC_IN_SHARES, user1Addr);
    });

    it("allows owner to mark withdrawal processed", async function () {
      await expect(vault.connect(owner).markWithdrawalProcessed(0))
        .to.emit(vault, "WithdrawalProcessed");
      const request = await vault.withdrawalRequests(0);
      expect(request.processed).to.equal(true);
    });

    it("prevents non-owner from marking processed", async function () {
      await expect(vault.connect(user1).markWithdrawalProcessed(0)).to.be.reverted;
    });

    it("updates totalAssets via setTotalAssets", async function () {
      const newTotal = toUSDC(80);
      await expect(vault.connect(owner).setTotalAssets(newTotal))
        .to.emit(vault, "TotalAssetsUpdated")
        .withArgs(await vault.totalAssets(), newTotal);
      expect(await vault.totalAssets()).to.equal(newTotal);
    });
  });
}); 