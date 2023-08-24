// SPDX-License-Identifier: UNLICENSED
pragma solidity = 0.8.19;

interface INftRewardsDistributor {
    function distributeNFTRewards(address tokenToDistribute, uint256 amountToDistribute) external;
}