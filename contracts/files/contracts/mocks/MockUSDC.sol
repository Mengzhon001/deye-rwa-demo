// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract MockUSDC is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    event DemoFundsIssued(address indexed recipient, uint256 amount);

    constructor(address admin) ERC20("Mock USDC", "mUSDC") {
        require(admin != address(0), "admin is zero");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(to != address(0) && amount > 0, "invalid faucet mint");
        _mint(to, amount);
        emit DemoFundsIssued(to, amount);
    }
}
