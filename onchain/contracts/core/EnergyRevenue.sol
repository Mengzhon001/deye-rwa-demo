// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IEnergyRevenue} from "../interfaces/IEnergyRevenue.sol";
import {IRewardDistributor} from "../interfaces/IRewardDistributor.sol";

contract EnergyRevenue is IEnergyRevenue, AccessControl, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");

    IERC20 public immutable usdc;
    address public rewardDistributor;

    mapping(bytes32 revenueKey => RevenueRecord) private _revenueRecords;

    event RewardDistributorSet(address indexed rewardDistributor);
    event RevenueDeposited(
        bytes32 indexed facilityId,
        bytes32 indexed periodId,
        uint256 amountUSDC6,
        bytes32 settlementRef
    );
    event RewardFunded(
        bytes32 indexed facilityId,
        bytes32 indexed periodId,
        uint256 amountUSDC6,
        bytes32 claimRoot
    );

    constructor(address admin, address treasury, address usdcToken) {
        require(admin != address(0), "admin is zero");
        require(treasury != address(0), "treasury is zero");
        require(usdcToken != address(0), "usdc is zero");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(TREASURY_ROLE, admin);
        _grantRole(TREASURY_ROLE, treasury);
        usdc = IERC20(usdcToken);
    }

    function setRewardDistributor(address distributor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(distributor != address(0), "distributor is zero");
        rewardDistributor = distributor;
        emit RewardDistributorSet(distributor);
    }

    function depositRevenue(
        bytes32 facilityId,
        bytes32 periodId,
        uint256 amountUSDC6,
        bytes32 settlementRef
    ) external onlyRole(TREASURY_ROLE) whenNotPaused {
        require(facilityId != bytes32(0), "facility is zero");
        require(periodId != bytes32(0), "period is zero");
        require(amountUSDC6 > 0, "amount is zero");
        require(settlementRef != bytes32(0), "settlement is zero");

        bytes32 revenueKey = _revenueKey(facilityId, periodId);
        RevenueRecord storage record = _revenueRecords[revenueKey];
        require(!record.exists, "revenue already recorded");

        usdc.safeTransferFrom(msg.sender, address(this), amountUSDC6);
        _revenueRecords[revenueKey] = RevenueRecord({
            inflowUSDC6: amountUSDC6,
            fundedUSDC6: 0,
            settlementRef: settlementRef,
            exists: true
        });

        emit RevenueDeposited(facilityId, periodId, amountUSDC6, settlementRef);
    }

    function fundReward(
        bytes32 facilityId,
        bytes32 periodId,
        uint256 amountUSDC6,
        bytes32 claimRoot
    ) external onlyRole(TREASURY_ROLE) whenNotPaused {
        require(rewardDistributor != address(0), "distributor not set");
        require(amountUSDC6 > 0, "amount is zero");

        bytes32 revenueKey = _revenueKey(facilityId, periodId);
        RevenueRecord storage record = _revenueRecords[revenueKey];
        require(record.exists, "revenue not found");
        require(record.fundedUSDC6 + amountUSDC6 <= record.inflowUSDC6, "insufficient inflow");

        record.fundedUSDC6 += amountUSDC6;
        usdc.safeTransfer(rewardDistributor, amountUSDC6);
        IRewardDistributor(rewardDistributor).openReward(facilityId, periodId, amountUSDC6, claimRoot);

        emit RewardFunded(facilityId, periodId, amountUSDC6, claimRoot);
    }

    function getRevenueRecord(bytes32 facilityId, bytes32 periodId)
        external
        view
        returns (RevenueRecord memory)
    {
        return _revenueRecords[_revenueKey(facilityId, periodId)];
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function _revenueKey(bytes32 facilityId, bytes32 periodId) private pure returns (bytes32) {
        return keccak256(abi.encode(facilityId, periodId));
    }
}
