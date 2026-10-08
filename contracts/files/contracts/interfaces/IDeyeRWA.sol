// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IDeyeRWA is IERC721 {
    enum FacilityStatus {
        PENDING,
        ACTIVE,
        RETIRED
    }

    struct Facility {
        address admin;
        bytes32 serialHash;
        bytes32 siteHash;
        bytes32 metadataHash;
        uint256 acquisitionCostUSDC6;
        uint256 commissionedAt;
        FacilityStatus status;
        bool exists;
    }

    function mintFacility(
        bytes32 facilityId,
        address admin,
        bytes32 serialHash,
        bytes32 siteHash,
        bytes32 metadataHash,
        uint256 acquisitionCostUSDC6,
        uint256 commissionedAt,
        bool activateOnMint
    ) external;

    function setFacilityStatus(bytes32 facilityId, FacilityStatus status) external;

    function isRewardEligible(bytes32 facilityId) external view returns (bool);

    function ownerOfFacility(bytes32 facilityId) external view returns (address);

    function getFacility(bytes32 facilityId) external view returns (Facility memory);

    function facilityTokenId(bytes32 facilityId) external pure returns (uint256);
}
