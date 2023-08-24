const { expect } = require("chai");
const hardhat = require("hardhat");
import {
    loadFixture,
} from "@nomicfoundation/hardhat-network-helpers";
const { ethers } = hardhat;
const { LazyMinter, EcosystemHelper } = require('../lib');
const BN = require('bn.js');
import { Nft } from "../typechain-types";
import { Token } from "../typechain-types";
import { TestBUSD } from "../typechain-types";

const helper = new EcosystemHelper();

async function triggerTaxesRedistribution(token: Token, owner: any, addr1: any, addr2: any, addr3: any, router: any, tokensAmountToTriggerTaxes : number = 3_000_000) {
    // Transfer tokens from owner to addr1 (no taxation) - 1Mln Tokens = 1% of Total Supply
    let tokensToTransfer = BigInt(new BN(tokensAmountToTriggerTaxes).mul(decimals));
    await expect(
        token.connect(owner).transfer(addr1.address, tokensToTransfer)
    ).to.changeTokenBalances(token, [owner, addr1], [-tokensToTransfer, tokensToTransfer]);

    // Transfer tokens from owner to addr2 (no taxation) - 2Mln Tokens = 2% of Total Supply
    tokensToTransfer = BigInt(new BN(tokensAmountToTriggerTaxes * 2).mul(decimals));
    await expect(
        token.connect(owner).transfer(addr2.address, tokensToTransfer)
    ).to.changeTokenBalances(token, [owner, addr2], [-tokensToTransfer, tokensToTransfer]);

    let amountEthMin = BigInt(new BN(2).mul(new BN(10).pow(new BN(17)))); // 0.2 ETH
    let wbnbAddress = await router.WETH();
    let deadline = await helper.getDeadline();

    // First buy
    await router.connect(addr3).swapExactETHForTokensSupportingFeeOnTransferTokens(
        amountEthMin,
        [wbnbAddress, token.address],
        addr3.address,
        deadline,
        { value: amountEthMin });

    // Trigger a sell transaction redistribute taxes (doesn't trigger the buy)
    let addr3Balance = await token.balanceOf(addr3.address);
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
}

async function redeemNft(contract : Nft, token: Token, busd : TestBUSD, owner: any, redeemer : any, nftId : number) {
    const lazyMinter = new LazyMinter({ contract, signer: owner });
    const voucher = await lazyMinter.createVoucher(nftId, "ipfs://bafybeifcyhqbgteknd5yqut7onimh7ftoy55mlpa2qaskczobkf5ueo3km", busd.address, defaultStableCoinPrice, token.address.toLowerCase(), defaultTokenPrice);
    
    // Set allowance from redeemer to receiveRewards
    let revenuesWallet = await contract.revenuesWallet();
    let deadWallet = await contract.deadWallet();
    await token.connect(redeemer).approve(deadWallet, defaultTokenPrice);
    await token.connect(redeemer).approve(contract.address, defaultTokenPrice);
    await busd.connect(redeemer).approve(revenuesWallet, defaultStableCoinPrice);
    await busd.connect(redeemer).approve(contract.address, defaultStableCoinPrice);
    await expect(contract.connect(redeemer).redeem(redeemer.address, voucher))
        .to.emit(contract, 'Transfer')  // transfer from null address to owner
        .withArgs('0x0000000000000000000000000000000000000000', owner.address, voucher.tokenId)
        .and.to.emit(contract, 'Transfer') // transfer from owner to redeemer
        .withArgs(owner.address, redeemer.address, voucher.tokenId);
}

const decimals = new BN(10).pow(new BN(18));
const defaultStableCoinPrice = BigInt(new BN(500).mul(decimals)); // 500 BUSD
const defaultTokenPrice = BigInt(new BN(500).mul(decimals)); // 500 PRZ

