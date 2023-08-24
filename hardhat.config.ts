import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
const { testnet_private_key, mainnet_private_key } = require('./secrets.json');
const convert = require('ethereum-unit-converter')

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },
  networks: {
    hardhat: {
      forking: {
        url: "https://bsc-dataseed.binance.org",
      },
      accounts: [
        {
          privateKey: testnet_private_key,
          balance: convert("1000", "ether", "wei")
        },
        {
          privateKey: mainnet_private_key,
          balance: convert("1000", "ether", "wei")
        },
        {
          privateKey: "0x68aeb83af6ef7d8ae62ccaa583cd7dbea94acd1a3b671940d188e64faf27f394",
          balance: convert("1000", "ether", "wei")
        },
        {
          privateKey: "0x34575c1d7b77bec573166552c1e6bedf54a5668d1db38ca068c47327d793f9ca",
          balance: convert("1000", "ether", "wei")
        },
        {
          privateKey: "0x1a2bae0ebdbbdf62b98b32a960f35f6faa52b3468ed9c65034623993ebc9fce5",
          balance: convert("1000", "ether", "wei")
        },
      ]
    },
    bscTestNet: {
      url: "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
      chainId: 97,
      gasPrice: 20000000000,
      accounts: [testnet_private_key]
    },
    bscMainnet: {
      url: "https://bsc-dataseed.bnbchain.org/",
      chainId: 56,
      gasPrice: 20000000000,
      accounts: [mainnet_private_key]
    }
  },
  etherscan: {
    apiKey: "TZBXGC6K2CMD2NB6AGGI5AEYARC9MAIH4I",
  },
};

export default config;
