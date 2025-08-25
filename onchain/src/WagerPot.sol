// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract WagerPot {
    address public owner; // The server's oracle address

    enum WagerState { Open, Locked, Concluded }

    struct Wager {
        string gameId;
        uint256 buyInAmount;
        uint256 amountCollected; // Tracks ETH collected for this wager only
        WagerState state;
        address[] players;
        mapping(address => bool) hasPaid;
        address winner;
    }

    mapping(string => Wager) public wagers;

    event WagerCreated(string gameId, uint256 buyInAmount, address[] players);
    event PlayerJoined(string gameId, address player);
    event WagerConcluded(string gameId, address winner, uint256 amount);
    event WagerCancelled(string gameId);

    constructor() {
        owner = msg.sender; // Deployer is the server's oracle wallet
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only the owner (server oracle) can perform this action.");
        _;
    }

    function createWager(string memory _gameId, uint256 _buyInAmount, address[] memory _players) public onlyOwner {
        require(wagers[_gameId].buyInAmount == 0, "Wager for this gameId already exists.");
        require(_buyInAmount > 0, "Buy-in must be greater than zero.");
        require(_players.length > 1, "Wager requires at least two players.");

        // This is expensive, but necessary for security to prevent duplicate players.
        for (uint i = 0; i < _players.length; i++) {
            for (uint j = i + 1; j < _players.length; j++) {
                require(_players[i] != _players[j], "Duplicate players are not allowed.");
            }
        }

        wagers[_gameId].gameId = _gameId;
        wagers[_gameId].buyInAmount = _buyInAmount;
        wagers[_gameId].state = WagerState.Open;
        wagers[_gameId].players = _players;
        wagers[_gameId].amountCollected = 0;

        emit WagerCreated(_gameId, _buyInAmount, _players);
    }

    function joinWager(string memory _gameId) public payable {
        Wager storage wager = wagers[_gameId];
        require(wager.state == WagerState.Open, "Wager is not open for joining.");
        require(msg.value == wager.buyInAmount, "Incorrect buy-in amount.");

        bool isPlayerInGame = false;
        for (uint i = 0; i < wager.players.length; i++) {
            if (wager.players[i] == msg.sender) {
                isPlayerInGame = true;
                break;
            }
        }
        require(isPlayerInGame, "You are not a registered player for this game.");
        require(!wager.hasPaid[msg.sender], "You have already paid the buy-in.");

        wager.hasPaid[msg.sender] = true;
        // Account only for this game's pot
        unchecked { wager.amountCollected += msg.value; }
        emit PlayerJoined(_gameId, msg.sender);

        // If all players have paid, lock the wager
        bool allPaid = true;
        for (uint i = 0; i < wager.players.length; i++) {
            if (!wager.hasPaid[wager.players[i]]) {
                allPaid = false;
                break;
            }
        }

        if (allPaid) {
            wager.state = WagerState.Locked;
        }
    }

    function reportWinner(string memory _gameId, address _winner) public onlyOwner {
        Wager storage wager = wagers[_gameId];
        require(wager.state == WagerState.Locked, "Wager is not locked or has already concluded.");

        bool isWinnerInGame = false;
        for (uint i = 0; i < wager.players.length; i++) {
            if (wager.players[i] == _winner) {
                isWinnerInGame = true;
                break;
            }
        }
        require(isWinnerInGame, "Winner is not a player in this game.");

        wager.winner = _winner;
        wager.state = WagerState.Concluded;

        uint256 totalPot = wager.amountCollected;
        // Effects before interaction
        wager.amountCollected = 0;

        (bool success, ) = payable(_winner).call{value: totalPot}("");
        require(success, "Transfer failed");

        emit WagerConcluded(_gameId, _winner, totalPot);
    }

    function cancelWager(string memory _gameId) public onlyOwner {
        Wager storage wager = wagers[_gameId];
        require(wager.state != WagerState.Concluded, "Wager has already been concluded.");

        wager.state = WagerState.Concluded; // Mark as concluded to prevent further actions

        uint256 refundTotal = 0;
        for (uint i = 0; i < wager.players.length; i++) {
            address player = wager.players[i];
            if (wager.hasPaid[player]) {
                (bool success, ) = payable(player).call{value: wager.buyInAmount}("");
                require(success, "Refund failed");
                unchecked { refundTotal += wager.buyInAmount; }
            }
        }
        // Effects
        if (wager.amountCollected >= refundTotal) {
            unchecked { wager.amountCollected -= refundTotal; }
        } else {
            wager.amountCollected = 0;
        }
        emit WagerCancelled(_gameId);
    }

    function getWagerState(string memory _gameId) public view returns (WagerState) {
        return wagers[_gameId].state;
    }

    function hasPlayerPaid(string memory _gameId, address player) public view returns (bool) {
        return wagers[_gameId].hasPaid[player];
    }

    function getWagerInfo(string memory _gameId) public view returns (
        uint256 buyInAmount,
        uint256 amountCollected,
        WagerState state,
        address winner,
        address[] memory players,
        bool[] memory hasPaidFlags
    ) {
        Wager storage wager = wagers[_gameId];
        buyInAmount = wager.buyInAmount;
        amountCollected = wager.amountCollected;
        state = wager.state;
        winner = wager.winner;
        players = wager.players;
        hasPaidFlags = new bool[](players.length);
        for (uint i = 0; i < players.length; i++) {
            hasPaidFlags[i] = wager.hasPaid[players[i]];
        }
    }
}

