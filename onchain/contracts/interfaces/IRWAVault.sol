// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRWAVault {
    function depositFacility(bytes32 facilityId, address receiver) external returns (uint256 mintedShares);

    function claimReward(
        bytes32 facilityId,
        bytes32 periodId,
        uint256 amountUSDC6,
        bytes32[] calldata merkleProof
    ) external;

    function navPerShare() external view returns (uint256);

    function totalAssetsUSDC6() external view returns (uint256);

    function backingFacilityCount() external view returns (uint256);
}
