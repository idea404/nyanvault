import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  let usdcAddress = "0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88";

  if (!usdcAddress || usdcAddress === "") {
    console.log("No USDC_ADDRESS provided – deploying MockUSDC …");
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const mockUsdc = await MockUSDC.deploy();
    await mockUsdc.waitForDeployment();
    usdcAddress = await mockUsdc.getAddress();
    console.log("MockUSDC deployed to", usdcAddress);

    // Mint an initial balance to the deployer for local testing (1,000,000 USDC).
    const mintAmount = ethers.parseUnits("1000000", 6); // 6-decimals
    const tx = await mockUsdc.mint(deployer.address, mintAmount);
    await tx.wait();
    console.log(`Minted ${mintAmount} USDC to deployer`);
  } else {
    console.log("Using existing USDC at", usdcAddress);
  }

  // Deploy the vault.
  const NYANVault = await ethers.getContractFactory("NYANVault");
  const vault = await NYANVault.deploy(usdcAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();

  console.log("NYANVault deployed to", vaultAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 