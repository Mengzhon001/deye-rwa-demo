// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {OracleReportRegistry} from "./OracleReportRegistry.sol";

interface IOracleRevenueVault {
    function phase() external view returns (uint8);
    function receiveRevenue(bytes32 period, uint256 amount, bytes32 evidence) external;
}

/// @notice Monthly USDC payment can only begin with an accepted Oracle report.
contract HouseholdBillingV2 is ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable usdc;
    IOracleRevenueVault public immutable vault;
    OracleReportRegistry public immutable registry;
    address public immutable manager;
    address public immutable exportTreasury;
    struct Bill {
        address payer;
        uint256 householdAmount;
        uint256 exportAmount;
        uint256 assignedAmount;
        uint256 costsAmount;
        bytes32 evidence;
        bool householdPaid;
        bool exportPaid;
        bool confirmed;
        bool refunded;
    }
    mapping(bytes32 => Bill) public bills;
    mapping(bytes32 => bytes32) public reportForBill;
    event BillPublished(bytes32 indexed id, address indexed payer, uint256 householdAmount, uint256 exportAmount, uint256 assignedAmount, uint256 costsAmount, bytes32 evidence, bytes32 indexed reportId);
    event HouseholdPaid(bytes32 indexed id, address indexed payer, uint256 amount);
    event ExportFunded(bytes32 indexed id, address indexed payer, uint256 amount);
    event ReceiptConfirmed(bytes32 indexed id, address indexed reviewer, uint256 assignedAmount, uint256 costsAmount, uint256 retainedByHousehold, bytes32 evidence);
    event EndedBillRefunded(bytes32 indexed id, address indexed payer, uint256 amount);
    constructor(address token, address pool, address intermediary, address treasury, address oracle) {
        require(token != address(0) && pool != address(0) && intermediary != address(0) && treasury != address(0) &&
            intermediary != treasury && oracle != address(0), "invalid billing roles");
        usdc = IERC20(token); vault = IOracleRevenueVault(pool); manager = intermediary;
        exportTreasury = treasury; registry = OracleReportRegistry(oracle);
    }
    modifier onlyManager() { require(msg.sender == manager, "manager required"); _; }
    function publishBill(bytes32 id, bytes32 reportId) external onlyManager {
        require(vault.phase() == 2 && id != bytes32(0) && bills[id].payer == address(0), "invalid or duplicate bill");
        OracleReportRegistry.Report memory r = registry.consume(reportId);
        require(r.billId == id && r.vault == address(vault) && r.billing == address(this) &&
            r.paymentToken == address(usdc), "report does not match bill");
        bills[id] = Bill(r.payer, r.householdAmount, r.exportAmount, r.assignedAmount, r.costsAmount,
            reportId, r.householdAmount == 0, r.exportAmount == 0, false, false);
        reportForBill[id] = reportId;
        emit BillPublished(id, r.payer, r.householdAmount, r.exportAmount, r.assignedAmount, r.costsAmount, reportId, reportId);
    }
    function payBill(bytes32 id) external nonReentrant {
        Bill storage b = bills[id]; require(msg.sender == b.payer, "bill payer required");
        require(vault.phase() == 2 && !b.householdPaid && !b.confirmed && !b.refunded, "bill not payable");
        b.householdPaid = true; usdc.safeTransferFrom(msg.sender, address(this), b.householdAmount);
        emit HouseholdPaid(id, msg.sender, b.householdAmount);
    }
    function fundExport(bytes32 id) external nonReentrant {
        Bill storage b = bills[id]; require(msg.sender == exportTreasury, "export treasury required");
        require(b.payer != address(0) && vault.phase() == 2 && !b.exportPaid && !b.confirmed && !b.refunded, "export not payable");
        b.exportPaid = true; usdc.safeTransferFrom(msg.sender, address(this), b.exportAmount);
        emit ExportFunded(id, msg.sender, b.exportAmount);
    }
    function confirmReceipt(bytes32 id) external onlyManager nonReentrant {
        Bill storage b = bills[id];
        require(b.payer != address(0) && b.householdPaid && b.exportPaid && !b.confirmed && !b.refunded, "payment incomplete or confirmed");
        require(vault.phase() == 2, "product not active"); b.confirmed = true;
        if (b.assignedAmount > 0) { usdc.forceApprove(address(vault), b.assignedAmount); vault.receiveRevenue(id, b.assignedAmount, b.evidence); }
        if (b.costsAmount > 0) usdc.safeTransfer(exportTreasury, b.costsAmount);
        uint256 retained = b.householdAmount + b.exportAmount - b.assignedAmount - b.costsAmount;
        if (retained > 0) usdc.safeTransfer(b.payer, retained);
        emit ReceiptConfirmed(id, msg.sender, b.assignedAmount, b.costsAmount, retained, b.evidence);
    }
    function refundEndedBill(bytes32 id) external nonReentrant {
        Bill storage b = bills[id]; require(msg.sender == b.payer && vault.phase() != 2 && !b.confirmed && !b.refunded, "refund unavailable");
        b.refunded = true;
        uint256 ownerAmount = b.householdPaid ? b.householdAmount : 0;
        if (ownerAmount > 0) usdc.safeTransfer(b.payer, ownerAmount);
        if (b.exportPaid && b.exportAmount > 0) usdc.safeTransfer(exportTreasury, b.exportAmount);
        emit EndedBillRefunded(id, b.payer, ownerAmount);
    }
}
