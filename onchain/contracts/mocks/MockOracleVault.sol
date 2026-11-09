// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockOracleVault {
    using SafeERC20 for IERC20;
    IERC20 public immutable usdc;
    uint8 public phase = 2;
    uint256 public feeMonths;
    uint256 public nextFeeAt;
    mapping(bytes32 => bool) public receiptUsed;
    event RevenueReceived(bytes32 indexed period, bytes32 evidence, uint256 amount);
    constructor(address token) { usdc = IERC20(token); }
    function setState(uint8 phase_, uint256 months_, uint256 next_) external {
        phase = phase_; feeMonths = months_; nextFeeAt = next_;
    }
    function receiveRevenue(bytes32 period, uint256 amount, bytes32 evidence) external {
        require(!receiptUsed[period], "receipt used");
        receiptUsed[period] = true;
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit RevenueReceived(period, evidence, amount);
    }
}
