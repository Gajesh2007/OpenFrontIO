// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test, console} from "forge-std/Test.sol";
import {WagerPot} from "../src/WagerPot.sol";

contract WagerPotTest is Test {
    WagerPot public wagerPot;
    address public owner;
    address public player1;
    address public player2;
    address public player3;

    function setUp() public {
        owner = address(this);
        wagerPot = new WagerPot();
        player1 = vm.addr(1);
        player2 = vm.addr(2);
        player3 = vm.addr(3);

        vm.deal(player1, 1 ether);
        vm.deal(player2, 1 ether);
        vm.deal(player3, 1 ether);
    }

    function test_CreateWager() public {
        address[] memory players = new address[](2);
        players[0] = player1;
        players[1] = player2;
        wagerPot.createWager("game1", 0.1 ether, players);

        (uint256 buyInAmount,, WagerPot.WagerState state,,,) = wagerPot.getWagerInfo("game1");
        assertEq(buyInAmount, 0.1 ether);
        assertEq(uint8(state), uint8(WagerPot.WagerState.Open));
    }

    function test_FailCreateWagerWithNoPlayers() public {
        address[] memory players = new address[](0);
        vm.expectRevert("Wager requires at least two players.");
        wagerPot.createWager("game1", 0.1 ether, players);
    }

    function test_FailCreateWagerWithZeroBuyIn() public {
        address[] memory players = new address[](2);
        players[0] = player1;
        players[1] = player2;
        vm.expectRevert("Buy-in must be greater than zero.");
        wagerPot.createWager("game1", 0, players);
    }

    function test_JoinWager() public {
        address[] memory players = new address[](2);
        players[0] = player1;
        players[1] = player2;
        wagerPot.createWager("game1", 0.1 ether, players);

        vm.startPrank(player1);
        wagerPot.joinWager{value: 0.1 ether}("game1");
        vm.stopPrank();

        assertTrue(wagerPot.hasPlayerPaid("game1", player1));
        (, uint256 pot, , , , ) = wagerPot.getWagerInfo("game1");
        assertEq(pot, 0.1 ether);
    }

    function test_AllPlayersJoinAndLockWager() public {
        address[] memory players = new address[](2);
        players[0] = player1;
        players[1] = player2;
        wagerPot.createWager("game1", 0.1 ether, players);

        vm.startPrank(player1);
        wagerPot.joinWager{value: 0.1 ether}("game1");
        vm.stopPrank();

        vm.startPrank(player2);
        wagerPot.joinWager{value: 0.1 ether}("game1");
        vm.stopPrank();

        assertEq(uint8(wagerPot.getWagerState("game1")), uint8(WagerPot.WagerState.Locked));
        (, uint256 pot, , , , ) = wagerPot.getWagerInfo("game1");
        assertEq(pot, 0.2 ether);
    }

    function test_ReportWinner() public {
        address[] memory players = new address[](2);
        players[0] = player1;
        players[1] = player2;
        wagerPot.createWager("game1", 0.1 ether, players);

        vm.startPrank(player1);
        wagerPot.joinWager{value: 0.1 ether}("game1");
        vm.stopPrank();

        vm.startPrank(player2);
        wagerPot.joinWager{value: 0.1 ether}("game1");
        vm.stopPrank();

        uint256 player1BalanceBefore = player1.balance;
        wagerPot.reportWinner("game1", player1);

        assertEq(uint8(wagerPot.getWagerState("game1")), uint8(WagerPot.WagerState.Concluded));
        assertEq(player1.balance, player1BalanceBefore + 0.2 ether);
        assertEq(address(wagerPot).balance, 0);
    }

    function test_FailReportWinnerNotOwner() public {
        address[] memory players = new address[](2);
        players[0] = player1;
        players[1] = player2;
        wagerPot.createWager("game1", 0.1 ether, players);

        vm.startPrank(player1);
        wagerPot.joinWager{value: 0.1 ether}("game1");
        vm.stopPrank();

        vm.startPrank(player2);
        wagerPot.joinWager{value: 0.1 ether}("game1");
        vm.expectRevert("Only the owner (server oracle) can perform this action.");
        wagerPot.reportWinner("game1", player1);
        vm.stopPrank();
    }

    function test_CancelWager() public {
        address[] memory players = new address[](2);
        players[0] = player1;
        players[1] = player2;
        wagerPot.createWager("game1", 0.1 ether, players);

        uint256 player1BalanceBefore = player1.balance;
        uint256 player2BalanceBefore = player2.balance;

        vm.startPrank(player1);
        wagerPot.joinWager{value: 0.1 ether}("game1");
        vm.stopPrank();

        wagerPot.cancelWager("game1");

        assertEq(uint8(wagerPot.getWagerState("game1")), uint8(WagerPot.WagerState.Concluded));
        assertEq(player1.balance, player1BalanceBefore);
        assertEq(player2.balance, player2BalanceBefore);
        assertEq(address(wagerPot).balance, 0);
    }
}
