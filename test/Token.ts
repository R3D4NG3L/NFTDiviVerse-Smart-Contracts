import {
  loadFixture,
} from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
const { EcosystemHelper } = require('../lib');
const BN = require('bn.js');

const decimals = new BN(10).pow(new BN(18));
const initialSupply = new BN("100000000").mul(decimals);
const tokensToAddToLiquidity = BigInt(new BN(17450000).mul(decimals)); //17,450,000 Tokens to LP
const ethToAddToLiquidity = BigInt(new BN(10).mul(decimals));
const ethTokensRatio = new BN(tokensToAddToLiquidity).div(new BN(ethToAddToLiquidity));
const helper = new EcosystemHelper();

describe("Token", function () {
  async function deployTokenFixture() {
    console.log(`--------------------------------------------`);
    console.log(`deployTokenFixture`);
    console.log(`--------------------------------------------`);
    const [owner, addr1, addr2, addr3] = await ethers.getSigners();

    const routerAddress = "0x10ed43c718714eb63d5aa57b78b54704e256024e"; // BSC Pancake Router
    const Token = await ethers.getContractFactory("Token");
    const token = await Token.deploy(routerAddress);
    const Nft = await ethers.getContractFactory("Nft");
    const NftDeployed = await Nft.deploy(owner.address);

    // Enable trading
    console.log(`----Enabling trading...`);
    await token.enableTrading();
    expect(await token.isTradingEnabled()).to.equal(true);
    console.log(`--------------------------------------------`);

    // Verify owner has total supply
    const totalSupply = await token.totalSupply();
    const ownerBalance = await token.balanceOf(owner.address);
    console.log(`----totalSupply: ${totalSupply} - ownerBalance: ${ownerBalance}`);
    expect(ownerBalance).to.equal(totalSupply);

    // Add liquidity to router
    let tokenAddress = token.address;
    let pairAddress = await token.pair();
    const router = await ethers.getContractAt("IUniswapV2Router02", routerAddress);
    const amountTokenMin = tokensToAddToLiquidity;
    const deadline = await helper.getDeadline();

    const to = owner.address;
    console.log(`----DECIMALS: ${decimals}`);
    console.log(`----ethTokensRatio: ${ethTokensRatio}`);
    console.log(`Adding liquidity to the pair ${pairAddress}... - tokenAddress: ${tokenAddress} - tokensToAddToLiquidity: ${tokensToAddToLiquidity} - amountTokenMin: ${amountTokenMin} - ethToAddToLiquidity: ${ethToAddToLiquidity} - to: ${to} - deadline: ${deadline}`);
    await token.connect(owner).approve(routerAddress, tokensToAddToLiquidity);
    console.log(`Allowance to ${routerAddress}: ${await token.allowance(owner.address, routerAddress)}`);
    await token.connect(owner).approve(pairAddress, tokensToAddToLiquidity);
    console.log(`Allowance to ${pairAddress}: ${await token.allowance(owner.address, pairAddress)}`);

    let tx = await router.addLiquidityETH(tokenAddress, tokensToAddToLiquidity, amountTokenMin, ethToAddToLiquidity, to, deadline, { value: ethToAddToLiquidity });
    console.log(`addLiquidityETH hash: ${tx.hash}`);

    helper.printPairReserve(token);
    const pairContract = await ethers.getContractAt("IUniswapV2Pair", pairAddress);
    const reserves = await pairContract.getReserves();
    expect(reserves[0]).to.equal(tokensToAddToLiquidity);
    
    // Start distributing premium reflections
    await token.changePremiumReflectionsDistributor(await token.receiveRewards());

    // swapTokensAtAmount
    console.log(`swapTokensAtAmount: ${await token.swapTokensAtAmount()}`); // 200000,00000000000000000

    return { token, owner, addr1, addr2, addr3, router, NftDeployed };
  }
  it("Should have a max supply of 100.000.000 tokens", async function () {
    console.log(`--------------------------------------------`);
    console.log(`Should have a max supply of 100.000.000 tokens`);
    console.log(`--------------------------------------------`);
    const { token } = await loadFixture(deployTokenFixture);
    await helper.verifyTotalSupply(token, initialSupply);
  })
  //it("Should be able to swap tokens for BNB", async function () {
  //  console.log(`--------------------------------------------`);
  //  console.log(`Should be able to swap tokens for BNB`);
  //  console.log(`--------------------------------------------`);
  //  const { token, owner } = await loadFixture(deployTokenFixture);
  //  
  //  let tokensToTransfer = BigInt("15855704349117552414663");
  //  await expect(
  //    token.connect(owner).transfer(token.address, tokensToTransfer)
  //  ).to.changeTokenBalances(token, [owner, token.address], [-tokensToTransfer, tokensToTransfer]);
//
  //  await helper.getWalletBalance(token, token.address, "Token Wallet");
//
  //  await expect(
  //    token.connect(owner).swapTokensForBNB(tokensToTransfer)
  //  ).to.changeTokenBalances(token, [token.address], [-tokensToTransfer]);
//
  //  await helper.getWalletBalance(token, token.address, "Token Wallet");
  //})
  it("Should not tax the owner", async function () {
    console.log(`--------------------------------------------`);
    console.log(`Should not tax the owner`);
    console.log(`--------------------------------------------`);
    const { token, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);

    // Transfer tokens from owner to addr1 (no taxation)
    let tokensToTransfer = BigInt(new BN(174500).mul(decimals));
    await expect(
      token.connect(owner).transfer(addr1.address, tokensToTransfer)
    ).to.changeTokenBalances(token, [owner, addr1], [-tokensToTransfer, tokensToTransfer]);

    let marketingWallet = await token.marketingWallet();
    let marketingWalletBalance = await token.balanceOf(marketingWallet);
    let teamSalaryWallet = await token.teamSalaryWallet();
    let teamSalaryWalletBalance = await token.balanceOf(teamSalaryWallet);
    console.log(`marketingWallet: ${marketingWallet} - Balance: ${marketingWalletBalance}`);
    console.log(`teamSalaryWallet: ${teamSalaryWallet} - Balance: ${teamSalaryWalletBalance}`);
    console.log(`owner: ${owner.address} - Balance: ${await token.balanceOf(owner.address)}`);
    console.log(`addr1: ${addr1.address} - Balance: ${await token.balanceOf(addr1.address)}`);
    console.log(`addr2: ${addr2.address} - Balance: ${await token.balanceOf(addr2.address)}`);
  })
  it("Can transfer ownership with tokens without fees", async function () {
    console.log(`--------------------------------------------`);
    console.log(`Can transfer ownership with tokens without fees`);
    console.log(`--------------------------------------------`);
    const { token, owner, addr1 } = await loadFixture(deployTokenFixture);

    const ownerBalanceBeforeTransferOwnership = await token.balanceOf(owner.address);
    const addr1BalanceBeforeTransferOwnership = await token.balanceOf(addr1.address);
    console.log(`Before transfer ownership: ownerBalance: ${ownerBalanceBeforeTransferOwnership} - addr1Balance: ${addr1BalanceBeforeTransferOwnership}`);
    // Transfer tokens from owner to addr1 (no taxation)
    await token.connect(owner).transferOwnership(addr1.address);
    const ownerBalanceAfterTransferOwnership = await token.balanceOf(owner.address);
    const addr1BalanceAfterTransferOwnership = await token.balanceOf(addr1.address);
    console.log(`After transfer ownership: ownerBalance: ${ownerBalanceAfterTransferOwnership} - addr1Balance: ${addr1BalanceAfterTransferOwnership}`);
    expect(addr1BalanceAfterTransferOwnership).to.equal(ownerBalanceBeforeTransferOwnership);
    expect(await token.owner()).to.equal(addr1.address);
  });
  it("should manage reflection on buy", async function () {
    console.log(`--------------------------------------------`);
    console.log(`should manage reflection on buy`);
    console.log(`--------------------------------------------`);
    console.log(`Loading fixture....`);
    const { token, owner, addr1, addr2, addr3, router } = await loadFixture(deployTokenFixture);
    console.log(`Fixture loaded`);

    await helper.printPairReserve(token);

    // Transfer tokens from owner to addr1 (no taxation) - 1Mln Tokens = 1% of Total Supply
    let tokensToTransfer = BigInt(new BN(1_000_000).mul(decimals));
    await expect(
      token.connect(owner).transfer(addr1.address, tokensToTransfer)
    ).to.changeTokenBalances(token, [owner, addr1], [-tokensToTransfer, tokensToTransfer]);

    // Transfer tokens from owner to addr2 (no taxation) - 2Mln Tokens = 2% of Total Supply
    tokensToTransfer = BigInt(new BN(2_000_000).mul(decimals));
    await expect(
      token.connect(owner).transfer(addr2.address, tokensToTransfer)
    ).to.changeTokenBalances(token, [owner, addr2], [-tokensToTransfer, tokensToTransfer]);

    let [addr1BalanceBeforeBuy, addr2BalanceBeforeBuy, addr3BalanceBeforeBuy] = await helper.printAddressBalance(token, addr1.address, addr2.address, addr3.address);

    let reservesBeforeBuy = await helper.printPairReserve(token);
    await helper.getSpecialWalletBalances(token);
    let [tokenBalanceBeforeBuy,] = await helper.getWalletBalance(token, token.address, "Token Wallet Before Buy Transaction");

    const amountEthMin = BigInt(new BN(1).mul(new BN(10)).pow(new BN(17))); // 0.1 ETH
    const wbnbAddress = await router.WETH();
    const deadline = await helper.getDeadline();
    const expectedTokensRemovedFromLP = BigInt(172344612490408178420257); // Delta 2,34% of LP Fee ~ Expected: 174500,000000000000000000 expectedTokensRemovedFromLP.mul(new BN(11)).div(new BN(100)).sub(new BN(1)) - Real: 172344,612490408178420257
    let taxes = new BN(expectedTokensRemovedFromLP).mul(new BN(11)).div(new BN(100)).sub(new BN(1));
    console.log(`ethTokensRatio: ${ethTokensRatio} - amountEthMin: ${amountEthMin} - expectedTokensRemovedFromLP: ${expectedTokensRemovedFromLP} - taxes: ${taxes}`);
    await router.connect(addr3).swapExactETHForTokensSupportingFeeOnTransferTokens(
      amountEthMin,
      [wbnbAddress, token.address],
      addr3.address,
      deadline,
      { value: amountEthMin });

    let [tokenBalanceAfterBuy,] = await helper.getWalletBalance(token, token.address, "Token Wallet After Buy Transaction");

    expect(tokenBalanceAfterBuy).to.equal(BigInt("19303320500303581567505")); // 19303,320500303581567505 (11,2% of 172344,612490408178420257)

    await helper.getSpecialWalletBalances(token);
    
    let [addr1BalanceAfterBuy, addr2BalanceAfterBuy, addr3BalanceAfterBuy] = await helper.printAddressBalance(token, addr1.address, addr2.address, addr3.address);

    expect(addr1BalanceAfterBuy).to.equal(BigInt("1000037502797831141178915"));  // 100,01% increase from 1000000,000000000000000000 to 1000037,502797831141178915
    expect(addr2BalanceAfterBuy).to.equal(BigInt("2000075005595662282357830"));  // 100,01% increase from 2000000,000000000000000000 to 2000075,005595662282357830
    expect(addr3BalanceAfterBuy).to.equal(BigInt("149945436029143892533312"));   // Transfered '172344,612490408178420257' tokens arrived '149945,436029143892533312' (87%) less (13% of taxes)

    let reservesAfterBuy = await helper.printPairReserve(token);
    expect(reservesAfterBuy[0]).to.equal(reservesBeforeBuy[0].sub(BigInt("172344612490408178420257"))); // Tokens passed from 17.450.000,000000000000000000 to 17,277.655,387509591821579743 (diff 1.723.446,12490408178420257)    
    await helper.verifyTotalSupply(token, initialSupply);
  })
  it("should manage reflection on sell", async function () {
    console.log(`--------------------------------------------`);
    console.log(`should manage reflection on sell`);
    console.log(`--------------------------------------------`);
    console.log(`Loading fixture....`);
    const { token, owner, addr1, addr2, addr3, router } = await loadFixture(deployTokenFixture);
    console.log(`Fixture loaded`);

    await helper.printPairReserve(token);

    // Transfer tokens from owner to addr1 (no taxation) - 1Mln Tokens = 1% of Total Supply
    let tokensToTransfer = BigInt(new BN(1_000_000).mul(decimals));
    await expect(
      token.connect(owner).transfer(addr1.address, tokensToTransfer)
    ).to.changeTokenBalances(token, [owner, addr1], [-tokensToTransfer, tokensToTransfer]);

    // Transfer tokens from owner to addr2 (no taxation) - 2Mln Tokens = 2% of Total Supply
    tokensToTransfer = BigInt(new BN(2_000_000).mul(decimals));
    await expect(
      token.connect(owner).transfer(addr2.address, tokensToTransfer)
    ).to.changeTokenBalances(token, [owner, addr2], [-tokensToTransfer, tokensToTransfer]);

    // Transfer tokens from owner to addr3 (no taxation) - 3Mln Tokens = 3% of Total Supply
    tokensToTransfer = BigInt(new BN(3_000_000).mul(decimals));
    await expect(
      token.connect(owner).transfer(addr3.address, tokensToTransfer)
    ).to.changeTokenBalances(token, [owner, addr3], [-tokensToTransfer, tokensToTransfer]);

    let [addr1BalanceBeforeBuy, addr2BalanceBeforeBuy, addr3BalanceBeforeBuy] = await helper.printAddressBalance(token, addr1.address, addr2.address, addr3.address);

    let reservesBeforeBuy = await helper.printPairReserve(token);

    let [tokenBalanceBeforeSell,] = await helper.getWalletBalance(token, token.address, "Token Wallet Before Sell Transaction");

    const wbnbAddress = await router.WETH();
    const deadline = await helper.getDeadline();
    const tokenPairAddress = await token.pair();
    const tokensToSell = tokensToTransfer; // 3 Mln Tokens
    await token.connect(addr3).approve(tokenPairAddress, tokensToSell);
    console.log(`Allowance to ${tokenPairAddress}: ${await token.allowance(addr3.address, tokenPairAddress)}`);
    await token.connect(addr3).approve(router.address, tokensToSell);
    console.log(`Allowance to ${router.address}: ${await token.allowance(addr3.address, router.address)}`);
    await expect(await router.connect(addr3).swapExactTokensForETHSupportingFeeOnTransferTokens(
        tokensToSell,
        0,
        [token.address, wbnbAddress],
        addr3.address,
        deadline))
        .to.changeTokenBalances(token, [addr3], [-BigInt(tokensToSell)]);

    let [addr1BalanceAfterBuy, addr2BalanceAfterBuy, addr3BalanceAfterBuy] = await helper.printAddressBalance(token, addr1.address, addr2.address, addr3.address);

    expect(addr1BalanceAfterBuy).to.equal(BigInt("1000675963247627869714342"));   // 100,06% increase from 1000000,000000000000000000 to 1000675,963247627869714342
    expect(addr2BalanceAfterBuy).to.equal(BigInt("2001351926495255739428685"));   // 100,06% increase from 2000000,000000000000000000 to 2001351,926495255739428685
    expect(addr3BalanceAfterBuy).to.equal(BigInt("0"));                           // Transfered '3000000,000000000000000000' tokens arrived new balance is zero

    let reservesAfterBuy = await helper.printPairReserve(token);
    expect(reservesAfterBuy[0]).to.equal(reservesBeforeBuy[0].add(BigInt("2610000000000000000000000"))); // Tokens passed from 17.450.000,000000000000000000 to 20.060.000,000000000000000000 (diff 2.610.000)

    let [tokenBalanceAfterSell,] = await helper.getWalletBalance(token, token.address, "Token Wallet After Sell Transaction");

    helper.verifyTotalSupply(token, initialSupply);
  })
  it("should redistribute taxes", async function () {
    console.log(`--------------------------------------------`);
    console.log(`should redistribute taxes`);
    console.log(`--------------------------------------------`);
    console.log(`Loading fixture....`);
    const { token, owner, addr1, addr2, addr3, router } = await loadFixture(deployTokenFixture);
    console.log(`Fixture loaded`);

    await helper.printPairReserve(token);

    // Transfer tokens from owner to addr1 (no taxation) - 1Mln Tokens = 1% of Total Supply
    let tokensToTransfer = BigInt(new BN(1_000_000).mul(decimals));
    await expect(
      token.connect(owner).transfer(addr1.address, tokensToTransfer)
    ).to.changeTokenBalances(token, [owner, addr1], [-tokensToTransfer, tokensToTransfer]);

    // Transfer tokens from owner to addr2 (no taxation) - 2Mln Tokens = 2% of Total Supply
    tokensToTransfer = BigInt(new BN(2_000_000).mul(decimals));
    await expect(
      token.connect(owner).transfer(addr2.address, tokensToTransfer)
    ).to.changeTokenBalances(token, [owner, addr2], [-tokensToTransfer, tokensToTransfer]);

    let [addr1BalanceBeforeBuy, addr2BalanceBeforeBuy, addr3BalanceBeforeBuy] = await helper.printAddressBalance(token, addr1.address, addr2.address, addr3.address);

    await helper.getSpecialWalletBalances(token);
    let [tokenBalanceBeforeBuy,] = await helper.getWalletBalance(token, token.address, "Token Wallet Before Buy Transaction");
    
    let amountEthMin = BigInt(new BN(2).mul(new BN(10).pow(new BN(17)))); // 0.2 ETH
    let wbnbAddress = await router.WETH();
    let deadline = await helper.getDeadline();

    console.log(`amountEthMin: ${amountEthMin} - addr3.balance: ${await await ethers.provider.getBalance(addr3.address)}`); //10000,000000000000000000 -- 13107,200000000000000000
    // First buy
    await router.connect(addr3).swapExactETHForTokensSupportingFeeOnTransferTokens(
      amountEthMin,
      [wbnbAddress, token.address],
      addr3.address,
      deadline,
      { value: amountEthMin });

    let [tokenBalanceAfterFirstBuy,] = await helper.getWalletBalance(token, token.address, "Token Wallet After First Transaction (Buy)");

    // Trigger a sell transaction redistribute taxes (doesn't trigger the buy)
    let [, , addr3Balance] = await helper.printAddressBalance(token, addr1.address, addr2.address, addr3.address);
    let tokensToSell = addr3Balance;
    let tokenPairAddress = await token.pair();
    deadline = await helper.getDeadline();
    console.log(`----------------- Going to sell ${tokensToSell}`);
    await token.connect(addr3).approve(tokenPairAddress, tokensToSell);
    console.log(`Allowance to ${tokenPairAddress}: ${await token.allowance(addr3.address, tokenPairAddress)}`);
    await token.connect(addr3).approve(router.address, tokensToSell);
    console.log(`Allowance to ${router.address}: ${await token.allowance(addr3.address, router.address)}`);
    await expect(await router.connect(addr3).swapExactTokensForETHSupportingFeeOnTransferTokens(
        tokensToSell,
        0,
        [token.address, wbnbAddress],
        addr3.address,
        deadline))
        .to.changeTokenBalances(token, [addr3], [-BigInt(tokensToSell.toString())]);

    let [tokenBalanceAfterSecondBuy,] = await helper.getWalletBalance(token, token.address, "Token Wallet After Second Transaction (Sell)");
    let [addr1BalanceAfterBuy, addr2BalanceAfterBuy, addr3BalanceAfterBuy] = await helper.printAddressBalance(token, addr1.address, addr2.address, addr3.address);
    await helper.getSpecialWalletBalances(token);

    await helper.verifyTotalSupply(token, initialSupply.sub(new BN("14945042833823599926012"))); // Taxes burned: 14945,042833823599926012
  })
  it("should allow to set premium reflection distributor", async function () {
    console.log(`--------------------------------------------`);
    console.log(`should allow to set premium reflection distributor`);
    console.log(`--------------------------------------------`);
    console.log(`Loading fixture....`);
    const { token, addr1, addr2, addr3, router, NftDeployed } = await loadFixture(deployTokenFixture);
    console.log(`Fixture loaded`);

    await token.changePremiumReflectionsDistributor(NftDeployed.address);
    
    // First buy
    let amountEthMin = BigInt(new BN(2).mul(new BN(10).pow(new BN(17)))); // 0.2 ETH
    let wbnbAddress = await router.WETH();
    let deadline = await helper.getDeadline();
    await router.connect(addr3).swapExactETHForTokensSupportingFeeOnTransferTokens(
      amountEthMin,
      [wbnbAddress, token.address],
      addr3.address,
      deadline,
      { value: amountEthMin });
    // Trigger a sell transaction redistribute taxes (doesn't trigger the buy)
    let [, , addr3Balance] = await helper.printAddressBalance(token, addr1.address, addr2.address, addr3.address);
    let tokensToSell = addr3Balance;
    let tokenPairAddress = await token.pair();
    deadline = await helper.getDeadline();
    await token.connect(addr3).approve(tokenPairAddress, tokensToSell);
    await token.connect(addr3).approve(router.address, tokensToSell);
    await expect(await router.connect(addr3).swapExactTokensForETHSupportingFeeOnTransferTokens(
        tokensToSell,
        0,
        [token.address, wbnbAddress],
        addr3.address,
        deadline))
        .to.changeTokenBalances(token, [addr3], [-BigInt(tokensToSell.toString())]);
  })
})
