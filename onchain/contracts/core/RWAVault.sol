// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IRWAVault} from "../interfaces/IRWAVault.sol";
import {IDeyeRWA} from "../interfaces/IDeyeRWA.sol";
import {IRewardDistributor} from "../interfaces/IRewardDistributor.sol";

contract RWAVault is IRWAVault, ERC20, ERC721Holder, AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant DEPOSITOR_ROLE = keccak256("DEPOSITOR_ROLE");

    IDeyeRWA public immutable rwaToken;
    IRewardDistributor public immutable rewardDistributor;
    IERC20 public immutable usdc;

    mapping(bytes32 facilityId => bool) public isBackedFacility;
    mapping(bytes32 facilityId => uint256) public facilityBookValueUSDC6;
    mapping(bytes32 accrualKey => uint256 amountUSDC6) public accrualByDistribution;

    bytes32[] private _backingFacilities;
    uint256 public totalBackedValueUSDC6;
    uint256 public totalAccruedRewardsUSDC6;

    event FacilityDeposited(
        bytes32 indexed facilityId,
        address indexed depositor,
        address indexed receiver,
        uint256 bookValueUSDC6,
        uint256 mintedShares
    );
    event RewardAccrued(
        bytes32 indexed facilityId,
        bytes32 indexed periodId,
        uint256 amountUSDC6,
        uint256 totalAccruedRewardsUSDC6
    );

    constructor(address admin, address rwaTokenAddress, address rewardDistributorAddress, address usdcToken)
        ERC20("Deye Digital Bond", "DBOND")
    {
        require(admin != address(0), "admin is zero");
        require(rwaTokenAddress != address(0), "rwa token is zero");
        require(rewardDistributorAddress != address(0), "reward distributor is zero");
        require(usdcToken != address(0), "usdc is zero");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(DEPOSITOR_ROLE, admin);

        rwaToken = IDeyeRWA(rwaTokenAddress);
        rewardDistributor = IRewardDistributor(rewardDistributorAddress);
        usdc = IERC20(usdcToken);
    }

    function depositFacility(bytes32 facilityId, address receiver)
        external
        onlyRole(DEPOSITOR_ROLE)
        whenNotPaused
        returns (uint256 mintedShares)
    {
        require(receiver != address(0), "receiver is zero");
        require(!isBackedFacility[facilityId], "facility already backed");

        IDeyeRWA.Facility memory facility = rwaToken.getFacility(facilityId);
        require(facility.exists, "facility not found");
        require(facility.status == IDeyeRWA.FacilityStatus.ACTIVE, "facility not active");
        require(rwaToken.ownerOfFacility(facilityId) == msg.sender, "not current facility holder");

        uint256 bookValueUSDC6 = facility.acquisitionCostUSDC6;
        require(bookValueUSDC6 > 0, "book value is zero");

        mintedShares = _previewSharesForValue(bookValueUSDC6);
        require(mintedShares > 0, "minted shares are zero");

        rwaToken.safeTransferFrom(msg.sender, address(this), rwaToken.facilityTokenId(facilityId));

        isBackedFacility[facilityId] = true;
        facilityBookValueUSDC6[facilityId] = bookValueUSDC6;
        _backingFacilities.push(facilityId);
        totalBackedValueUSDC6 += bookValueUSDC6;

        _mint(receiver, mintedShares);

        emit FacilityDeposited(facilityId, msg.sender, receiver, bookValueUSDC6, mintedShares);
    }

    function claimReward(
        bytes32 facilityId,
        bytes32 periodId,
        uint256 amountUSDC6,
        bytes32[] calldata merkleProof
    ) external whenNotPaused nonReentrant {
        require(isBackedFacility[facilityId], "facility not backed");
        require(rwaToken.ownerOfFacility(facilityId) == address(this), "vault is not holder");

        uint256 balanceBefore = usdc.balanceOf(address(this));
        rewardDistributor.claim(facilityId, periodId, amountUSDC6, merkleProof);
        uint256 receivedAmount = usdc.balanceOf(address(this)) - balanceBefore;

        require(receivedAmount == amountUSDC6, "unexpected reward amount");

        totalAccruedRewardsUSDC6 += receivedAmount;
        accrualByDistribution[_distributionKey(facilityId, periodId)] += receivedAmount;

        emit RewardAccrued(facilityId, periodId, receivedAmount, totalAccruedRewardsUSDC6);
    }

    function navPerShare() external view returns (uint256) {
        uint256 shareSupply = totalSupply();
        if (shareSupply == 0) {
            return 0;
        }
        return (totalAssetsUSDC6() * 1e18) / shareSupply;
    }

    function totalAssetsUSDC6() public view returns (uint256) {
        return totalBackedValueUSDC6 + totalAccruedRewardsUSDC6;
    }

    function backingFacilityCount() external view returns (uint256) {
        return _backingFacilities.length;
    }

    function backingFacilityAt(uint256 index) external view returns (bytes32) {
        return _backingFacilities[index];
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl)
        returns (bool)
    {
        return interfaceId == type(IRWAVault).interfaceId || super.supportsInterface(interfaceId);
    }

    function _previewSharesForValue(uint256 bookValueUSDC6) private view returns (uint256) {
        uint256 shareSupply = totalSupply();
        uint256 totalAssets = totalAssetsUSDC6();

        if (shareSupply == 0 || totalAssets == 0) {
            return bookValueUSDC6 * 1e12;
        }

        return (bookValueUSDC6 * shareSupply) / totalAssets;
    }

    function _distributionKey(bytes32 facilityId, bytes32 periodId) private pure returns (bytes32) {
        return keccak256(abi.encode(facilityId, periodId));
    }
}