describe("Integration Testing", function () {
    async function deploy() {
        console.log(`--------------------------------------------`);
        console.log(`deploy`);
        console.log(`--------------------------------------------`);
        console.log(`----Deploying Nft...`);
        const [owner, redeemer, addr2, addr3] = await ethers.getSigners();
        let factory = await ethers.getContractFactory("Nft", owner)
        const contract = await factory.deploy(owner.address)

        // the redeemerContract is an instance of the contract that's wired up to the redeemer's signing key
        const redeemerFactory = factory.connect(redeemer)
        const redeemerContract = redeemerFactory.attach(contract.address)

        // Deploy PRZ Token
        console.log(`----Deploying Token...`);
        const routerAddress = "0x10ed43c718714eb63d5aa57b78b54704e256024e"; // BSC Pancake Router
        const Token = await ethers.getContractFactory("Token");
        const token = await Token.deploy(routerAddress);

        // Enable trading
        console.log(`----Enabling trading...`);
        await token.enableTrading();
        expect(await token.isTradingEnabled()).to.equal(true);

        // Verify owner has total supply
        const totalSupply = await token.totalSupply();
        const ownerBalance = await token.balanceOf(owner.address);
        expect(ownerBalance).to.equal(totalSupply);

        // Add liquidity to router
        console.log(`----Adding liquidity ...`);
        let tokensToAddToLiquidity = BigInt(new BN(17450000).mul(decimals)); //17,450,000 Tokens to LP
        let ethToAddToLiquidity = BigInt(new BN(10).mul(decimals));
        let tokenAddress = token.address;
        let pairAddress = await token.pair();
        const router = await ethers.getContractAt("IUniswapV2Router02", routerAddress);
        const amountTokenMin = tokensToAddToLiquidity;
        const deadline = await helper.getDeadline();
        const to = owner.address;
        await token.connect(owner).approve(routerAddress, tokensToAddToLiquidity);
        await token.connect(owner).approve(pairAddress, tokensToAddToLiquidity);
        await router.addLiquidityETH(tokenAddress, tokensToAddToLiquidity, amountTokenMin, ethToAddToLiquidity, to, deadline, { value: ethToAddToLiquidity });
        
        // Transfer tokens to redeemer
        await token.connect(owner).transfer(redeemer.address, defaultTokenPrice);
        const redeemerBalance = await token.balanceOf(redeemer.address);
        expect(redeemerBalance).to.equal(defaultTokenPrice);

        // Deploy TestBUSD
        console.log(`----Deploying TestBUSD...`);
        const busdFactory = await ethers.getContractFactory("TestBUSD");
        const busd = await busdFactory.deploy();

        // Sending BUSD to Address
        await busd.connect(owner).transfer(redeemer.address, BigInt(new BN(100000).mul(decimals)));
        await busd.connect(owner).transfer(addr2.address, BigInt(new BN(100000).mul(decimals)));
        await busd.connect(owner).transfer(addr3.address, BigInt(new BN(100000).mul(decimals)));

        // Redeem 1 NFT to set token as distributor role
        console.log(`----Reedming 1 NFT to set token address as distributor role ...`);
        await redeemNft(contract, token, busd, owner, redeemer, 1);
        await expect(await contract.totalSupply()).to.equal(1);

        // Start distributing premium reflections
        await token.changePremiumReflectionsDistributor(contract.address);

        // Trigger taxes redistribution
        console.log(`----Triggering taxes redistribution ...`);
        await triggerTaxesRedistribution(token, owner, redeemer, addr2, addr3, router);
        console.log(`--------------------------------------------`);

        return {
            owner,
            redeemer,
            contract,
            redeemerContract,
            token,
            addr2,
            addr3,
            router,
            busd
        }
    }
    it("NFT holder of 1 NFT should be able to check premium reflections balance", async function () {
        console.log(`--------------------------------------------`);
        console.log(`NFT holder of 1 NFT should be able to check premium reflections balance`);
        console.log(`--------------------------------------------`);
        const { contract, redeemerContract, redeemer, owner, token, addr2, addr3, router } = await loadFixture(deploy);

        // Check premium reflections balance
        let premiumReflectionsBalance = await contract.connect(redeemer).checkHolderPremiumReflectionsBalance(token.address);
        let expectedPremiumReflectionsBalance = new BN("16385580379713041842551");
        expect(premiumReflectionsBalance).to.equal(BigInt(expectedPremiumReflectionsBalance));
        console.log(`1° Iteration - premiumReflectionsBalance: ${premiumReflectionsBalance}`);

        // Retrigger taxes redistribution
        console.log(`Retriggering taxes redistribution...`);
        await triggerTaxesRedistribution(token, owner, redeemer, addr2, addr3, router);
        premiumReflectionsBalance = await contract.connect(redeemer).checkHolderPremiumReflectionsBalance(token.address);
        expectedPremiumReflectionsBalance = new BN("46885979480446021711656");
        expect(premiumReflectionsBalance).to.equal(BigInt(expectedPremiumReflectionsBalance));
        console.log(`2° Iteration - premiumReflectionsBalance: ${premiumReflectionsBalance}`);
    });
    it("2 NFT holders should be able to check premium reflections balance and they should match", async function () {
        console.log(`--------------------------------------------`);
        console.log(`2 NFT holders should be able to check premium reflections balance and they should match`);
        console.log(`--------------------------------------------`);
        const { contract, redeemerContract, redeemer, owner, token, addr2, addr3, router, busd } = await loadFixture(deploy);

        // Check premium reflections balance
        let premiumReflectionsBalance = await contract.connect(redeemer).checkHolderPremiumReflectionsBalance(token.address);
        let expectedPremiumReflectionsBalance = new BN("16385580379713041842551");
        console.log(`premiumReflectionsBalance before 2° NFT holder joins: ${premiumReflectionsBalance}`);
        expect(premiumReflectionsBalance).to.equal(BigInt(expectedPremiumReflectionsBalance));

        // Redeem another NFT
        await redeemNft(contract, token, busd, owner, addr2, 2);
        await expect(await contract.totalSupply()).to.equal(2);

        // Now reflections should be split in half
        premiumReflectionsBalance = await contract.connect(redeemer).checkHolderPremiumReflectionsBalance(token.address);
        expectedPremiumReflectionsBalance = expectedPremiumReflectionsBalance.div(new BN("2"));
        console.log(`premiumReflectionsBalance of original redeemer after 2° NFT holder joins: ${premiumReflectionsBalance}`);
        expect(premiumReflectionsBalance).to.equal(BigInt(expectedPremiumReflectionsBalance));
        
        premiumReflectionsBalance = await contract.connect(addr2).checkHolderPremiumReflectionsBalance(token.address);
        console.log(`premiumReflectionsBalance of 2° NFT holder: ${premiumReflectionsBalance}`);
        expect(premiumReflectionsBalance).to.equal(BigInt(expectedPremiumReflectionsBalance));

        // Retrigger taxes redistribution
        console.log(`Retriggering taxes redistribution...`);
        await triggerTaxesRedistribution(token, owner, redeemer, addr2, addr3, router);
        premiumReflectionsBalance = await contract.connect(redeemer).checkHolderPremiumReflectionsBalance(token.address);
        expectedPremiumReflectionsBalance = new BN("46885979493951057726330").div(new BN("2"));
        console.log(`2° Iteration - premiumReflectionsBalance of original redeemer: ${premiumReflectionsBalance}`);
        expect(premiumReflectionsBalance).to.equal(BigInt(expectedPremiumReflectionsBalance));

        premiumReflectionsBalance = await contract.connect(addr2).checkHolderPremiumReflectionsBalance(token.address);
        console.log(`2° Iteration - premiumReflectionsBalance of 2° NFT holder: ${premiumReflectionsBalance}`);
        expect(premiumReflectionsBalance).to.equal(BigInt(expectedPremiumReflectionsBalance));
    });
    it("2 NFT holders holding 3 NFTs in total should equally distribute rewards", async function () {
        console.log(`--------------------------------------------`);
        console.log(`2 NFT holders holding 3 NFTs in total should equally distribute rewards`);
        console.log(`--------------------------------------------`);
        const { contract, redeemerContract, redeemer, owner, token, addr2, addr3, router, busd } = await loadFixture(deploy);

        // Check premium reflections balance
        let premiumReflectionsBalance = await contract.connect(redeemer).checkHolderPremiumReflectionsBalance(token.address);
        let expectedPremiumReflectionsBalance = new BN("16385580379713041842551");
        console.log(`premiumReflectionsBalance before 2° NFT holder joins: ${premiumReflectionsBalance}`);
        expect(premiumReflectionsBalance).to.equal(BigInt(expectedPremiumReflectionsBalance));

        // Redeem another NFT
        await redeemNft(contract, token, busd, owner, addr2, 2);
        await expect(await contract.totalSupply()).to.equal(2);

        // Now reflections should be split in half
        premiumReflectionsBalance = await contract.connect(redeemer).checkHolderPremiumReflectionsBalance(token.address);
        expectedPremiumReflectionsBalance = expectedPremiumReflectionsBalance.div(new BN("2"));
        console.log(`premiumReflectionsBalance of original redeemer after 2° NFT holder joins: ${premiumReflectionsBalance}`);
        expect(premiumReflectionsBalance).to.equal(BigInt(expectedPremiumReflectionsBalance));
        
        premiumReflectionsBalance = await contract.connect(addr2).checkHolderPremiumReflectionsBalance(token.address);
        console.log(`premiumReflectionsBalance of 2° NFT holder: ${premiumReflectionsBalance}`);
        expect(premiumReflectionsBalance).to.equal(BigInt(expectedPremiumReflectionsBalance));

        // First NFT holder buys a second NFT
        await redeemNft(contract, token, busd, owner, redeemer, 3);
        await expect(await contract.totalSupply()).to.equal(3);

        // 1° NFT holder should have 2/3 of reflections
        premiumReflectionsBalance = await contract.connect(redeemer).checkHolderPremiumReflectionsBalance(token.address);
        expectedPremiumReflectionsBalance = new BN("16385580379713041842550").div(new BN("3")).mul(new BN("2"));
        console.log(`premiumReflectionsBalance of original redeemer after buying 2° NFT: ${premiumReflectionsBalance}`);
        expect(premiumReflectionsBalance).to.equal(BigInt(expectedPremiumReflectionsBalance.add(new BN("2"))));
        // 2° NFT holder should have 1/3 of reflections
        premiumReflectionsBalance = await contract.connect(addr2).checkHolderPremiumReflectionsBalance(token.address);
        expectedPremiumReflectionsBalance = new BN("16385580379713041842550").div(new BN("3")).mul(new BN("1"));
        console.log(`premiumReflectionsBalance of 2° NFT holder, holding 1/3 of total reflections: ${premiumReflectionsBalance}`);
        expect(premiumReflectionsBalance).to.equal(BigInt(expectedPremiumReflectionsBalance.add(new BN("1"))));
    });
    it("NFT holder should be able to withdraw rewards", async function () {
        console.log(`--------------------------------------------`);
        console.log(`NFT holder should be able to withdraw rewards`);
        console.log(`--------------------------------------------`);
        const { contract, redeemerContract, redeemer, owner, token, addr2, addr3, router } = await loadFixture(deploy);

        // Check premium reflections balance
        let premiumReflectionsBalance = await contract.connect(redeemer).checkHolderPremiumReflectionsBalance(token.address);
        let [tokenAmountBeforeWithdraw,] = await helper.getWalletBalance(token, redeemer.address, "Redeemer balance before withdraw");
        console.log(`Executing withdraw of ${premiumReflectionsBalance}...`);
        await contract.connect(redeemer).withdrawPremiumReflections(token.address);
        let [tokenAmountAfterWithdraw,] = await helper.getWalletBalance(token, redeemer.address, "Redeemer balance before withdraw");
        expect(tokenAmountAfterWithdraw).to.equal(tokenAmountBeforeWithdraw.add(premiumReflectionsBalance));

        // Verify that execution is reverted if called again
        await expect(contract.connect(redeemer).withdrawPremiumReflections(token.address)).to.be.revertedWith("No withdrawable amount");

        // Retrigger taxes redistribution
        console.log(`Retriggering taxes redistribution...`);
        await triggerTaxesRedistribution(token, owner, redeemer, addr2, addr3, router);
        premiumReflectionsBalance = await contract.connect(redeemer).checkHolderPremiumReflectionsBalance(token.address);
        console.log(`2° Iteration - premiumReflectionsBalance: ${premiumReflectionsBalance}`);
        let [tokenAmountBefore2ndWithdraw,] = await helper.getWalletBalance(token, redeemer.address, "Redeemer balance before withdraw");
        await contract.connect(redeemer).withdrawPremiumReflections(token.address);
        let [tokenAmountAfter2ndWithdraw,] = await helper.getWalletBalance(token, redeemer.address, "Redeemer balance before withdraw");
        expect(tokenAmountAfter2ndWithdraw).to.equal(tokenAmountBefore2ndWithdraw.add(premiumReflectionsBalance));

        // Verify that execution is reverted if called again
        await expect(contract.connect(redeemer).withdrawPremiumReflections(token.address)).to.be.revertedWith("No withdrawable amount");
    });
});