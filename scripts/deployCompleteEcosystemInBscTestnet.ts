import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with the account: ${deployer.address}`);
  const pancakeRouterBscTestnet = "0xdc4904b5f716Ff30d8495e35dC99c109bb5eCf81";
  console.log(`Going to deploy Token token with pancakeRouterBscTestnet: ${pancakeRouterBscTestnet} ...`);
  const TokenFactory = await ethers.getContractFactory("Token");
  const token = await TokenFactory.deploy(pancakeRouterBscTestnet);
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
