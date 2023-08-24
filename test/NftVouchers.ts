const { expect } = require("chai");
const hardhat = require("hardhat");
import {
    loadFixture,
  } from "@nomicfoundation/hardhat-network-helpers";
const { ethers } = hardhat;
const { LazyMinter } = require('../lib');
const BN = require('bn.js');
const fs = require('fs');


const decimals = new BN(10).pow(new BN(18));
const defaultStableCoinPrice = BigInt(new BN(500).mul(decimals)); // 500 BUSD
const defaultTokenPrice = BigInt(new BN(500).mul(decimals)); // 500 PRZ

describe("Nft", function () {
    async function deploy() {
        console.log(`--------------------------------------------`);
        console.log(`deploy`);
        console.log(`--------------------------------------------`);
        console.log(`----Deploying Nft...`);
        const [testnetDeployer, mainnetDeployer, addr2, addr3] = await ethers.getSigners();
        let factory = await ethers.getContractFactory("Nft", testnetDeployer)
        const contract = await factory.deploy(testnetDeployer.address)

        // the redeemerContract is an instance of the contract that's wired up to the redeemer's signing key
        const redeemerFactory = factory.connect(mainnetDeployer)
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
        const ownerBalance = await token.balanceOf(testnetDeployer.address);
        expect(ownerBalance).to.equal(totalSupply);

        // Transfer tokens to redeemer
        await token.connect(testnetDeployer).transfer(mainnetDeployer.address, defaultTokenPrice);
        const redeemerBalance = await token.balanceOf(mainnetDeployer.address);
        expect(redeemerBalance).to.equal(defaultTokenPrice);

        // Deploy TestBUSD
        console.log(`----Deploying TestBUSD...`);
        const busdFactory = await ethers.getContractFactory("TestBUSD");
        const busd = await busdFactory.deploy();

        // Sending BUSD to Redeemer
        await busd.connect(testnetDeployer).transfer(mainnetDeployer.address, await busd.totalSupply());

        return {
            testnetDeployer,
            mainnetDeployer,
            contract,
            redeemerContract,
            token,
            busd,
        }
    }
    it("Should generate 5000 vouchers and save them on a json file for testnet", async function () {
        console.log(`--------------------------------------------`);
        console.log(`Should generate 5000 vouchers and save them on a json file for testnet`);
        console.log(`--------------------------------------------`);
        const { contract, redeemerContract, mainnetDeployer, testnetDeployer, token, busd} = await loadFixture(deploy);
        const lazyMinter = new LazyMinter({ contract, signer: testnetDeployer });
        const busdAddressTestnet = "0xf58Bd4bb51cEcAc2d25a63f013E395960D05171D";
        const tokenAddressTestnet = "0xD263A25Ad51D836cD1a9bcc0383998c5235b541D";
        console.log(`--------------------------------------------`);
        let vouchers = new Array();
        let nVouchersToGenerate = 5000;
        for (let i = 1; i <= nVouchersToGenerate; i++) {
            let voucher = await lazyMinter.createVoucher(i, "ipfs://bafybeifcyhqbgteknd5yqut7onimh7ftoy55mlpa2qaskczobkf5ueo3km", busdAddressTestnet, defaultStableCoinPrice, tokenAddressTestnet, defaultTokenPrice, true);
            vouchers.push(voucher);
            console.log (`Generated voucher [${i}/${nVouchersToGenerate}] - ${voucher}`);
        }
        let jsonData = JSON.stringify(vouchers, (_, v) => typeof v === 'bigint' ? v.toString() : v);
        fs.writeFileSync('testnet-nft-vouchers.json', jsonData);
    });
});