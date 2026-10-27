// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IDBondMarket {
    function buy(uint256 shareAmount, uint256 maxPaymentUSDC6, address receiver)
        external
        returns (uint256 paymentUSDC6);

    function redeem(uint256 shareAmount, uint256 minPayoutUSDC6, address receiver)
        external
        returns (uint256 payoutUSDC6);

    function seedReserve(uint256 amountUSDC6) external;

    function availableInventoryDBOND() external view returns (uint256);

    function availableReserveUSDC6() external view returns (uint256);

    function currentPriceUSDC6() external view returns (uint256);

    function previewBuyCostUSDC6(uint256 shareAmount) external view returns (uint256);

    function previewRedeemPayoutUSDC6(uint256 shareAmount) external view returns (uint256);
}
