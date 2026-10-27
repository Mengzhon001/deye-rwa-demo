// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IEnergyRevenue {
    struct RevenueRecord {
        uint256 inflowUSDC6;
        uint256 fundedUSDC6;
        bytes32 settlementRef;
        bool exists;
    }

    function depositRevenue(
        bytes32 facilityId,
        bytes32 periodId,
        uint256 amountUSDC6,
        bytes32 settlementRef
    ) external;

    function fundReward(
        bytes32 facilityId,
        bytes32 periodId,
        uint256 amountUSDC6,
        bytes32 claimRoot
    ) external;

    function getRevenueRecord(bytes32 facilityId, bytes32 periodId)
        external
        view
        returns (RevenueRecord memory);
}
