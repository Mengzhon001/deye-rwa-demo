// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IDeyeRWA} from "./IDeyeRWA.sol";

interface IFunctionsRouter {
    struct FacilityDeploymentInput {
        bytes32 facilityId;
        address admin;
        bytes32 serialHash;
        bytes32 siteHash;
        bytes32 metadataHash;
        uint256 acquisitionCostUSDC6;
        uint256 commissionedAt;
        bool activateOnMint;
    }

    function submitDeployment(FacilityDeploymentInput calldata deployment) external;

    function submitProductionReport(
        bytes32 facilityId,
        bytes32 periodId,
        uint256 amountUSDC6,
        bytes32 reportHash
    ) external;

    function submitCashflowReport(
        bytes32 facilityId,
        bytes32 periodId,
        uint256 amountUSDC6,
        bytes32 reportHash
    ) external;

    function submitLifecycleEvent(
        bytes32 facilityId,
        IDeyeRWA.FacilityStatus status,
        bytes32 eventHash
    ) external;
}
