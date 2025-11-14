function beamSearch(piece, board, queue, beamWidth = 10, depth = 4) {
    let firstLayer = getBeamPossibleMoves(piece, board).map(move => ({
        board: move.board,
        firstMove: move,
        score: move.moveScore || 0
    }));

    if (firstLayer.length === 0) return null;

    firstLayer.sort((a, b) => (evaluateBoard(b.board) + b.score) - (evaluateBoard(a.board) + a.score));
    firstLayer = firstLayer.slice(0, beamWidth);

    for (let d = 0; d < Math.min(depth, queue.length); d++) {
        let nextPiece = queue[d];
        let nextLayer = [];

        for (const node of firstLayer) {
            let nextMoves = getBeamPossibleMoves(nextPiece, node.board);

            nextMoves.forEach(m => {
                nextLayer.push({
                    board: m.board,
                    firstMove: node.firstMove,
                    score: node.score + (m.moveScore || 0)
                });
            });
        }

        if (nextLayer.length === 0) break;

        nextLayer.sort((a, b) => (evaluateBoard(b.board) + b.score) - (evaluateBoard(a.board) + a.score));
        firstLayer = nextLayer.slice(0, beamWidth);
    }

    return firstLayer[0].firstMove;
}

function getBeamPossibleMoves(piece, board) {
    let moves = [];

    for (let dir = 0; dir < 4; dir++) {
        let tempPiece = { ...piece, dir };
        let lx = getLeftmostPosition(tempPiece);
        let rx = getRightmostPosition(tempPiece);

        for (let x = lx; x <= rx; x++) {
            let y = getDropPosition({ type: tempPiece.type, dir }, x);
            if (occupied(tempPiece.type, x, y, dir)) continue;

            let newBoard = copyBlocks(board);

            eachblock(tempPiece.type, x, y, dir, (bx, by) => newBoard[bx][by] = tempPiece.type);

            let linesCleared = 0;
            for (let row = ny - 1; row >= 0; row--) {
                if (newBoard.every(col => col[row])) {
                    for (let col = 0; col < nx; col++) {
                        for (let r = row; r > 0; r--) newBoard[col][r] = newBoard[col][r - 1];
                        newBoard[col][0] = null;
                    }
                    linesCleared++;
                    row++;
                }
            }

            let moveScore = 0;
            if (linesCleared > 0) {
                moveScore = 100 * Math.pow(2, linesCleared - 1);
            }

            moves.push({
                piece: { type: tempPiece.type, dir },
                x, y,
                board: newBoard,
                linesCleared,
                moveScore
            });
        }
    }
    return moves;
}
