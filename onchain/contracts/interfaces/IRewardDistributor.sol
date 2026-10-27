// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRewardDistributor {
    struct Distribution {
        bytes32 claimRoot;
        uint256 totalReward;
        uint256 claimedReward;
        uint256 productionAmountUSDC6;
        bytes32 productionReportHash;
        uint256 cashflowAmountUSDC6;
        bytes32 cashflowReportHash;
        bool isOpen;
    }

    function recordProductionReport(
        bytes32 facilityId,
        bytes32 periodId,
        uint256 amountUSDC6,
        bytes32 reportHash
    ) external;

    function recordCashflowReport(
        bytes32 facilityId,
        bytes32 periodId,
        uint256 amountUSDC6,
        bytes32 reportHash
    ) external;

    function openReward(
        bytes32 facilityId,
        bytes32 periodId,
        uint256 amountUSDC6,
        bytes32 claimRoot
    ) external;

    function claim(
        bytes32 facilityId,
        bytes32 periodId,
        uint256 amountUSDC6,
        bytes32[] calldata merkleProof
    ) external;

    function getDistribution(bytes32 facilityId, bytes32 periodId)
        external
        view
        returns (Distribution memory);
}
