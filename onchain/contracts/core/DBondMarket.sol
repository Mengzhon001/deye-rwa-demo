// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IDBondMarket} from "../interfaces/IDBondMarket.sol";
import {IRWAVault} from "../interfaces/IRWAVault.sol";

contract DBondMarket is IDBondMarket, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant RESERVE_MANAGER_ROLE = keccak256("RESERVE_MANAGER_ROLE");

    IRWAVault public immutable vault;
    IERC20 public immutable dbond;
    IERC20 public immutable usdc;

    event BondPurchased(
        address indexed buyer,
        address indexed receiver,
        uint256 shareAmount,
        uint256 paymentUSDC6
    );
    event BondRedeemed(
        address indexed seller,
        address indexed receiver,
        uint256 shareAmount,
        uint256 payoutUSDC6
    );
    event ReserveSeeded(address indexed operator, uint256 amountUSDC6);

    constructor(address admin, address vaultAddress, address usdcAddress) {
        require(admin != address(0), "admin is zero");
        require(vaultAddress != address(0), "vault is zero");
        require(usdcAddress != address(0), "usdc is zero");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RESERVE_MANAGER_ROLE, admin);

        vault = IRWAVault(vaultAddress);
        dbond = IERC20(vaultAddress);
        usdc = IERC20(usdcAddress);
    }

    function buy(uint256 shareAmount, uint256 maxPaymentUSDC6, address receiver)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 paymentUSDC6)
    {
        require(receiver != address(0), "receiver is zero");
        require(shareAmount > 0, "share amount is zero");
        require(shareAmount <= availableInventoryDBOND(), "insufficient inventory");

        paymentUSDC6 = previewBuyCostUSDC6(shareAmount);
        require(paymentUSDC6 > 0, "payment is zero");
        require(paymentUSDC6 <= maxPaymentUSDC6, "payment exceeds max");

        usdc.safeTransferFrom(msg.sender, address(this), paymentUSDC6);
        dbond.safeTransfer(receiver, shareAmount);

        emit BondPurchased(msg.sender, receiver, shareAmount, paymentUSDC6);
    }

    function redeem(uint256 shareAmount, uint256 minPayoutUSDC6, address receiver)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 payoutUSDC6)
    {
        require(receiver != address(0), "receiver is zero");
        require(shareAmount > 0, "share amount is zero");

        payoutUSDC6 = previewRedeemPayoutUSDC6(shareAmount);
        require(payoutUSDC6 > 0, "payout is zero");
        require(payoutUSDC6 >= minPayoutUSDC6, "payout below min");
        require(payoutUSDC6 <= availableReserveUSDC6(), "insufficient reserve");

        dbond.safeTransferFrom(msg.sender, address(this), shareAmount);
        usdc.safeTransfer(receiver, payoutUSDC6);

        emit BondRedeemed(msg.sender, receiver, shareAmount, payoutUSDC6);
    }

    function seedReserve(uint256 amountUSDC6) external onlyRole(RESERVE_MANAGER_ROLE) {
        require(amountUSDC6 > 0, "amount is zero");
        usdc.safeTransferFrom(msg.sender, address(this), amountUSDC6);
        emit ReserveSeeded(msg.sender, amountUSDC6);
    }

    function availableInventoryDBOND() public view returns (uint256) {
        return dbond.balanceOf(address(this));
    }

    function availableReserveUSDC6() public view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function currentPriceUSDC6() public view returns (uint256) {
        uint256 price = vault.navPerShare();
        require(price > 0, "price unavailable");
        return price;
    }

    function previewBuyCostUSDC6(uint256 shareAmount) public view returns (uint256) {
        return _quote(shareAmount, currentPriceUSDC6(), true);
    }

    function previewRedeemPayoutUSDC6(uint256 shareAmount) public view returns (uint256) {
        return _quote(shareAmount, currentPriceUSDC6(), false);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function _quote(uint256 shareAmount, uint256 priceUSDC6, bool roundUp) private pure returns (uint256) {
        uint256 numerator = shareAmount * priceUSDC6;
        uint256 denominator = 1e18;
        if (!roundUp) {
            return numerator / denominator;
        }
        return numerator == 0 ? 0 : ((numerator - 1) / denominator) + 1;
    }
}
