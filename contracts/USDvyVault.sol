// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title USDvyVault
 * @notice ERC20 token representing a share of the underlying vault assets.
 *         Users deposit USDC to mint shares. Off-chain program updates `totalAssets`
 *         to reflect performance of the strategy so redemption amounts grow over time.
 */
contract USDvyVault is ERC20, Ownable {
    /// @notice Underlying USDC token (6 decimals).
    IERC20 public immutable usdc;

    /// @dev Constant decimals for USDC.
    uint8 private constant USDC_DECIMALS = 6;

    /// @notice Total net asset value of the vault denominated in USDC
    ///         and expressed with USDC's 6-decimals (e.g. 10 USDC == 10_000000).
    uint256 public totalAssets;

    // Withdrawal request tracking
    struct WithdrawalRequest {
        address receiver;
        uint256 shares;   // 18-decimals
        uint256 assets;   // 6-decimals (USDC)
        bool processed;
    }

    /// @notice Map withdrawal request id => request data.
    mapping(uint256 => WithdrawalRequest) public withdrawalRequests;

    /// @notice Incremental id for the next withdrawal request.
    uint256 public nextWithdrawalRequestId;

    event Deposit(address indexed caller, address indexed owner, uint256 assets, uint256 shares);
    event Redeem(address indexed caller, address indexed receiver, uint256 shares, uint256 assets);
    event TotalAssetsUpdated(uint256 prevAssets, uint256 newAssets);
    event WithdrawalRequested(uint256 indexed requestId, address indexed caller, address indexed receiver, uint256 shares, uint256 assets);
    event WithdrawalProcessed(uint256 indexed requestId);

    constructor(address usdcAddress) ERC20("USDvy Vault Share", "USDVY") Ownable(msg.sender) {
        require(usdcAddress != address(0), "USDC address zero");
        usdc = IERC20(usdcAddress);
    }

    /*//////////////////////////////////////////////////////////////
                               VIEW
    //////////////////////////////////////////////////////////////*/

    /// @notice Price per share scaled to 18 decimals (1e18 == 1 USDC).
    function pricePerShare() public view returns (uint256) {
        if (totalSupply() == 0) {
            return 10 ** (18 - USDC_DECIMALS); // 1 USDC expressed with 18 decimals
        }
        return (totalAssets * 1e18) / totalSupply();
    }

    /*//////////////////////////////////////////////////////////////
                               USER
    //////////////////////////////////////////////////////////////*/

    /// @notice Deposit `assets` USDC and mint vault shares to `receiver`.
    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        require(assets > 0, "zero assets");

        uint256 _totalSupply = totalSupply();
        uint256 _totalAssetsBefore = totalAssets;

        // Calculate shares to mint.
        if (_totalSupply == 0) {
            // On first deposit: shares = assets adjusted to 18 decimals (6 -> 18)
            shares = assets * 1e12;
        } else {
            shares = (assets * _totalSupply) / _totalAssetsBefore;
        }
        require(shares > 0, "zero shares");

        // Pull USDC from sender
        require(usdc.transferFrom(msg.sender, address(this), assets), "transfer failed");

        // Update accounting and mint
        totalAssets = _totalAssetsBefore + assets;
        _mint(receiver, shares);

        emit Deposit(msg.sender, receiver, assets, shares);
    }

    /// @notice Redeem `shares` for underlying USDC to `receiver`.
    function redeemRequest(uint256 shares, address receiver) external returns (uint256 assets) {
        require(shares > 0, "zero shares");
        uint256 _totalSupply = totalSupply();
        require(_totalSupply > 0, "no supply");

        assets = (shares * totalAssets) / _totalSupply;
        require(assets > 0, "zero assets");

        // Burn the shares immediately.
        _burn(msg.sender, shares);

        // Store withdrawal request for off-chain processing.
        uint256 requestId = nextWithdrawalRequestId++;
        withdrawalRequests[requestId] = WithdrawalRequest({
            receiver: receiver,
            shares: shares,
            assets: assets,
            processed: false
        });

        emit WithdrawalRequested(requestId, msg.sender, receiver, shares, assets);

        return assets;
    }

    /*//////////////////////////////////////////////////////////////
                               ADMIN
    //////////////////////////////////////////////////////////////*/

    /// @notice Off-chain program updates NAV (denominated in USDC 6 decimals).
    function setTotalAssets(uint256 newTotalAssets) external onlyOwner {
        emit TotalAssetsUpdated(totalAssets, newTotalAssets);
        totalAssets = newTotalAssets;
    }

    /// @notice Owner can move underlying USDC out for strategy management.
    function pullUnderlying(address to, uint256 amount) external onlyOwner {
        require(usdc.transfer(to, amount), "transfer failed");
    }

    /// @dev Vault shares use 18 decimals.
    function decimals() public pure override returns (uint8) {
        return 18;
    }

    /// @notice Mark a withdrawal request as processed after off-chain USDC transfer.
    function markWithdrawalProcessed(uint256 requestId) external onlyOwner {
        WithdrawalRequest storage request = withdrawalRequests[requestId];
        require(!request.processed, "already processed");
        request.processed = true;

        emit WithdrawalProcessed(requestId);
    }
} 