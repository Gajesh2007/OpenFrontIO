// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {WagerPot} from "../src/WagerPot.sol";

contract WagerPotScript is Script {
    WagerPot public wagerPot;

    function setUp() public {}

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        wagerPot = new WagerPot();
        console.log("WagerPot deployed to:", address(wagerPot));
        vm.stopBroadcast();
    }
}
