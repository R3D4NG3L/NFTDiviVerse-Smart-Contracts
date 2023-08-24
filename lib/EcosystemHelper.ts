import { Token } from "../typechain-types";
import { expect } from "chai";
import { ethers } from "hardhat";
const BN = require('bn.js');

class EcosystemHelper {
    async getDeadline() {
        const blockNumber = await ethers.provider.getBlockNumber();
        const block = await ethers.provider.getBlock(blockNumber);
        const blockTimestamp = block?.timestamp;
        if (blockTimestamp == null)
            throw new Error("Invalid block timestamp");
        return blockTimestamp + 60 * 20;
    }

    async getWalletBalance(token: Token, address: string, description: string) {
        let tokenBalance = await token.balanceOf(address);
        let ethBalance = await ethers.provider.getBalance(address);
        console.log(`${description} - ${address} - Token Balance: ${tokenBalance} - ETH Balance: ${ethBalance}`);
        return [tokenBalance, ethBalance];
    }

    async getSpecialWalletBalances(token: Token) {
        let receiveRewards = await token.receiveRewards();
        let [receiveRewardsTokenBalance, receiveRewardsEthBalance] = await this.getWalletBalance(token, receiveRewards, "Receive Rewards");
        let marketingWallet = await token.marketingWallet();
        let [marketingWalletTokenBalance, marketingWalletEthBalance] = await this.getWalletBalance(token, marketingWallet, "Marketing Wallet");
        let teamSalaryWallet = await token.teamSalaryWallet();
        let [teamSalaryTokenBalance, teamSalaryTokenBalanceEth] = await this.getWalletBalance(token, teamSalaryWallet, "Team Salary Wallet");
        let deadWallet = await token.deadWallet();
        let [deadWalletTokenBalance, deadWalletEthBalance] = await this.getWalletBalance(token, deadWallet, "Dead Wallet");
        return [marketingWalletTokenBalance, marketingWalletEthBalance, teamSalaryTokenBalance, teamSalaryTokenBalanceEth, deadWalletTokenBalance, deadWalletEthBalance, receiveRewardsTokenBalance, receiveRewardsEthBalance];
      }
      
      async printPairReserve(token: Token) {
        let pairAddress = await token.pair();
        const pairContract = await ethers.getContractAt("IUniswapV2Pair", pairAddress);
        const reserves = await pairContract.getReserves();
        console.log(`Pair Reserves: ${reserves}`);
      
        return reserves;
      }
      
      async verifyTotalSupply(token: Token, initialSupply: BigInt) {
        expect(await token.totalSupply()).to.equal(initialSupply);
      }
      
      async printAddressBalance(token: Token, addr1: string, addr2: string, addr3: string) {
        let addr1Balance = await token.balanceOf(addr1);
        let addr2Balance = await token.balanceOf(addr2);
        let addr3Balance = await token.balanceOf(addr3);
      
        console.log(`addr1 Balance (Token): ${addr1Balance}`);
        console.log(`addr2 Balance (Token): ${addr2Balance}`);
        console.log(`addr3 Balance (Token): ${addr3Balance}`);
      
        return [addr1Balance, addr2Balance, addr3Balance];
      }
}

module.exports = {
    EcosystemHelper
}