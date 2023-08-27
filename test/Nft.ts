const { expect } = require("chai");
const hardhat = require("hardhat");
import {
    loadFixture,
  } from "@nomicfoundation/hardhat-network-helpers";
const { ethers } = hardhat;
const { LazyMinter } = require('../lib');
const BN = require('bn.js');
import { Nft } from "../typechain-types";

const decimals = new BN(10).pow(new BN(18));
const defaultStableCoinPrice = BigInt(new BN(500).mul(decimals)); // 500 BUSD
const defaultTokenPrice = BigInt(new BN(10000).mul(decimals)); // 10000 PRZ

describe("Nft", function () {
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
        console.log(`--------------------------------------------`);

        // Verify owner has total supply
        const totalSupply = await token.totalSupply();
        const ownerBalance = await token.balanceOf(owner.address);
        expect(ownerBalance).to.equal(totalSupply);

        // Transfer tokens to redeemer
        await token.connect(owner).transfer(redeemer.address, defaultTokenPrice);
        const redeemerBalance = await token.balanceOf(redeemer.address);
        expect(redeemerBalance).to.equal(defaultTokenPrice);

        // Deploy TestBUSD
        console.log(`----Deploying TestBUSD...`);
        const busdFactory = await ethers.getContractFactory("TestBUSD");
        const busd = await busdFactory.deploy();

        // Sending BUSD to Redeemer
        await busd.connect(owner).transfer(redeemer.address, await busd.totalSupply());

        return {
            owner,
            redeemer,
            contract,
            redeemerContract,
            token,
            busd,
        }
    }
    it("Should redeem an NFT from a signed voucher", async function () {
        console.log(`--------------------------------------------`);
        console.log(`Should redeem an NFT from a signed voucher`);
        console.log(`--------------------------------------------`);
        const { contract, redeemerContract, redeemer, owner, token, busd} = await loadFixture(deploy);

        const lazyMinter = new LazyMinter({ contract, signer: owner });
        //console.log(`---- defaultStableCoinPrice: ${defaultStableCoinPrice}`);
        const voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeifcyhqbgteknd5yqut7onimh7ftoy55mlpa2qaskczobkf5ueo3km", busd.address, defaultStableCoinPrice, token.address, defaultTokenPrice);
        console.log(`voucher.tokenId: ${voucher.tokenId} - voucher.uri: ${voucher.uri} - voucher.minStableCoinPrice: ${voucher.minStableCoinPrice} - voucher.signature: ${voucher.signature} - owner: ${owner.address}`);

        // Set allowance from redeemer to receiveRewards
        let revenuesWallet = await contract.revenuesWallet();
        let deadWallet = await contract.deadWallet();
        await token.connect(redeemer).approve(deadWallet, defaultTokenPrice);
        await token.connect(redeemer).approve(contract.address, defaultTokenPrice);
        await busd.connect(redeemer).approve(revenuesWallet, defaultStableCoinPrice);
        await busd.connect(redeemer).approve(contract.address, defaultStableCoinPrice);
        await expect(redeemerContract.redeem(redeemer.address, voucher))
            .to.emit(contract, 'Transfer')  // transfer from null address to owner
            .withArgs('0x0000000000000000000000000000000000000000', owner.address, voucher.tokenId)
            .and.to.emit(contract, 'Transfer') // transfer from owner to redeemer
            .withArgs(owner.address, redeemer.address, voucher.tokenId);
        await expect(await redeemerContract.totalSupply()).to.equal(1);
    });
    it("Should fail to redeem an NFT that's already been claimed", async function () {
        const { contract, redeemerContract, redeemer, owner, token, busd } = await loadFixture(deploy);

        const lazyMinter = new LazyMinter({ contract, signer: owner })
        const voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeifcyhqbgteknd5yqut7onimh7ftoy55mlpa2qaskczobkf5ueo3km", busd.address, defaultStableCoinPrice, token.address, defaultTokenPrice)
        
        // Set allowance from redeemer to receiveRewards
        let revenuesWallet = await contract.revenuesWallet();
        let deadWallet = await contract.deadWallet();
        await token.connect(redeemer).approve(deadWallet, defaultTokenPrice);
        await token.connect(redeemer).approve(contract.address, defaultTokenPrice);
        await busd.connect(redeemer).approve(revenuesWallet, defaultStableCoinPrice);
        await busd.connect(redeemer).approve(contract.address, defaultStableCoinPrice);
        await expect(redeemerContract.redeem(redeemer.address, voucher))
            .to.emit(contract, 'Transfer')  // transfer from null address to owner
            .withArgs('0x0000000000000000000000000000000000000000', owner.address, voucher.tokenId)
            .and.to.emit(contract, 'Transfer') // transfer from owner to redeemer
            .withArgs(owner.address, redeemer.address, voucher.tokenId);
        await expect(await redeemerContract.totalSupply()).to.equal(1);

        // Transfer extra tokens to redeemer
        await token.connect(owner).transfer(redeemer.address, defaultTokenPrice);
        const redeemerBalance = await token.balanceOf(redeemer.address);
        expect(redeemerBalance).to.equal(defaultTokenPrice);

        await token.connect(redeemer).approve(deadWallet, defaultTokenPrice);
        await token.connect(redeemer).approve(contract.address, defaultTokenPrice);
        await busd.connect(redeemer).approve(revenuesWallet, defaultStableCoinPrice);
        await busd.connect(redeemer).approve(contract.address, defaultStableCoinPrice);
        await expect(redeemerContract.redeem(redeemer.address, voucher))
            .to.be.revertedWith('ERC721: token already minted')
        await expect(await redeemerContract.totalSupply()).to.equal(1);
    });
    it("Should fail to redeem an NFT voucher that's signed by an unauthorized account", async function () {
        const { contract, redeemerContract, redeemer, owner, token, busd } = await loadFixture(deploy);

        const signers = await ethers.getSigners()
        const rando = signers[signers.length - 1];

        const lazyMinter = new LazyMinter({ contract, signer: rando })
        const voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeifcyhqbgteknd5yqut7onimh7ftoy55mlpa2qaskczobkf5ueo3km", busd.address, defaultStableCoinPrice, token.address, defaultTokenPrice)
                
        // Set allowance from redeemer to receiveRewards
        let revenuesWallet = await contract.revenuesWallet();
        let deadWallet = await contract.deadWallet();
        await token.connect(redeemer).approve(deadWallet, defaultTokenPrice);
        await token.connect(redeemer).approve(contract.address, defaultTokenPrice);
        await busd.connect(redeemer).approve(revenuesWallet, defaultStableCoinPrice);
        await busd.connect(redeemer).approve(contract.address, defaultStableCoinPrice);
        await expect(redeemerContract.redeem(redeemer.address, voucher))
            .to.be.revertedWith('Signature invalid or unauthorized')
        await expect(await redeemerContract.totalSupply()).to.equal(0);
    });
    it("Should fail to redeem an NFT voucher that's been modified", async function () {
        const { contract, redeemerContract, redeemer, owner, token, busd } = await loadFixture(deploy);

        const signers = await ethers.getSigners()
        const rando = signers[signers.length - 1];

        const lazyMinter = new LazyMinter({ contract, signer: rando })
        const voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeifcyhqbgteknd5yqut7onimh7ftoy55mlpa2qaskczobkf5ueo3km", busd.address, defaultStableCoinPrice, token.address, defaultTokenPrice)
        voucher.tokenId = 2
                  
        // Set allowance from redeemer to receiveRewards
        let revenuesWallet = await contract.revenuesWallet();      
        let deadWallet = await contract.deadWallet();
        await token.connect(redeemer).approve(deadWallet, defaultTokenPrice);
        await token.connect(redeemer).approve(contract.address, defaultTokenPrice);
        await busd.connect(redeemer).approve(revenuesWallet, defaultStableCoinPrice);
        await busd.connect(redeemer).approve(contract.address, defaultStableCoinPrice);
        await expect(redeemerContract.redeem(redeemer.address, voucher))
            .to.be.revertedWith('Signature invalid or unauthorized')
        await expect(await redeemerContract.totalSupply()).to.equal(0);
    });
    it("Should fail to redeem an NFT voucher with an invalid signature", async function () {
        const { contract, redeemerContract, redeemer, owner, token, busd } = await loadFixture(deploy);

        const signers = await ethers.getSigners()
        const rando = signers[signers.length - 1];

        const lazyMinter = new LazyMinter({ contract, signer: rando })
        const voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeifcyhqbgteknd5yqut7onimh7ftoy55mlpa2qaskczobkf5ueo3km", busd.address, defaultStableCoinPrice, token.address, defaultTokenPrice)

        const dummyData = ethers.utils.randomBytes(128)
        voucher.signature = await owner.signMessage(dummyData)
                
        // Set allowance from redeemer to receiveRewards
        let revenuesWallet = await contract.revenuesWallet();
        let deadWallet = await contract.deadWallet();
        await token.connect(redeemer).approve(deadWallet, defaultTokenPrice);
        await token.connect(redeemer).approve(contract.address, defaultTokenPrice);
        await busd.connect(redeemer).approve(revenuesWallet, defaultStableCoinPrice);
        await busd.connect(redeemer).approve(contract.address, defaultStableCoinPrice);
        await expect(redeemerContract.redeem(redeemer.address, voucher))
            .to.be.revertedWith('Signature invalid or unauthorized');
        await expect(await redeemerContract.totalSupply()).to.equal(0);
    });

    it("Should redeem if payment is >= minStableCoinPrice", async function () {
        const { contract, redeemerContract, redeemer, owner, token, busd } = await loadFixture(deploy);

        const lazyMinter = new LazyMinter({ contract, signer: owner })
        const minStableCoinPrice = ethers.constants.WeiPerEther // charge 1 Eth
        const voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeifcyhqbgteknd5yqut7onimh7ftoy55mlpa2qaskczobkf5ueo3km", busd.address, minStableCoinPrice, token.address, defaultTokenPrice)
                
        // Set allowance from redeemer to receiveRewards
        let revenuesWallet = await contract.revenuesWallet();
        let deadWallet = await contract.deadWallet();
        await token.connect(redeemer).approve(deadWallet, defaultTokenPrice);
        await token.connect(redeemer).approve(contract.address, defaultTokenPrice);
        await busd.connect(redeemer).approve(revenuesWallet, defaultStableCoinPrice);
        await busd.connect(redeemer).approve(contract.address, defaultStableCoinPrice);
        await expect(redeemerContract.redeem(redeemer.address, voucher))
            .to.emit(contract, 'Transfer')  // transfer from null address to owner
            .withArgs('0x0000000000000000000000000000000000000000', owner.address, voucher.tokenId)
            .and.to.emit(contract, 'Transfer') // transfer from owner to redeemer
            .withArgs(owner.address, redeemer.address, voucher.tokenId);
        await expect(await redeemerContract.totalSupply()).to.equal(1);
    })

    it("Should fail to redeem if payment is < minStableCoinPrice", async function () {
        const { contract, redeemerContract, redeemer, owner, token, busd } = await loadFixture(deploy);

        const lazyMinter = new LazyMinter({ contract, signer: owner })
        const minStableCoinPrice = ethers.constants.WeiPerEther // charge 1 Eth
        const voucher = await lazyMinter.createVoucher(1, "ipfs://bafybeifcyhqbgteknd5yqut7onimh7ftoy55mlpa2qaskczobkf5ueo3km", busd.address, minStableCoinPrice, token.address, defaultTokenPrice)

        // Remove all BUSD in wallet
        await busd.connect(redeemer).transfer(owner.address, await busd.connect(redeemer).balanceOf(redeemer.address));
                    
        // Set allowance from redeemer to receiveRewards
        let revenuesWallet = await contract.revenuesWallet();    
        let deadWallet = await contract.deadWallet();
        await token.connect(redeemer).approve(deadWallet, defaultTokenPrice);
        await token.connect(redeemer).approve(contract.address, defaultTokenPrice);
        await busd.connect(redeemer).approve(revenuesWallet, defaultStableCoinPrice);
        await busd.connect(redeemer).approve(contract.address, defaultStableCoinPrice);
        await expect(redeemerContract.redeem(redeemer.address, voucher))
            .to.be.revertedWith('Insufficient stable coin balance to redeem');
        await expect(await redeemerContract.totalSupply()).to.equal(0);
    })

    it("Should allow owner to withdraw ethers and tokens", async function () {
        const { contract, redeemerContract, redeemer, owner, token } = await loadFixture(deploy);

        // Send token to smart contract
        token.connect(owner).transfer(contract.address, defaultTokenPrice);

        // Send ethers to smart contract
        await owner.sendTransaction({
            to: contract.address,
            value: defaultStableCoinPrice
          });

        // Withdraw tokens
        await expect(
            contract.connect(owner).rescueAnyIERC20Tokens(token.address, defaultTokenPrice)
          ).to.changeTokenBalances(token, [contract, owner], [-defaultTokenPrice, defaultTokenPrice]);

        // Withdraw ethers
        await expect(
            contract.connect(owner).rescueBNB(defaultStableCoinPrice)
          ).to.changeEtherBalance(contract, -defaultStableCoinPrice);
    })

});