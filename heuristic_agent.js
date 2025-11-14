// Heuristic evaluation function
function evaluateBoard(board) {
    let aggregateHeight = 0;
    let completeLines = 0;
    let holes = 0;
    let bumpiness = 0;
    let columnHeights = new Array(nx).fill(0);
    let maxColumnHeight = 0;
    let almostCompleteLines = 0;
    let wallPenalty = 0;

    // Calculate aggregate height and column heights
    for (let x = 0; x < nx; x++) {
        for (let y = 0; y < ny; y++) { // two bug fixes here
            if (board[x][y] !== 0 &&
                board[x][y] !== null &&
                board[x][y] !== undefined) {
                columnHeights[x] = ny - y;
                maxColumnHeight = Math.max(maxColumnHeight, columnHeights[x]);
                aggregateHeight += columnHeights[x];
                break;
            }
        }
    }

    // Calculate almost complete lines metric
    almostCompleteLines = maxAlmostCompleteStack(board);

    // Calculate wall penalty metric
    let leftWallHeight = columnHeights[0];
    let rightWallHeight = columnHeights[nx - 1];
    let threshold = 3;
    if (maxColumnHeight - leftWallHeight > threshold) wallPenalty += (maxColumnHeight - leftWallHeight);
    if (maxColumnHeight - rightWallHeight > threshold) wallPenalty += (maxColumnHeight - rightWallHeight);

    // Calculate complete lines
    for (let y = 0; y < ny; y++) {
        var complete = true;
        for (let x = 0; x < nx; x++) {
            if (board[x][y] === 0) {
                complete = false;
                break;
            }
        }
        if (complete)
            completeLines++;
    }

    // Calculate holes
    for (let x = 0; x < nx; x++) {
        let blockFound = false;
        for (let y = 0; y < ny; y++) {
            if (board[x][y] !== 0) {
                blockFound = true;
            } else if (blockFound && board[x][y] === 0) {
                holes++;
            }
        }
    }

    // Calculate bumpiness
    for (let x = 0; x < nx - 1; x++) {
        bumpiness += Math.abs(columnHeights[x] - columnHeights[x + 1]);
    }

    // Combine features into a heuristic score
    let w1 = -0.7;
    let w2 = 4;
    let w3 = -0.22;
    let w4 = -0.1;
    let w5 = -0.03;
    if (maxColumnHeight > 15) w5 = -0.4;
    let w6 = 0;
    let w7 = -0.1;

    return w1 * aggregateHeight + 
           w2 * Math.pow(2, completeLines) + 
           w3 * holes + 
           w4 * bumpiness + 
           w5 * maxColumnHeight + 
           w6 * almostCompleteLines +
           w7 * wallPenalty;
}

// Calculate almost-complete lines and consecutive almost-complete max
function maxAlmostCompleteStack(board) {
    let almostCompleteIdx = new Array(nx).fill(0);
    let maxStack = 0;

    for (let y = 0; y < ny; y++) {
        let emptyIdx = -1;
        let numFilled = 0;

        for (let x = 0; x < nx; x++) {
            if (board[x][y] !== 0 && board[x][y] != null) {
                numFilled++;
            } else {
                emptyIdx = x;
            }
        }

        if (numFilled === nx - 1 && emptyIdx !== -1) {
            almostCompleteIdx[emptyIdx]++;
            if (almostCompleteIdx[emptyIdx] > maxStack) {
                maxStack = almostCompleteIdx[emptyIdx];
            }
        } else {
            for (let i = 0; i < nx; i++) almostCompleteIdx[i] = 0;
        }
    }

    return maxStack;
}

// Function to deep copy the blocks array
function copyBlocks(blocks) {
    let new_blocks = [];
    for (let x = 0; x < nx; x++) {
        new_blocks[x] = [];
        for (let y = 0; y < ny; y++) {
            new_blocks[x][y] = blocks[x][y];
        }
    }
    return new_blocks;
}

// Generate all possible moves for the current piece
function getPossibleMoves(piece, board) {
    let moves = [];

    // For each reachable x, test each rotation
    for (let dir = 0; dir < 4; dir++) {

        let tempPiece = { ...piece, dir: dir }; // big improvement here

        let lx = getLeftmostPosition(tempPiece);
        let rx = getRightmostPosition(tempPiece);

        for (let xi = lx; xi <= rx; ++xi) { // imrpoevement here

            if (occupied(tempPiece.type, xi, piece.y, dir)) continue;

            // Compute drop position
            let y = getDropPosition({ type: tempPiece.type, dir: dir }, xi);

            // Create a copy of the board and simulate placement
            let new_blocks = copyBlocks(board);
            eachblock(tempPiece.type, xi, y, dir, function(bx, by) {
                new_blocks[bx][by] = tempPiece.type;
            });

            moves.push({
                piece: { type: tempPiece.type, dir: dir }, // This is one of the major improvements
                x: xi,
                y: y,
                board: new_blocks
            });
        }
    }
    return moves;
}

// Select the best move based on heuristic evaluation
function selectBestMove(piece, board) {
    let moves = getPossibleMoves(piece, blocks);
    let bestMove = null;
    let bestScore = -Infinity;
    moves.forEach(move => {
        let score = evaluateBoard(move.board);
        if (score > bestScore) {
            bestScore = score;
            bestMove = move;
        }
    });
    return bestMove;
}

// Function to get the drop position of the piece
function getDropPosition(piece, x) {
    let y = 0;
    while (!occupied(piece.type, x, y + 1, piece.dir)) {
        y++;
    }
    return y;
}

function getLeftmostPosition(piece) {
    let x = piece.x;
    while (!occupied(piece.type, x - 1, piece.y, piece.dir)) {
        x--;
    }
    return x;
}

function getRightmostPosition(piece) {
    let x = piece.x;
    while (!occupied(piece.type, x + 1, piece.y, piece.dir)) {
        x++;
    }
    return x;
}