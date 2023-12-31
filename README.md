![NFT DiviVerse](/docs/img/Banner.jpg)

> Unlocking the Infinite: Where NFTs Shine and Tokens Reflect, Dive into a Crypto Ecosystem Unlike Any Other!

- [🤝 Need help for deployment?](#-need-help-for-deployment)
- [🕵️‍♂️ Are you looking for the dapp?](#️️-are-you-looking-for-the-dapp)
- [✍️ tl;dr](#️-tldr)
  - [🪙 Token Features](#-token-features)
  - [🖼️ NFT Features](#️-nft-features)
- [How to get started](#how-to-get-started)
  - [🗝️ 1. Create secrets.json](#️-1-create-secretsjson)
  - [🏦 2. Configure marketingWallet, teamSalaryWallet, receiveRewards](#-2-configure-marketingwallet-teamsalarywallet-receiverewards)
  - [💪 3. Deploy both Token and NFT contracts](#-3-deploy-both-token-and-nft-contracts)
  - [💱 4. Add WETH/WBNB liquidity to the token liquidity pool](#-4-add-wethwbnb-liquidity-to-the-token-liquidity-pool)
  - [🤝 5. Enable token trading (function to avoid front runners)](#-5-enable-token-trading-function-to-avoid-front-runners)
  - [📨 6. Emit NFT Vouchers for Lazy Minting](#-6-emit-nft-vouchers-for-lazy-minting)
  - [🏷️ 7. Start selling the NFTs and enable premium reflections distribution](#️-7-start-selling-the-nfts-and-enable-premium-reflections-distribution)

# 🤝 Need help for deployment?
If you **need for deployment and use of this dapp and related smart contract**, you can find my contacts on my GitHub profile page.
___If you contact me on Telegram, write as first message that you have found my contact on GitHub or you will be automatically blocked___.

Pay attention: if questions are simple are free of charge, a complete project follow up will require consultancy fees, **refrain time wasters and day dreamers**.

# 🕵️‍♂️ Are you looking for the dapp?
[Checkout this other repository!](https://github.com/R3D4NG3L/NFTDiviVerse-Dapp)

# ✍️ tl;dr
**Open source solidity contracts optimized for Binance Smart Chain** (they might work also on Ethereum chain).

The ecosystem is composed by 2 smart contracts:
- Token (ERC20)
- NFT (ERC721)

## 🪙 Token Features
- **ERC20 Standard Token** (can be deployed on any EVM compatible blockchain, e.g. Ethereum, BSC, Cronos, Polygon, ...)
- **Buy/Sell Taxes for a total of 13%**:
    - **1,8% Base Reflections** shared among all token holders
    - **11,2% Other Taxes** as distributed
        - **5% Buy back and burn** to help the chart to stay green
        - **4,2% Premium Reflections for NFT holders** to encorauge the distribution of NFTs
        - **1% Marketing** to help project expansion
        - **1% Team Salary** to help the team keep building

## 🖼️ NFT Features
- **ERC721 Standard NFT**
- **Lazy minting**, this means that owner has full control over the number of mintable tokens and their price, **without paying any fee for NFT minting**. ([Click here](https://nftschool.dev/tutorial/lazy-minting/#how-it-works) for further details about Lazy Minting)
- **Customer will be able to buy the NFT by sending a part in stable coin and a part in token that will be burned reducing the supply causing scarcity**
- NFT holders will be able to **claim the 4,2% of the Premium Reflections generated by the token transactions**
- Premium reflections are equally distributed according to the total number of NFTs minted, every time that a new NFT is minted the rewards are equally distributed to him **causing market pressure to buy more NFTs to collect more rewards**.


# How to get started
## 🗝️ 1. Create secrets.json
Create a file secret.json on the root folder of the repository as follows and fill it with your deployer wallet private keys:
```json
{
    "testnet_private_key": "0x0000000000000000000000000000000000000000000000000000000000000000",
    "mainnet_private_key": "0x0000000000000000000000000000000000000000000000000000000000000000"
}
```

## 🏦 2. Configure marketingWallet, teamSalaryWallet, receiveRewards
In the contracts/Token.sol configure the following 3 wallet addresses as you wish (suggestion is to have 3 different wallet addresses):
- marketingWallet: Is where you will receive the **1% transaction taxes**
- teamSalaryWallet: Is where you will receive the **1% transaction taxes**
- receiveRewards: Is where you will receive the premium rewards **(4,2% transaction taxes)** until you don't sell enough NFTs to enable the premium reflections distribution. **The suggestion, is to not use the tokens that you will receive in this address but to burn them.**

## 💪 3. Deploy both Token and NFT contracts
Solution is based on hardhat.
Deploying scripts are available in "scripts" folder:
- *deployCompleteEcosystemInBscTestnet.ts*: Deployes the smart contracts on BSC Testnet 
- *deployCompleteEcosystemInBscMainnet.ts*: Deploys the smart contracts on BSC Mainnet

**Pay attention: the smart contracts are compatible only with Uniswap/Pancakeswap V2 routers**

## 💱 4. Add WETH/WBNB liquidity to the token liquidity pool
Add liquidity in ETH/BNB to the token liquidity pool.
Follow examples in the unit tests directory, in particular to the ``deployTokenFixture`` functions
```javascript
const router = await ethers.getContractAt("IUniswapV2Router02", routerAddress);
await token.connect(owner).approve(routerAddress, tokensToAddToLiquidity);
await token.connect(owner).approve(pairAddress, tokensToAddToLiquidity);
let tx = await router.addLiquidityETH(tokenAddress, tokensToAddToLiquidity, amountTokenMin,  ethToAddToLiquidity, to, deadline, { value: ethToAddToLiquidity });
```

## 🤝 5. Enable token trading (function to avoid front runners)
After adding the liquidity to the pool, remember to enable the trading functionalities.
**This functionality has been introduced to avoid front runner bots.**
To enable trading follow examples in the unit tests directory, in particular to the ``deployTokenFixture`` functions
```javascript
await token.enableTrading();
```

## 📨 6. Emit NFT Vouchers for Lazy Minting
Create as many NFT vouchers as needed, see the example reported in test/NftVouchers.ts
```javascript
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
```

## 🏷️ 7. Start selling the NFTs and enable premium reflections distribution
**The suggestion is to sell an initial amount of NFTs, according to your personal strategy, before enabling the Premium Reflection distribution**, otherwise the few that have this NFT will share the total transaction taxes of 4,2% of premium reflections.
Once you are ready to start distributing the premium reflections to NFT holders, enable the functionality in the token, follow examples in the unit tests directory, in particular to the ``deployTokenFixture`` functions
```javascript
await token.changePremiumReflectionsDistributor(nftContract.address);
```
