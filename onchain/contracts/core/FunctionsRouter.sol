// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IDeyeRWA} from "../interfaces/IDeyeRWA.sol";
import {IFunctionsRouter} from "../interfaces/IFunctionsRouter.sol";
import {IRewardDistributor} from "../interfaces/IRewardDistributor.sol";

contract FunctionsRouter is IFunctionsRouter, AccessControl, Pausable {
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    struct ReportRecord {
        uint256 amountUSDC6;
        bytes32 reportHash;
        bool exists;
    }

    struct LifecycleRecord {
        IDeyeRWA.FacilityStatus status;
        bytes32 eventHash;
        bool exists;
    }

    IDeyeRWA public immutable deyeRwa;
    IRewardDistributor public immutable rewardDistributor;

    mapping(bytes32 facilityId => bytes32) public deploymentHashes;
    mapping(bytes32 reportKey => ReportRecord) public productionReports;
    mapping(bytes32 reportKey => ReportRecord) public cashflowReports;
    mapping(bytes32 facilityId => LifecycleRecord) public latestLifecycleEvent;

    event FacilityDeploymentSubmitted(bytes32 indexed facilityId, address indexed admin, bytes32 deploymentHash);
    event ProductionReportSubmitted(
        bytes32 indexed facilityId,
        bytes32 indexed periodId,
        uint256 amountUSDC6,
        bytes32 reportHash
    );
    event CashflowReportSubmitted(
        bytes32 indexed facilityId,
        bytes32 indexed periodId,
        uint256 amountUSDC6,
        bytes32 reportHash
    );
    event LifecycleEventSubmitted(
        bytes32 indexed facilityId,
        IDeyeRWA.FacilityStatus status,
        bytes32 eventHash
    );

    constructor(address admin, address oracle, address rwaToken, address distributor) {
        require(admin != address(0), "admin is zero");
        require(oracle != address(0), "oracle is zero");
        require(rwaToken != address(0), "rwa is zero");
        require(distributor != address(0), "distributor is zero");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ORACLE_ROLE, admin);
        _grantRole(ORACLE_ROLE, oracle);
        deyeRwa = IDeyeRWA(rwaToken);
        rewardDistributor = IRewardDistributor(distributor);
    }

    function submitDeployment(FacilityDeploymentInput calldata deployment)
        external
        onlyRole(ORACLE_ROLE)
        whenNotPaused
    {
        require(deployment.facilityId != bytes32(0), "facility is zero");
        require(deployment.admin != address(0), "holder is zero");
        require(deployment.metadataHash != bytes32(0), "metadata is zero");
        require(deploymentHashes[deployment.facilityId] == bytes32(0), "deployment already submitted");

        deyeRwa.mintFacility(
            deployment.facilityId,
            deployment.admin,
            deployment.serialHash,
            deployment.siteHash,
            deployment.metadataHash,
            deployment.acquisitionCostUSDC6,
            deployment.commissionedAt,
            deployment.activateOnMint
        );

        bytes32 deploymentHash = keccak256(
            abi.encode(
                deployment.facilityId,
                deployment.admin,
                deployment.serialHash,
                deployment.siteHash,
                deployment.metadataHash,
                deployment.acquisitionCostUSDC6,
                deployment.commissionedAt,
                deployment.activateOnMint
            )
        );
        deploymentHashes[deployment.facilityId] = deploymentHash;

        emit FacilityDeploymentSubmitted(deployment.facilityId, deployment.admin, deploymentHash);
    }

    function submitProductionReport(
        bytes32 facilityId,
        bytes32 periodId,
        uint256 amountUSDC6,
        bytes32 reportHash
    ) external onlyRole(ORACLE_ROLE) whenNotPaused {
        require(reportHash != bytes32(0), "hash is zero");

        bytes32 reportKey = _reportKey(facilityId, periodId);
        require(!productionReports[reportKey].exists, "production already submitted");

        productionReports[reportKey] = ReportRecord({
            amountUSDC6: amountUSDC6,
            reportHash: reportHash,
            exists: true
        });

        rewardDistributor.recordProductionReport(facilityId, periodId, amountUSDC6, reportHash);
        emit ProductionReportSubmitted(facilityId, periodId, amountUSDC6, reportHash);
    }

    function submitCashflowReport(
        bytes32 facilityId,
        bytes32 periodId,
        uint256 amountUSDC6,
        bytes32 reportHash
    ) external onlyRole(ORACLE_ROLE) whenNotPaused {
        require(reportHash != bytes32(0), "hash is zero");

        bytes32 reportKey = _reportKey(facilityId, periodId);
        require(!cashflowReports[reportKey].exists, "cashflow already submitted");

        cashflowReports[reportKey] = ReportRecord({
            amountUSDC6: amountUSDC6,
            reportHash: reportHash,
            exists: true
        });

        rewardDistributor.recordCashflowReport(facilityId, periodId, amountUSDC6, reportHash);
        emit CashflowReportSubmitted(facilityId, periodId, amountUSDC6, reportHash);
    }

    function submitLifecycleEvent(
        bytes32 facilityId,
        IDeyeRWA.FacilityStatus status,
        bytes32 eventHash
    ) external onlyRole(ORACLE_ROLE) whenNotPaused {
        require(eventHash != bytes32(0), "hash is zero");

        deyeRwa.setFacilityStatus(facilityId, status);
        latestLifecycleEvent[facilityId] = LifecycleRecord({
            status: status,
            eventHash: eventHash,
            exists: true
        });

        emit LifecycleEventSubmitted(facilityId, status, eventHash);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function _reportKey(bytes32 facilityId, bytes32 periodId) private pure returns (bytes32) {
        return keccak256(abi.encode(facilityId, periodId));
    }
}
