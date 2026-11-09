// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

interface IOracleVault {
    function phase() external view returns (uint8);
    function feeMonths() external view returns (uint256);
    function nextFeeAt() external view returns (uint256);
}

/// @notice One isolated Base Sepolia product's self-hosted, signed monthly observations.
/// @dev A report proves authorization by our reporter, not a signature by Deye or Chainlink.
contract OracleReportRegistry is AccessControl, EIP712 {
    bytes32 public constant TRUSTEE_ROLE = keccak256("ORACLE_TRUSTEE_ROLE");
    bytes32 public constant REPORT_TYPEHASH = keccak256(
        "Report(uint8 purpose,uint32 observationMonth,uint16 servicePeriod,uint32 revision,uint64 issuedAt,uint64 validUntil,uint64 observationEndUtc,uint64 signerEpoch,address vault,address billing,address paymentToken,address payer,bytes32 stationKey,bytes32 billId,bytes32 sourceKind,bytes32 sourceDigest,bytes32 inputDigest,bytes32 paramsHash,uint256 householdAmount,uint256 exportAmount,uint256 costsAmount,uint256 assignedAmount)"
    );
    bytes32 public constant DEYE_API_DIRECT = keccak256("deye-api-direct");
    uint8 public constant VALIDATION_ONLY = 0;
    uint8 public constant BILLABLE = 1;

    struct Report {
        uint8 purpose;
        uint32 observationMonth; // YYYYMM in the station's local calendar.
        uint16 servicePeriod;
        uint32 revision;
        uint64 issuedAt;
        uint64 validUntil;
        uint64 observationEndUtc;
        uint64 signerEpoch;
        address vault;
        address billing;
        address paymentToken;
        address payer;
        bytes32 stationKey;
        bytes32 billId;
        bytes32 sourceKind;
        bytes32 sourceDigest;
        bytes32 inputDigest;
        bytes32 paramsHash;
        uint256 householdAmount;
        uint256 exportAmount;
        uint256 costsAmount;
        uint256 assignedAmount;
    }
    struct StoredReport { Report data; address signer; bool exists; bool revoked; bool consumed; }
    struct Policy { bytes32 stationKey; bytes32 paramsHash; uint32 firstMonth; }

    IOracleVault public immutable vault;
    address public immutable paymentToken;
    address public billing;
    address public reporter;
    uint64 public signerEpoch = 1;
    mapping(bytes32 => StoredReport) private stored;
    mapping(bytes32 => Policy) public policies;
    mapping(bytes32 => bytes32) public activePolicy;
    mapping(bytes32 => mapping(address => bool)) public policyVotes;
    mapping(bytes32 => uint8) public policyVoteCount;
    mapping(bytes32 => mapping(address => bool)) public revocationVotes;
    mapping(bytes32 => uint8) public revocationVoteCount;
    mapping(bytes32 => bytes32) public latestBillable;
    mapping(bytes32 => uint32) public latestRevision;

    event BillingBound(address indexed billing);
    event ReporterRotated(address indexed previousReporter, address indexed reporter, uint64 epoch);
    event PolicyApproved(bytes32 indexed policyHash, bytes32 indexed stationKey, address indexed trustee, bool active);
    event ReportRegistered(bytes32 indexed reportId, bytes32 indexed stationKey, uint32 observationMonth, uint16 servicePeriod, uint8 purpose, address signer);
    event ReportRevoked(bytes32 indexed reportId);
    event ReportConsumed(bytes32 indexed reportId, bytes32 indexed billId);

    constructor(address admin, address trusteeA, address trusteeB, address reporter_, address vault_, address token_)
        EIP712("Deye Oracle Report", "1")
    {
        require(admin != address(0) && trusteeA != address(0) && trusteeB != address(0) &&
            trusteeA != trusteeB && reporter_ != address(0) && vault_ != address(0) && token_ != address(0), "invalid roles");
        require(reporter_ != admin && reporter_ != trusteeA && reporter_ != trusteeB, "independent reporter required");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(TRUSTEE_ROLE, trusteeA);
        _grantRole(TRUSTEE_ROLE, trusteeB);
        reporter = reporter_;
        vault = IOracleVault(vault_);
        paymentToken = token_;
    }

    function bindBilling(address billing_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(billing == address(0) && billing_ != address(0), "billing already bound");
        billing = billing_;
        emit BillingBound(billing_);
    }
    function rotateReporter(address next) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(next != address(0) && next != reporter && !hasRole(TRUSTEE_ROLE, next) && !hasRole(DEFAULT_ADMIN_ROLE, next), "invalid reporter");
        address previous = reporter;
        reporter = next;
        ++signerEpoch;
        emit ReporterRotated(previous, next, signerEpoch);
    }
    function policyHash(bytes32 stationKey, bytes32 paramsHash, uint32 firstMonth) public pure returns (bytes32) {
        require(stationKey != bytes32(0) && paramsHash != bytes32(0) && validMonth(firstMonth), "invalid policy");
        return keccak256(abi.encode(stationKey, paramsHash, firstMonth));
    }
    function approvePolicy(bytes32 stationKey, bytes32 paramsHash, uint32 firstMonth) external onlyRole(TRUSTEE_ROLE) {
        bytes32 id = policyHash(stationKey, paramsHash, firstMonth);
        require(!policyVotes[id][msg.sender], "already approved");
        policyVotes[id][msg.sender] = true;
        policies[id] = Policy(stationKey, paramsHash, firstMonth);
        bool active = ++policyVoteCount[id] == 2;
        if (active) activePolicy[stationKey] = id;
        emit PolicyApproved(id, stationKey, msg.sender, active);
    }

    function validMonth(uint32 month) public pure returns (bool) {
        return month / 100 >= 2020 && month / 100 <= 2100 && month % 100 >= 1 && month % 100 <= 12;
    }
    function addMonths(uint32 month, uint256 elapsed) public pure returns (uint32) {
        require(validMonth(month) && elapsed <= 360, "invalid month");
        uint256 start = uint256(month / 100) * 12 + (month % 100) - 1 + elapsed;
        return uint32((start / 12) * 100 + (start % 12) + 1);
    }
    function periodKey(Report memory r) public pure returns (bytes32) {
        return keccak256(abi.encode(r.vault, r.stationKey, r.servicePeriod));
    }
    function digest(Report calldata r) public view returns (bytes32) {
        // All Report fields are static ABI types, so encoding the tuple yields
        // exactly the concatenated 32-byte fields specified by EIP-712.
        return _hashTypedDataV4(keccak256(abi.encodePacked(REPORT_TYPEHASH, abi.encode(r))));
    }
    function registerReport(Report calldata r, bytes calldata signature) external returns (bytes32 id) {
        require(billing != address(0) && r.vault == address(vault) && r.billing == billing && r.paymentToken == paymentToken, "wrong product");
        require((r.purpose == VALIDATION_ONLY || r.purpose == BILLABLE) && validMonth(r.observationMonth), "invalid purpose or month");
        require(r.stationKey != bytes32(0) && r.billId != bytes32(0) && r.sourceKind == DEYE_API_DIRECT && r.sourceDigest != bytes32(0) &&
            r.inputDigest != bytes32(0) && r.paramsHash != bytes32(0) && r.payer != address(0), "missing report field");
        require(r.issuedAt <= block.timestamp && r.validUntil > block.timestamp &&
            r.validUntil <= r.issuedAt + 45 days && r.observationEndUtc <= block.timestamp &&
            r.signerEpoch == signerEpoch, "stale report");
        require(r.assignedAmount + r.costsAmount <= r.householdAmount + r.exportAmount, "unfunded allocation");
        id = digest(r);
        require(ECDSA.recover(id, signature) == reporter, "invalid reporter signature");
        require(!stored[id].exists, "report already registered");
        if (r.purpose == BILLABLE) {
            require(r.servicePeriod > 0 && r.servicePeriod <= 60, "invalid service period");
            bytes32 active = activePolicy[r.stationKey];
            require(active != bytes32(0) && policies[active].paramsHash == r.paramsHash &&
                r.observationMonth == addMonths(policies[active].firstMonth, r.servicePeriod - 1), "unapproved period or parameters");
            require(vault.phase() == 2 && r.servicePeriod == vault.feeMonths() + 1 &&
                block.timestamp >= vault.nextFeeAt(), "service period not complete");
            bytes32 key = periodKey(r);
            bytes32 previous = latestBillable[key];
            require(previous == bytes32(0) || stored[previous].revoked, "previous revision still active");
            require(r.revision == latestRevision[key] + 1, "invalid revision");
            latestRevision[key] = r.revision;
            latestBillable[key] = id;
        }
        stored[id] = StoredReport(r, reporter, true, false, false);
        emit ReportRegistered(id, r.stationKey, r.observationMonth, r.servicePeriod, r.purpose, reporter);
    }
    function approveRevocation(bytes32 id) external onlyRole(TRUSTEE_ROLE) {
        StoredReport storage s = stored[id];
        require(s.exists && !s.revoked && !s.consumed && !revocationVotes[id][msg.sender], "revocation unavailable");
        revocationVotes[id][msg.sender] = true;
        if (++revocationVoteCount[id] == 2) { s.revoked = true; emit ReportRevoked(id); }
    }
    function consume(bytes32 id) external returns (Report memory r) {
        require(msg.sender == billing, "billing required");
        StoredReport storage s = stored[id];
        require(s.exists && !s.revoked && !s.consumed && s.data.purpose == BILLABLE &&
            s.data.signerEpoch == signerEpoch && s.data.validUntil > block.timestamp, "report unavailable");
        r = s.data;
        require(latestBillable[periodKey(r)] == id && activePolicy[r.stationKey] == policyHash(r.stationKey, r.paramsHash,
            policies[activePolicy[r.stationKey]].firstMonth), "report superseded");
        require(vault.phase() == 2 && r.servicePeriod == vault.feeMonths() + 1 &&
            block.timestamp >= vault.nextFeeAt(), "service period not complete");
        s.consumed = true;
        emit ReportConsumed(id, r.billId);
    }
    function getReport(bytes32 id) external view returns (Report memory report, address signer, bool exists, bool revoked, bool consumed) {
        StoredReport storage s = stored[id];
        return (s.data, s.signer, s.exists, s.revoked, s.consumed);
    }
}
