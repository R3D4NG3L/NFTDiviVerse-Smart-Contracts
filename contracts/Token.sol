// SPDX-License-Identifier: Unlicense
pragma solidity =0.8.19;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./Interfaces/INftRewardsDistributor.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

/**
 * @author  <a href="http://https://github.com/R3D4NG3L">R3D4NG3L</a>  
 * @title   Token Token
 * @notice  Taxes: 
             - 1,8% Base Reflections shared among all token holders
             - 11,2% Total Taxes as distributed
                - 5% Buy back and burn
                - 4,2% Premium Reflections for NFT holders
                - 1% Marketing
                - 1% Team Salary
 */

contract Token is Context, ERC20, Ownable {
    using SafeMath for uint256;
    using Address for address;

    // ----------------------------------------------------------------
    // Reflection vars
    // ----------------------------------------------------------------
    mapping(address => uint256) private _rOwned;
    mapping(address => uint256) private _tOwned;
    mapping(address => bool) private _isExcludedFromBaseReflections;
    address[] private _excluded;

    bool private swapping;

    IUniswapV2Router02 public router;
    address public pair;

    uint8 private constant _decimals = 18;
    uint256 private constant MAX = ~uint256(0);

    uint256 private _tTotal = 100_000_000 * 10 ** _decimals;
    uint256 private _rTotal = (MAX - (MAX % _tTotal));

    uint256 public swapTokensAtAmount = _tTotal.div(5_000);

    // ----------------------------------------------------------------
    // ---- Taxes Wallets ----
    // ----------------------------------------------------------------
    address public deadWallet = address(0x000000000000000000000000000000000000dEaD);
    address public marketingWallet = address(0xE076926beDF27f66f7a8B46C1d3E8fC8518516E5);
    address public teamSalaryWallet = address(0xE076926beDF27f66f7a8B46C1d3E8fC8518516E5);
    address public receiveRewards = address(0xE076926beDF27f66f7a8B46C1d3E8fC8518516E5);

    // ----------------------------------------------------------------
    // --- Events ---
    // ----------------------------------------------------------------
    event _tradingEnabledEvent(bool value);
    event _buyBackAndBurnEvent(uint256 amount);
    event _swappedTaxesForWETHEvent(uint256 amount);

    bool public isTradingEnabled = false;

    struct Taxes {
        uint256 baseReflections;
        uint256 premiumRfi_Mkt_Salry_Bbb;
    }

    // Taxes are a total of 13%, which 1,8% are base reflections, 
    // 11,2% are premium reflections, marketing, team salary and buy back and burn
    Taxes private taxes = Taxes(18, 112);

    mapping(address => bool) private _isExcludedFromTaxes;

    // ----------------------------------------------------------------
    // ---- Taxes Allocation ---
    // ---- Taxes are a total of 11,2% (excluding 1,8% of base reflections)
    // ---- Premium reflections allocation are 4,8% of this 11,2%, this means that is the 42,86% of those fees
    // ----------------------------------------------------------------
    // Excluding the premium reflections that are paid in tokens, the rest of the taxes are divided as follows
    // ---- Buy Back & Burn allocation is 5% of this 6,4%, this means that is the 78,13% of those fees
    // ---- Marketing allocation is 1% of this 6,4%, this means that is the 15,63% of those fees
    // ---- Salary allocation is 1% of this 6,4%, this means that is the 15,63% of those fees
    // ----------------------------------------------------------------
    uint256 private constant premiumReflectionsAllocation = 4286;
    uint256 private constant buyBackAllocation = 6873;
    uint256 private constant marketingAllocation = 1563;
    uint256 private constant salaryAllocation = 1563;
    uint256 private constant allocation_denominator = 10000;

    struct TotFeesPaidStruct {
        uint256 baseReflections;
        uint256 premiumRfi_Mkt_Salry_Bbb;
    }

    TotFeesPaidStruct public totFeesPaid;

    struct valuesFromGetValues {
        uint256 rAmount;
        uint256 rTransferAmount;
        uint256 rBaseReflections;
        uint256 rTaxes;
        uint256 tTransferAmount;
        uint256 tBaseReflections;
        uint256 tTaxes;
    }
    
    constructor(address routerAddress) ERC20("Token", "PRZ") {
        IUniswapV2Router02 _router = IUniswapV2Router02(routerAddress);
        address _pair = IUniswapV2Factory(_router.factory()).createPair(
            address(this),
            _router.WETH()
        );

        router = _router;
        pair = _pair;

        excludeFromBaseReflections(pair);
        excludeFromBaseReflections(deadWallet);

        _rOwned[owner()] = _rTotal;
        includeExcludeFromTaxes(address(this), true);
        includeExcludeFromTaxes(owner(), true);
        includeExcludeFromTaxes(marketingWallet, true);
        includeExcludeFromTaxes(deadWallet, true);
        includeExcludeFromTaxes(teamSalaryWallet, true);
        emit Transfer(address(0), owner(), _tTotal);
    }

    /**
     * @notice  Given a token amount, returns the reflection amount
     * @param   tAmount  Token Amount
     * @param   deductTransferRfi  Deduct base reflection fees
     * @return  uint256  Reflection amount
     */
    function reflectionFromToken(
        uint256 tAmount,
        bool deductTransferRfi
    ) public view returns (uint256) {
        require(tAmount <= _tTotal, "Amount must be less than supply");
        if (!deductTransferRfi) {
            valuesFromGetValues memory s = _getValues(tAmount, true);
            return s.rAmount;
        } else {
            valuesFromGetValues memory s = _getValues(tAmount, true);
            return s.rTransferAmount;
        }
    }

    /**
     * @notice  Given a reflection amount, calculate the token amount from it according to current rate
     * @param   rAmount  Reflection Amount
     * @return  uint256  Token Amount
     */
    function tokenFromReflection(
        uint256 rAmount
    ) public view returns (uint256) {
        require(
            rAmount <= _rTotal,
            "Amount must be less than total reflections"
        );
        uint256 currentRate = _getRate();
        return rAmount.div(currentRate);
    }

    /**
     * @notice  Deduct reflections from total
     * @param   rBaseReflections  Reflection - Base Reflection
     * @param   tBaseReflections  Supply - Base Reflection
     */
    function _reflectRfi(uint256 rBaseReflections, uint256 tBaseReflections) private {
        _rTotal = _rTotal.sub(rBaseReflections);
        totFeesPaid.baseReflections = totFeesPaid.baseReflections.add(tBaseReflections);
    }

    /**
     * @notice  Transfer the 9,2% of taxes to current smart contract address
     * @dev     Taxes will be liquidated on next transfers when reaching a minimum amount defined in swapTokensAtAmount
     * @param   rTaxes  Reflection Taxes
     * @param   tTaxes  Transfer Taxes
     */
    function _takeTaxes(uint256 rTaxes, uint256 tTaxes) private {
        totFeesPaid.premiumRfi_Mkt_Salry_Bbb = totFeesPaid.premiumRfi_Mkt_Salry_Bbb.add(tTaxes);

        if (_isExcludedFromBaseReflections[address(this)]) {
            _tOwned[address(this)] = _tOwned[address(this)].add(tTaxes);
        }
        _rOwned[address(this)] = _rOwned[address(this)].add(rTaxes);
    }

    /**
     * @notice  Get transcation values
     * @param   tAmount  Token to transfer
     * @param   takeTaxes  Take taxes
     * @return  values  Transaction values
     */
    function _getValues(
        uint256 tAmount,
        bool takeTaxes
    ) private view returns (valuesFromGetValues memory values) {
        values = _getTValues(tAmount, takeTaxes);
        (
            values.rAmount,
            values.rTransferAmount,
            values.rBaseReflections,
            values.rTaxes
        ) = _getRValues(values, tAmount, takeTaxes, _getRate());

        return values;
    }

    /**
     * @notice  Get Token Transaction Values
     * @param   tAmount  Token amount to transfer
     * @param   takeTaxes  Take taxes
     * @return  s  Transaction Values
     */
    function _getTValues(
        uint256 tAmount,
        bool takeTaxes
    ) private view returns (valuesFromGetValues memory s) {
        if (!takeTaxes) {
            s.tTransferAmount = tAmount;
            return s;
        }

        s.tBaseReflections = tAmount.mul(taxes.baseReflections).div(1000);
        s.tTaxes = tAmount.mul(taxes.premiumRfi_Mkt_Salry_Bbb).div(1000);
        s.tTransferAmount = tAmount.sub(s.tBaseReflections).sub(s.tTaxes);
        return s;
    }

    /**
     * @notice  Get Reflection Values
     * @param   s  Reflecition and Supply Values
     * @param   tAmount  Token Amount to transfer
     * @param   takeTaxes  Take Fee
     * @param   currentRate  Current Reflection Rate
     * @return  rAmount  Reflection Amount
     * @return  rTransferAmount  Reflections Transfer Amount
     * @return  rBaseReflections  Base Reflections Ammount
     * @return  rTaxes  Reflection Taxes
     */
    function _getRValues(
        valuesFromGetValues memory s,
        uint256 tAmount,
        bool takeTaxes,
        uint256 currentRate
    )
        private
        pure
        returns (
            uint256 rAmount,
            uint256 rTransferAmount,
            uint256 rBaseReflections,
            uint256 rTaxes
        )
    {
        rAmount = tAmount.mul(currentRate);

        if (!takeTaxes) {
            return (rAmount, rAmount, 0, 0);
        }

        rBaseReflections = s.tBaseReflections.mul(currentRate);
        rTaxes = s.tTaxes.mul(currentRate);
        rTransferAmount = rAmount.sub(rBaseReflections).sub(rTaxes);
        return (rAmount, rTransferAmount, rBaseReflections, rTaxes);
    }

    /**
     * @notice  Get reflection rate
     * @return  uint256  Reflection supply divided per total supply
     */
    function _getRate() private view returns (uint256) {
        (uint256 rSupply, uint256 tSupply) = _getCurrentSupply();
        return rSupply.div(tSupply);
    }

    /**
     * @notice  Get currenct supply
     * @return  uint256  Reflection supply
     * @return  uint256  Total supply
     */
    function _getCurrentSupply() private view returns (uint256, uint256) {
        uint256 rSupply = _rTotal;
        uint256 tSupply = _tTotal;
        for (uint256 i = 0; i < _excluded.length; i++) {
            if (
                _rOwned[_excluded[i]] > rSupply ||
                _tOwned[_excluded[i]] > tSupply
            ) return (_rTotal, _tTotal);
            rSupply = rSupply.sub(_rOwned[_excluded[i]]);
            tSupply = tSupply.sub(_tOwned[_excluded[i]]);
        }
        if (rSupply < _rTotal.div(_tTotal)) return (_rTotal, _tTotal);
        return (rSupply, tSupply);
    }

    /**
     * @notice  Indicates if the interaction is happening between normal addresses
     * @dev     Used to check if the interaction is dealing with special addresses or not
     * @param   from  Transfer From Address
     * @param   to  Transfer To Address
     * @return  bool  true if is a standard interaction, else false if is a special interaction
     */
    function isStandardInteraction(
        address from,
        address to
    ) internal view returns (bool) {
        bool isLimited = from != owner() &&
            to != owner() &&
            msg.sender != owner() &&
            !_isExcludedFromTaxes[from] &&
            !_isExcludedFromTaxes[to] &&
            to != address(0xdead) &&
            to != address(0) &&
            to != address(this);
        return isLimited;
    }

    /**
     * @dev     Transfer function counting reflections and taxes
     * @param   from  From Address
     * @param   to  Receiving Address
     * @param   amount  Amount of tokens to transfer
     */
    function _transfer(address from, address to, uint256 amount) internal override {
        require(from != address(0), "BEP20: transfer from the zero address");
        require(to != address(0), "BEP20: transfer to the zero address");
        require(amount > 0, "Transfer amount must be greater than zero");
        require(
            amount <= balanceOf(from),
            "You are trying to transfer more than your balance"
        );

        if (isStandardInteraction(from, to)) {
            require(isTradingEnabled, "Trading is not enabled");
        }

        bool canSwap = balanceOf(address(this)) >= swapTokensAtAmount;
        if (
            !swapping &&
            canSwap &&
            from != pair &&
            !_isExcludedFromTaxes[from] &&
            !_isExcludedFromTaxes[to]
        ) {
            swapAndLiquify();
        }
        bool takeTaxes = true;
        if (swapping || _isExcludedFromTaxes[from] || _isExcludedFromTaxes[to])
            takeTaxes = false;
        
        _tokenTransfer(from, to, amount, takeTaxes);
    }

    /**
     * @notice  Token transfer
     * @param   sender  Sender
     * @param   recipient  Receiving recipient
     * @param   tAmount  Token Amount to transfer
     * @param   takeTaxes  Take Taxes
     */
    function _tokenTransfer(
        address sender,
        address recipient,
        uint256 tAmount,
        bool takeTaxes
    ) private {
        valuesFromGetValues memory s = _getValues(tAmount, takeTaxes);

        if (_isExcludedFromBaseReflections[sender]) {
            _tOwned[sender] = _tOwned[sender].sub(tAmount);
        }
        if (_isExcludedFromBaseReflections[recipient]) {
            _tOwned[recipient] = _tOwned[recipient].add(s.tTransferAmount);
        }

        _rOwned[sender] = _rOwned[sender].sub(s.rAmount);
        _rOwned[recipient] = _rOwned[recipient].add(s.rTransferAmount);

        if (s.rBaseReflections > 0 || s.tBaseReflections > 0) _reflectRfi(s.rBaseReflections, s.tBaseReflections);
        if (s.rTaxes > 0 || s.tTaxes > 0)
            _takeTaxes(s.rTaxes, s.tTaxes);
        emit Transfer(sender, recipient, s.tTransferAmount);
    }

    /**
     * @notice  Takes current contract balance and distributes tokens for premium reflections, and swaps the remaining part in BNBs
     *          and sends them to marketing, team salary and buy back and burn wallets
     */
    function swapAndLiquify() private lockTheSwap {
        uint256 contractBalance = balanceOf(address(this));
        // Send premium reflections to receiveRewards wallet
        uint256 rewardsAmount = premiumReflectionsAllocation.mul(contractBalance).div(allocation_denominator);
        if (rewardsAmount > 0)
        {
            _transfer(address(this), receiveRewards, rewardsAmount);
            if (_isContract(receiveRewards))
            {
                INftRewardsDistributor distributor = INftRewardsDistributor(receiveRewards);
                try distributor.distributeNFTRewards(address(this), rewardsAmount) { } catch { }
            }
        }

        contractBalance = balanceOf(address(this));
        _swapTokensForWETH(contractBalance);        

        bool success;

        uint256 buyBack = buyBackAllocation.mul(address(this).balance).div(allocation_denominator);
        uint256 mark = marketingAllocation.mul(address(this).balance).div(allocation_denominator);
        uint256 sal = salaryAllocation.mul(address(this).balance).div(allocation_denominator);

        if (mark > 0) {
            (success, ) = marketingWallet.call{value: mark, gas: 35000}("");
        }
        if (sal > 0) {
            (success, ) = teamSalaryWallet.call{value: sal, gas: 35000}("");
        }
        if (buyBack > 0) {
            _buyBackAndBurn(buyBack);
        }
    }

    /**
     * @notice  Update taxes receiver wallets
     * @param   _newMarketingWallet  New Marketing Wallet
     * @param   _teamSalaryWallet  New Team Salary Wallet
     */
    function updateWallets(
        address _newMarketingWallet,
        address _teamSalaryWallet
    ) external onlyOwner {
        require(_newMarketingWallet != address(0), "Zero address");
        require(_teamSalaryWallet != address(0), "Zero Address");
        marketingWallet = _newMarketingWallet;
        teamSalaryWallet = _teamSalaryWallet;
        includeExcludeFromTaxes(marketingWallet, true);
        includeExcludeFromTaxes(teamSalaryWallet, true);
    }

    /**
     * @dev     No checks, but not suggested to set values higher than 10_000 (1% of _tTotal supply)
     * @param   amount  Minimum amount of tokens to trigger the swapAndLiquify for taxes redistribution
     */
    function updateSwapTokensAtAmount(uint256 amount) external onlyOwner {        
        swapTokensAtAmount = amount;
    }

    /**
     * @dev isTradingEnabled can't be disabled otherwise might be flagged as honeypot
     */
    function enableTrading() external onlyOwner {
        require(isTradingEnabled != true, "Same Bool");
        isTradingEnabled = true;
        emit _tradingEnabledEvent(true);
    }

    /**
     * @dev     Change premium reflections distributor. Set 0 to stop distributing premium reflections.
     * @param   distributorAddress Distributor Address
     */
    function changePremiumReflectionsDistributor(address distributorAddress) external onlyOwner {
        receiveRewards = distributorAddress;
        if (!_isExcludedFromBaseReflections[distributorAddress]) {
            excludeFromBaseReflections(distributorAddress);
        }
        if (!isExcludedFromTaxes(distributorAddress)) {
            includeExcludeFromTaxes(distributorAddress, true);
        }
    }

    /**
     * @dev     Checks if an address is a smart contract
     * @param   addr  Address to check
     * @return  bool  true: is a smart contract, else false
     */
    function _isContract(address addr) internal view returns (bool) {
        uint size;
        assembly { size := extcodesize(addr) }
        return size > 0;
    }
    
    // ----------------------------------------------------------------
    // --- ERC20 Custom Implementations ----
    // ----------------------------------------------------------------
    /**
     * @notice  Token Decimals
     * @return  uint8  Token Decimals
     */
    function decimals() public pure override returns (uint8) {
        return _decimals;
    }

    /**
     * @notice  Total supply excluded dead wallet. This is a deflationatory token.
     * @return  uint256  Total supply
     */
    function totalSupply() public view override returns (uint256) {
        return _tTotal.sub(balanceOf(deadWallet));
    }

    /**
     * @notice  Balance of wallet
     * @dev     Special conditions for special wallets excluded from reflections
     * @param   account  Account to check the balance
     * @return  uint256  Account balance
     */
    function balanceOf(address account) public view override returns (uint256) {
        if (_isExcludedFromBaseReflections[account]) return _tOwned[account];
        return tokenFromReflection(_rOwned[account]);
    }

    // ----------------------------------------------------------------
    // Include/Exclude from base reflections
    // ----------------------------------------------------------------
    /**
     * @notice  Checks if an address is excluded from base reflections
     * @param   account  Account to check
     * @return  bool  true if the address is excluded from base reflections, else false
     */
    function isExcludedFromBaseReflections(
        address account
    ) public view returns (bool) {
        return _isExcludedFromBaseReflections[account];
    }

    /**
     * @notice  Exclude an address from base reflections
     * @dev     Usefull for LP pair and Dead Wallet
     * @param   account  Account to exclude from base reflections
     */
    function excludeFromBaseReflections(address account) public onlyOwner {
        require(
            !_isExcludedFromBaseReflections[account],
            "Account is already excluded"
        );
        if (_rOwned[account] > 0) {
            _tOwned[account] = tokenFromReflection(_rOwned[account]);
        }
        _isExcludedFromBaseReflections[account] = true;
        _excluded.push(account);
    }

    /**
     * @notice  Include an address for base reflections
     * @param   account  Account to include for base reflections
     */
    function includeInBaseReflections(address account) external onlyOwner {
        require(
            _isExcludedFromBaseReflections[account],
            "Account is not excluded"
        );
        for (uint256 i = 0; i < _excluded.length; i++) {
            if (_excluded[i] == account) {
                _excluded[i] = _excluded[_excluded.length.sub(1)];
                _tOwned[account] = 0;
                _isExcludedFromBaseReflections[account] = false;
                _excluded.pop();
                break;
            }
        }
    }

    // ----------------------------------------------------------------
    // Include/Exclude from taxes
    // ----------------------------------------------------------------
    /**
     * @notice  Exclude an address from taxes
     * @param   account  Account to exclude from taxes
     * @param   exclude true to exclude the account, else false to include it
     */
    function includeExcludeFromTaxes(address account, bool exclude) public onlyOwner {
        _isExcludedFromTaxes[account] = exclude;
    }

    /**
     * @notice  Checks if an address is excluded from taxes
     * @param   account  Account to check
     * @return  bool  true if the address is excluded for taxes, else false
     */
    function isExcludedFromTaxes(address account) public view returns (bool) {
        return _isExcludedFromTaxes[account];
    }

    // ----------------------------------------------------------------
    // --- Liquidity pool interactions ---
    // ----------------------------------------------------------------
    // Receive function for liquidity pool interactions
    receive() external payable {}

    /**
     * @notice  Used to indicate that an interaction with the Liquidity pool is in progress     
     */
    modifier lockTheSwap() {
        swapping = true;
        _;
        swapping = false;
    }

    /**
     * @notice  Swap Tokens for WETH
     * @dev     Used to swap collected taxes from previous transactions. If deployed on BSC will automatically be WBNB.
     * @param   tokenAmount  Tokens to swap to WETH
     */
    function _swapTokensForWETH(uint256 tokenAmount) private {
        address[] memory path = new address[](2);
        path[0] = address(this);
        path[1] = router.WETH();

        _approve(address(this), address(router), tokenAmount);

        try
            // Refer to: https://docs.uniswap.org/contracts/v2/reference/smart-contracts/router-02#swapexacttokensforethsupportingfeeontransfertokens
            router.swapExactTokensForETHSupportingFeeOnTransferTokens(
                tokenAmount,
                0,
                path,
                address(this),
                block.timestamp
            )
        { 
            emit _swappedTaxesForWETHEvent(tokenAmount);
        }
        catch {
            // Suppress exceptions
            return;
        }
    }

    /**
     * @notice  Buy back and burn
     * @dev     .
     * @param   amount  .
     */
    function _buyBackAndBurn(uint256 amount) internal {
        bool failed;

        address[] memory path = new address[](2);
        path[0] = router.WETH();
        path[1] = address(this);

        try
            router.swapExactETHForTokensSupportingFeeOnTransferTokens{
                value: amount
            }(0, path, address(0xdead), block.timestamp)
        {} catch {
            failed = false;
        }

        if (!failed) {
            emit _buyBackAndBurnEvent(amount);
        }
    }

    // ----------------------------------------------------------------
    // Safety Functions
    // ----------------------------------------------------------------
    /*
     * @fn rescueBNB
     * @brief Rescue BNBs stuck in the contract and sends them to msg.sender
     * @param weiAmount: wei amount to send to msg.sender
     */
    function rescueBNB(uint256 weiAmount) external onlyOwner {
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
    ) external onlyOwner {
        require(
            _tokenAddr != address(this),
            "Owner can't claim contract's balance of its own tokens"
        );
        IERC20(_tokenAddr).transfer(msg.sender, _amount);
    }
    
    // ----------------------------------------------------------------
    // Ownership Policy
    // ----------------------------------------------------------------
    function transferOwnership(address newOwner) public virtual override onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        // Transfer all tokens without fees
        transfer(newOwner, balanceOf(owner()));
        // Exclude new owner
        includeExcludeFromTaxes(newOwner, true);
        // Transfer ownership
        _transferOwnership(newOwner);
    }
}
