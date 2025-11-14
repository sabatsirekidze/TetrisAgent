function runAIGame() {
    reset();
    playing = true;

    while (playing) {
        agent();
    }

    return { score, rows };
}

function runMultipleAIGames(num) {
    let scores = [];
    let rowsCleared = [];
    let totalScore = 0;
    let totalRowsCleared = 0;

    for (let i = 0; i < num; i++) {
        let { score: gameScore, rows: clearedRows } = runAIGame();
        scores.push(gameScore);
        rowsCleared.push(clearedRows);
        totalScore += gameScore;
        totalRowsCleared += clearedRows;
        // console.log(`Game ${i + 1}: score = ${gameScore}, rows = ${clearedRows}`);
    }

    let avgScore = totalScore / num;
    let avgRows = totalRowsCleared / num;
    console.log(`Average score over ${num} games: ${avgScore.toFixed(2)}`);
    console.log(`Average cleared rows over ${num} games: ${avgRows.toFixed(2)}`);
}

runMultipleAIGames(1000);
