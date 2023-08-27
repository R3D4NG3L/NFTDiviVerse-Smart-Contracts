// SPDX-License-Identifier: Unlicense
pragma solidity =0.8.19;
pragma abicoder v2; // required to accept structs as function parameters

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./Interfaces/INftRewardsDistributor.sol";

contract Nft is
    ERC721URIStorage,
    EIP712,
    AccessControl,
    INftRewardsDistributor
{
    using SafeMath for uint256;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    string private constant SIGNING_DOMAIN = "Nft-Voucher";
    string private constant SIGNATURE_VERSION = "1";
    address public revenuesWallet = address(0x1C122ad7B55488e177A1cb041dCf5cb09038cA4B);
    address public deadWallet = address(0x000000000000000000000000000000000000dEaD);
    mapping(address => uint256) private _rewardsToDistribute;
    mapping(bytes32 => uint256) private _rewardsWithdrawn;
    bool private _haltWithdraws = false;
    uint256 public totalSupply = 0;

    event _withdrawsHaltChange(bool halt);
    event _withdrawPremiumRefleciton(address tokenToDistribute, uint256 amount);

    constructor(
        address payable minter
    ) ERC721("NftDiviVerse", "NDV") EIP712(SIGNING_DOMAIN, SIGNATURE_VERSION) {        
        _setupRole(MINTER_ROLE, minter);
    }

    /// @notice Represents an un-minted NFT, which has not yet been recorded into the blockchain. A signed voucher can be redeemed for a real NFT using the redeem function.
    struct NFTVoucher {
        /// @notice The id of the token to be redeemed. Must be unique - if another token with this ID already exists, the redeem function will revert.
        uint256 tokenId;
        /// @notice Stable Coin Address
        address stableCoinAddress;
        /// @notice The minimum price (in Stable Coin) that the NFT creator is willing to accept for the initial sale of this NFT.
        uint256 minStableCoinPrice;
        /// @notice Token address
        address tokenAddress;
        /// @notice The minimum price in token that the NFT creator is willing to accept for the initial sale of this NFT
        uint256 minTokenPrice;
        /// @notice The metadata URI to associate with this token.
        string uri;
        /// @notice the EIP-712 signature of all other fields in the NFTVoucher struct. For a voucher to be valid, it must be signed by an account with the MINTER_ROLE.
        bytes signature;
    }

    /// @notice Redeems an NFTVoucher for an actual NFT, creating it in the process.
    /// @param redeemer The address of the account which will receive the NFT upon success.
    /// @param voucher A signed NFTVoucher that describes the NFT to be redeemed.
    function redeem(
        address redeemer,
        NFTVoucher calldata voucher
    ) public payable returns (uint256) {
        // make sure signature is valid and get the address of the signer
        address signer = _verify(voucher);
        
        // make sure that the signer is authorized to mint NFTs
        require(
            hasRole(MINTER_ROLE, signer),
            "Signature invalid or unauthorized"
        );

        // make sure that the redeemer is paying enough to cover the buyer's cost
        if (voucher.stableCoinAddress != address(0))
        {
            IERC20 stableCoin = IERC20(voucher.stableCoinAddress);
            require(stableCoin.balanceOf(msg.sender) >= voucher.minStableCoinPrice, "Insufficient stable coin balance to redeem");
            require(stableCoin.allowance(msg.sender, revenuesWallet) >= voucher.minStableCoinPrice, "Insufficient stable coin allowance for revenuesWallet to redeem");
        }

        if (voucher.tokenAddress != address(0))
        {
            IERC20 token = IERC20(voucher.tokenAddress);
            require(token.balanceOf(msg.sender) >= voucher.minTokenPrice, "Insufficient token balance to redeem");
            require(token.allowance(msg.sender, deadWallet) >= voucher.minTokenPrice, "Insufficient token allowance for deadWallet to redeem");
            // Add token address as authorized distributor
            _setupRole(DISTRIBUTOR_ROLE, voucher.tokenAddress);
        }

        // transfer stable coins & tokens to revenuesWallet
        bool success;
        if (voucher.minStableCoinPrice > 0)
        {
            IERC20 stableCoin = IERC20(voucher.stableCoinAddress);
            success = stableCoin.transferFrom(msg.sender, revenuesWallet, voucher.minStableCoinPrice);
            require(success, "Stable Coin Payment failed!");
        }
        if (voucher.minTokenPrice > 0)
        {
            IERC20 token = IERC20(voucher.tokenAddress);
            success = token.transferFrom(msg.sender, deadWallet, voucher.minTokenPrice);
            require(success, "Token Payment failed!");
        }

        // assign the token to the signer, to establish provenance on-chain
        _mint(signer, voucher.tokenId);
        _setTokenURI(voucher.tokenId, voucher.uri);
        totalSupply = totalSupply.add(1);

        // transfer the token to the redeemer
        _transfer(signer, redeemer, voucher.tokenId);

        return voucher.tokenId;
    }

    /// @notice Returns a hash of the given NFTVoucher, prepared using EIP712 typed data hashing rules.
    /// @param voucher An NFTVoucher to hash.
    function _hash(
        NFTVoucher calldata voucher
    ) internal view returns (bytes32) {
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        keccak256(
                            "NFTVoucher(uint256 tokenId,address stableCoinAddress,uint256 minStableCoinPrice,address tokenAddress,uint256 minTokenPrice,string uri)"
                        ),
                        voucher.tokenId,
                        voucher.stableCoinAddress,
                        voucher.minStableCoinPrice,
                        voucher.tokenAddress,
                        voucher.minTokenPrice,
                        keccak256(bytes(voucher.uri))
                    )
                )
            );
    }

    /// @notice Returns the chain id of the current blockchain.
    /// @dev This is used to workaround an issue with ganache returning different values from the on-chain chainid() function and
    ///  the eth_chainId RPC method. See https://github.com/protocol/nft-website/issues/121 for context.
    function getChainID() external view returns (uint256) {
        uint256 id;
        assembly {
            id := chainid()
        }
        return id;
    }

    /// @notice Verifies the signature for a given NFTVoucher, returning the address of the signer.
    /// @dev Will revert if the signature is invalid. Does not verify that the signer is authorized to mint NFTs.
    /// @param voucher An NFTVoucher describing an unminted NFT.
    function _verify(
        NFTVoucher calldata voucher
    ) internal view returns (address) {
        bytes32 digest = _hash(voucher);
        return ECDSA.recover(digest, voucher.signature);
    }

    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        virtual
        override(AccessControl, ERC721URIStorage)
        returns (bool)
    {
        return
            ERC721.supportsInterface(interfaceId) ||
            AccessControl.supportsInterface(interfaceId);
    }

    // ----------------------------------------------------------------
    // Token Premium Reflections Management
    // ----------------------------------------------------------------
    function haltWithdraws(bool halt) external onlyRole(MINTER_ROLE) {
        require(halt != _haltWithdraws, "Same bool");
        _haltWithdraws = halt;
        emit _withdrawsHaltChange(halt);
    }

    /**
     * @notice  Distirbute NFT Rewards in Token (PRZ) token
     * @param tokenToDistribute Token Address to Distribute as Reward
     */
    function distributeNFTRewards(address tokenToDistribute, uint256 amountToDistribute) external onlyRole(DISTRIBUTOR_ROLE){
        _rewardsToDistribute[tokenToDistribute] = _rewardsToDistribute[tokenToDistribute].add(amountToDistribute);
    }

    /**
     * @notice  Checks the amount of premium reflections that the NFT holder can withdraw
     * @param tokenToDistribute Token Address pf Premium Reflections (PRZ)
     */
    function checkHolderPremiumReflectionsBalance(address tokenToDistribute) public view returns (uint256) {
        require(balanceOf(msg.sender) > 0, "Address doesn't own any NFT");
        require(!_haltWithdraws, "Withdraws halted");
        // Get number of NFTs owned by msg.sender
        uint256 nftsOwned = balanceOf(msg.sender);
        // Get number of NFTs minted
        uint256 nftsMinted = totalSupply;
        // Get total tokens to distribute
        uint256 totalTokenToDistribute = _rewardsToDistribute[tokenToDistribute];
        // Get total tokens already withdrawn by msg.sender
        uint256 tokensAlreadyWithdrawn = _rewardsWithdrawn[keccak256(abi.encodePacked(msg.sender, tokenToDistribute))];
        // Get share for each NFT holder
        uint256 share = totalTokenToDistribute.div(nftsMinted).mul(nftsOwned);
        // Return holder balance available to withdraw
        if (share <= tokensAlreadyWithdrawn)
            return 0;
        return share.sub(tokensAlreadyWithdrawn);
    }

    /**
     * @notice  Withdraw Premium Reflections
     * @dev     Message sender will withdraw its share of premium reflections
     * @param   tokenToDistribute  Premium Reflections Token Address
     * @return  bool  true - Operation completed successfully. If any error an exception will be thrown.
     */
    function withdrawPremiumReflections(address tokenToDistribute) external returns (bool) {
        uint256 withdrawableAmount = checkHolderPremiumReflectionsBalance(tokenToDistribute);
        require(withdrawableAmount > 0, "No withdrawable amount");
        IERC20 token = IERC20(tokenToDistribute);
        bool res = token.transfer(_msgSender(), withdrawableAmount);
        require(res == true, "Token transfer failed!");
        _rewardsWithdrawn[keccak256(abi.encodePacked(msg.sender, tokenToDistribute))] = 
        _rewardsWithdrawn[keccak256(abi.encodePacked(msg.sender, tokenToDistribute))].add(withdrawableAmount);
        emit _withdrawPremiumRefleciton(tokenToDistribute, withdrawableAmount);
        return true;
    }

    // ----------------------------------------------------------------
    // Parameters Changes
    // ----------------------------------------------------------------
    /**
     * @dev     Change revenues wallet
     * @param   newWallet Distributor Address
     */
    function changeRevenuesWallet(address newWallet) external onlyRole(MINTER_ROLE) {
        require(revenuesWallet != newWallet, "Same wallet address");
        revenuesWallet = newWallet;
    }

    // ----------------------------------------------------------------
    // Safety Functions
    // ----------------------------------------------------------------
    function addMinter(address minterAddress) external onlyRole(MINTER_ROLE) {
      _setupRole(MINTER_ROLE, minterAddress);
    }

    // Receive function
    receive() external payable {}

    /*
     * @fn rescueBNB
     * @brief Rescue BNBs stuck in the contract and sends them to msg.sender
     * @param weiAmount: wei amount to send to msg.sender
     */
    function rescueBNB(uint256 weiAmount) external onlyRole(MINTER_ROLE) {
        require(address(this).balance >= weiAmount, "Insufficient BNB balance");
        payable(msg.sender).transfer(weiAmount);
    }

    /*
     * @fn rescueAnyIERC20Tokens
     * @brief Rescue IERC20 Tokens stuck in the contract and sends them to msg.sender
     * @param _tokenAddr: Token Address to rescue
     * @param _amount: amount to send to msg.sender
     */
    function rescueAnyIERC20Tokens(
        address _tokenAddr,
        uint256 _amount
    ) external onlyRole(MINTER_ROLE) {
        require(
            _tokenAddr != address(this),
            "Owner can't claim contract's balance of its own tokens"
        );
        IERC20(_tokenAddr).transfer(msg.sender, _amount);
    }
}
