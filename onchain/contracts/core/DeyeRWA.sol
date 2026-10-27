// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IDeyeRWA} from "../interfaces/IDeyeRWA.sol";

contract DeyeRWA is IDeyeRWA, ERC721, AccessControl, Pausable {
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant STATUS_ADMIN_ROLE = keccak256("STATUS_ADMIN_ROLE");

    mapping(bytes32 facilityId => Facility) private _facilities;

    event FacilityMinted(bytes32 indexed facilityId, uint256 indexed tokenId, address indexed admin);
    event FacilityStatusChanged(bytes32 indexed facilityId, FacilityStatus oldStatus, FacilityStatus newStatus);

    constructor(address admin) ERC721("Deye Facility RWA", "DRWA") {
        require(admin != address(0), "admin is zero");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ISSUER_ROLE, admin);
        _grantRole(STATUS_ADMIN_ROLE, admin);
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
    ) external onlyRole(ISSUER_ROLE) whenNotPaused {
        require(facilityId != bytes32(0), "facility is zero");
        require(admin != address(0), "holder is zero");
        require(metadataHash != bytes32(0), "metadata is zero");
        require(!_facilities[facilityId].exists, "facility already exists");

        FacilityStatus status = activateOnMint ? FacilityStatus.ACTIVE : FacilityStatus.PENDING;
        uint256 tokenId = facilityTokenId(facilityId);

        _facilities[facilityId] = Facility({
            admin: admin,
            serialHash: serialHash,
            siteHash: siteHash,
            metadataHash: metadataHash,
            acquisitionCostUSDC6: acquisitionCostUSDC6,
            commissionedAt: commissionedAt,
            status: status,
            exists: true
        });

        _safeMint(admin, tokenId);

        emit FacilityMinted(facilityId, tokenId, admin);
        emit FacilityStatusChanged(facilityId, status, status);
    }

    function setFacilityStatus(bytes32 facilityId, FacilityStatus status)
        external
        onlyRole(STATUS_ADMIN_ROLE)
        whenNotPaused
    {
        Facility storage facility = _facilities[facilityId];
        require(facility.exists, "facility not found");

        FacilityStatus oldStatus = facility.status;
        facility.status = status;

        emit FacilityStatusChanged(facilityId, oldStatus, status);
    }

    function isRewardEligible(bytes32 facilityId) external view returns (bool) {
        Facility memory facility = _facilities[facilityId];
        return facility.exists && facility.status == FacilityStatus.ACTIVE;
    }

    function ownerOfFacility(bytes32 facilityId) external view returns (address) {
        Facility memory facility = _facilities[facilityId];
        require(facility.exists, "facility not found");
        return ownerOf(facilityTokenId(facilityId));
    }

    function getFacility(bytes32 facilityId) external view returns (Facility memory) {
        return _facilities[facilityId];
    }

    function facilityTokenId(bytes32 facilityId) public pure returns (uint256) {
        return uint256(facilityId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl, IERC165)
        returns (bool)
    {
        return interfaceId == type(IDeyeRWA).interfaceId || super.supportsInterface(interfaceId);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
