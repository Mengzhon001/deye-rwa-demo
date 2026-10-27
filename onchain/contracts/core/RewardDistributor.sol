// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IDeyeRWA} from "../interfaces/IDeyeRWA.sol";
import {IRewardDistributor} from "../interfaces/IRewardDistributor.sol";

contract RewardDistributor is IRewardDistributor, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ROUTER_ROLE = keccak256("ROUTER_ROLE");
    bytes32 public constant ENERGY_REVENUE_ROLE = keccak256("ENERGY_REVENUE_ROLE");

    IERC20 public immutable usdc;
    IDeyeRWA public immutable deyeRwa;

    mapping(bytes32 distributionId => Distribution) private _distributions;
    mapping(bytes32 distributionId => bool) public claimed;

    uint256 public totalAllocated;
    uint256 public totalClaimed;

    event ProductionReportRecorded(
        bytes32 indexed facilityId,
        bytes32 indexed periodId,
        uint256 amountUSDC6,
        bytes32 reportHash
    );
    event CashflowReportRecorded(
        bytes32 indexed facilityId,
        bytes32 indexed periodId,
        uint256 amountUSDC6,
        bytes32 reportHash
    );
    event RewardOpened(
        bytes32 indexed facilityId,
        bytes32 indexed periodId,
        uint256 amountUSDC6,
        bytes32 claimRoot
    );
    event RewardClaimed(
        bytes32 indexed facilityId,
        bytes32 indexed periodId,
        address indexed account,
        uint256 amountUSDC6
    );

    constructor(address admin, address usdcToken, address rwaToken) {
        require(admin != address(0), "admin is zero");
        require(usdcToken != address(0), "usdc is zero");
        require(rwaToken != address(0), "rwa is zero");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ROUTER_ROLE, admin);
        _grantRole(ENERGY_REVENUE_ROLE, admin);
        usdc = IERC20(usdcToken);
        deyeRwa = IDeyeRWA(rwaToken);
    }

    function recordProductionReport(
        bytes32 facilityId,
        bytes32 periodId,
        uint256 amountUSDC6,
        bytes32 reportHash
    ) external onlyRole(ROUTER_ROLE) whenNotPaused {
        require(facilityId != bytes32(0), "facility is zero");
        require(periodId != bytes32(0), "period is zero");
        require(amountUSDC6 > 0, "amount is zero");
        require(reportHash != bytes32(0), "hash is zero");

        Distribution storage dist = _distributions[_distributionKey(facilityId, periodId)];
        require(dist.productionReportHash == bytes32(0), "production already recorded");

        dist.productionAmountUSDC6 = amountUSDC6;
        dist.productionReportHash = reportHash;

        emit ProductionReportRecorded(facilityId, periodId, amountUSDC6, reportHash);
    }

    function recordCashflowReport(
        bytes32 facilityId,
        bytes32 periodId,
        uint256 amountUSDC6,
        bytes32 reportHash
    ) external onlyRole(ROUTER_ROLE) whenNotPaused {
        require(facilityId != bytes32(0), "facility is zero");
        require(periodId != bytes32(0), "period is zero");
        require(amountUSDC6 > 0, "amount is zero");
        require(reportHash != bytes32(0), "hash is zero");

        Distribution storage dist = _distributions[_distributionKey(facilityId, periodId)];
        require(dist.cashflowReportHash == bytes32(0), "cashflow already recorded");

        dist.cashflowAmountUSDC6 = amountUSDC6;
        dist.cashflowReportHash = reportHash;

        emit CashflowReportRecorded(facilityId, periodId, amountUSDC6, reportHash);
    }

    function openReward(
        bytes32 facilityId,
        bytes32 periodId,
        uint256 amountUSDC6,
        bytes32 claimRoot
    ) external onlyRole(ENERGY_REVENUE_ROLE) whenNotPaused {
        require(amountUSDC6 > 0, "amount is zero");
        require(claimRoot != bytes32(0), "claim root is zero");

        bytes32 distributionId = _distributionKey(facilityId, periodId);
        Distribution storage dist = _distributions[distributionId];
        require(!dist.isOpen, "reward already open");
        require(dist.productionReportHash != bytes32(0), "production missing");
        require(dist.cashflowReportHash != bytes32(0), "cashflow missing");
        require(dist.productionAmountUSDC6 == amountUSDC6, "production mismatch");
        require(dist.cashflowAmountUSDC6 == amountUSDC6, "cashflow mismatch");
        require(deyeRwa.isRewardEligible(facilityId), "facility not eligible");

        uint256 requiredBalance = (totalAllocated - totalClaimed) + amountUSDC6;
        require(usdc.balanceOf(address(this)) >= requiredBalance, "insufficient prefunding");

        dist.claimRoot = claimRoot;
        dist.totalReward = amountUSDC6;
        dist.isOpen = true;
        totalAllocated += amountUSDC6;

        emit RewardOpened(facilityId, periodId, amountUSDC6, claimRoot);
    }

    function claim(
        bytes32 facilityId,
        bytes32 periodId,
        uint256 amountUSDC6,
        bytes32[] calldata merkleProof
    ) external whenNotPaused nonReentrant {
        bytes32 distributionId = _distributionKey(facilityId, periodId);
        require(!claimed[distributionId], "already claimed");

        Distribution storage dist = _distributions[distributionId];
        require(dist.isOpen, "reward not open");
        require(deyeRwa.ownerOfFacility(facilityId) == msg.sender, "not current holder");

        bytes32 leaf = keccak256(abi.encode(periodId, facilityId, amountUSDC6));
        require(MerkleProof.verify(merkleProof, dist.claimRoot, leaf), "invalid proof");
        require(dist.claimedReward + amountUSDC6 <= dist.totalReward, "reward over-claimed");

        claimed[distributionId] = true;
        dist.claimedReward += amountUSDC6;
        totalClaimed += amountUSDC6;

        usdc.safeTransfer(msg.sender, amountUSDC6);
        emit RewardClaimed(facilityId, periodId, msg.sender, amountUSDC6);
    }

    function getDistribution(bytes32 facilityId, bytes32 periodId)
        external
        view
        returns (Distribution memory)
    {
        return _distributions[_distributionKey(facilityId, periodId)];
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function _distributionKey(bytes32 facilityId, bytes32 periodId) private pure returns (bytes32) {
        return keccak256(abi.encode(facilityId, periodId));
    }
}
