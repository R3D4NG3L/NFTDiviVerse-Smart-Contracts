import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with the account: ${deployer.address}`);
  const pancakeRouterBscMainnet = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
  console.log(`Going to deploy Token token with pancakeRouterBscMainnet: ${pancakeRouterBscMainnet} ...`);
  const TokenFactory = await ethers.getContractFactory("Token");
  const token = await TokenFactory.deploy(pancakeRouterBscMainnet);
  console.log(`Token Contract deployed to: ${token.address}`);
  console.log(`Going to deploy Nft ...`);
  const NftFactory = await ethers.getContractFactory("Nft");
  const Nft = await NftFactory.deploy(deployer.address);
  console.log(`Nft Contract deployed to: ${Nft.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
