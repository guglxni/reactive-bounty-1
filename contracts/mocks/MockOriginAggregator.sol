// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/AggregatorV3Interface.sol";

contract MockOriginAggregator is AggregatorV3Interface {
    uint8 public override decimals;
    string public override description;
    uint256 public override version;

    struct RoundData {
        uint80 roundId;
        int256 answer;
        uint256 startedAt;
        uint256 updatedAt;
        uint80 answeredInRound;
    }

    RoundData public latestRound;
    
    event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt);
    event NewRound(uint256 indexed roundId, address indexed startedBy, uint256 startedAt);

    constructor(uint8 _decimals, string memory _description) {
        decimals = _decimals;
        description = _description;
        version = 1;
    }

    function updateAnswer(int256 _answer) external {
        uint80 nextRoundId = latestRound.roundId + 1;
        uint256 timestamp = block.timestamp;

        latestRound = RoundData({
            roundId: nextRoundId,
            answer: _answer,
            startedAt: timestamp,
            updatedAt: timestamp,
            answeredInRound: nextRoundId
        });

        emit AnswerUpdated(_answer, nextRoundId, timestamp);
        emit NewRound(nextRoundId, msg.sender, timestamp);
    }

    function getRoundData(uint80 _roundId)
        external
        view
        override
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        require(_roundId == latestRound.roundId, "Only latest round stored");
        return (latestRound.roundId, latestRound.answer, latestRound.startedAt, latestRound.updatedAt, latestRound.answeredInRound);
    }

    function latestRoundData()
        external
        view
        override
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (latestRound.roundId, latestRound.answer, latestRound.startedAt, latestRound.updatedAt, latestRound.answeredInRound);
    }
}

