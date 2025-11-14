    //-------------------------------------------------------------------------
    // base helper methods
    //-------------------------------------------------------------------------

    function get(id)        { return document.getElementById(id);  }
    function hide(id)       { get(id).style.visibility = 'hidden'; }
    function show(id)       { get(id).style.visibility = null;     }
    function html(id, html) { get(id).innerHTML = html;            }

    function timestamp()           { return new Date().getTime();                             }
    function random(min, max)      { return (min + (Math.random() * (max - min)));            }
    function randomChoice(choices) { return choices[Math.round(random(0, choices.length-1))]; }

    if (!window.requestAnimationFrame) { // http://paulirish.com/2011/requestanimationframe-for-smart-animating/
    window.requestAnimationFrame = window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame    ||
        window.oRequestAnimationFrame      ||
        window.msRequestAnimationFrame     ||
        function(callback, element) {
            window.setTimeout(callback, 1000 / 60);
        }
    }

    // Initialize the Tetris court
    function initializeBoard(nx, ny) {
        let board = [];
        for (let x = 0; x < nx; x++) {
            board[x] = [];
            for (let y = 0; y < ny; y++) {
                board[x][y] = 0;
            }
        }
        return board;
    }

    //-------------------------------------------------------------------------
    // game constants
    //-------------------------------------------------------------------------

    var KEY     = { ESC: 27, SPACE: 32, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40 },
    DIR     = { UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3, MIN: 0, MAX: 3, AI: -1},
    stats   = new Stats(),
    canvas  = get('canvas'),
    ctx     = canvas.getContext('2d'),
    ucanvas = get('upcoming'),
    uctx    = ucanvas.getContext('2d'),
    speed   = { start: 0.6, decrement: 0.005, min: 0.1 }, // how long before piece drops by 1 row (seconds)
    nx      = 10, // width of tetris court (in blocks)
    ny      = 20, // height of tetris court (in blocks)
    nu      = 5;  // width/height of upcoming preview (in blocks)
    lookaheadDepth = 2;

    //-------------------------------------------------------------------------
    // game variables (initialized during reset)
    //-------------------------------------------------------------------------

    var dx, dy,    // pixel size of a single tetris block
    blocks,        // 2 dimensional array (nx*ny) representing tetris court - either empty block or occupied by a 'piece'
    actions,       // queue of user actions (inputs)
    playing,       // true|false - game is in progress
    dt,            // time since starting this game
    current,       // the current piece
    next,          // the next piece
    score,         // the current score
    vscore,        // the currently displayed score (it catches up to score in small chunks - like a spinning slot machine)
    rows,          // number of completed rows in the current game
    step;          // how long before current piece drops by 1 row

    //-------------------------------------------------------------------------
    // tetris pieces
    // blocks: each element represents a rotation of the piece (0, 90, 180, 270)
    //         each element is a 16-bit integer where the 16 bits represent
    //         a 4x4 set of blocks, e.g. j.blocks[0] = 0x44C0
    //
    //             0100 = 0x4 << 3 = 0x4000
    //             0100 = 0x4 << 2 = 0x0400
    //             1100 = 0xC << 1 = 0x00C0
    //             0000 = 0x0 << 0 = 0x0000
    //                               ------
    //                               0x44C0
    //-------------------------------------------------------------------------
    const i = { size: 4, blocks: [0x0F00, 0x2222, 0x00F0, 0x4444], color: 'cyan'   };
    const j = { size: 3, blocks: [0x44C0, 0x8E00, 0x6440, 0x0E20], color: 'blue'   };
    const l = { size: 3, blocks: [0x4460, 0x0E80, 0xC440, 0x2E00], color: 'orange' };
    const o = { size: 2, blocks: [0xCC00, 0xCC00, 0xCC00, 0xCC00], color: 'yellow' };
    const s = { size: 3, blocks: [0x06C0, 0x8C40, 0x6C00, 0x4620], color: 'green'  };
    const t = { size: 3, blocks: [0x0E40, 0x4C40, 0x4E00, 0x4640], color: 'purple' };
    const z = { size: 3, blocks: [0x0C60, 0x4C80, 0xC600, 0x2640], color: 'red'    };

    //------------------------------------------------
    // do the bit manipulation and iterate through each
    // occupied block (x,y) for a given piece
    //------------------------------------------------
    function eachblock(type, x, y, dir, fn) {
        var bit, row = 0, col = 0, blocks = type.blocks[dir];
        for(bit = 0x8000 ; bit > 0 ; bit = bit >> 1) {
            if (blocks & bit) {
                fn(x + col, y + row);
            }
            if (++col === 4) {
                col = 0;
                ++row;
            }
        }
    }

    //-----------------------------------------------------
    // check if a piece can fit into a position in the grid
    //-----------------------------------------------------
    function occupied(type, x, y, dir) {
        var result = false
        eachblock(type, x, y, dir, function(x, y) {
            if ((x < 0) || (x >= nx) || (y < 0) || (y >= ny) || getBlock(x,y))
                result = true;
        });
        return result;
    }

    function unoccupied(type, x, y, dir) {
        return !occupied(type, x, y, dir);
    }

    //-----------------------------------------
    // start with 4 instances of each piece and
    // pick randomly until the 'bag is empty'
    //-----------------------------------------
    let pieceQueue = [];

    function fillQueue() {
        while (pieceQueue.length < lookaheadDepth) {
            pieceQueue.push(randomPiece());
        }
    }

    var pieces = [];
    function randomPiece() {
        if (pieces.length === 0)
            pieces = [i,i,i,i,j,j,j,j,l,l,l,l,o,o,o,o,s,s,s,s,t,t,t,t,z,z,z,z];
        var type = pieces.splice(pieces.indexOf(randomChoice(pieces)), 1)[0];
        return { type: type, dir: DIR.UP, x: Math.round(random(0, nx - type.size)), y: 0 };
    }

    function getNextPiece() {
        let next = pieceQueue.shift();
        fillQueue();
        return next;
    }

    //-------------------------------------------------------------------------
    // GAME LOOP
    //-------------------------------------------------------------------------

    function run() {

        showStats(); // initialize FPS counter
        addEvents(); // attach keydown and resize events

        var now;
        var last = now = timestamp();
        function frame() {
            now = timestamp();
            update(Math.min(1, (now - last) / 1000.0)); // using requestAnimationFrame have to be able
            // to handle large delta's caused when it 'hibernates' in a background or non-visible tab
            draw();
            stats.update();
            last = now;
            requestAnimationFrame(frame);
        }

        fillQueue();
        resize(); // setup all our sizing information
        reset();  // reset the per-game variables
        frame();  // start the first frame

    }

    function showStats() {
        stats.domElement.id = 'stats';
        get('menu').appendChild(stats.domElement);
    }

    function addEvents() {
        document.addEventListener('keydown', keydown, false);
        window.addEventListener('resize', resize, false);
    }

    function resize(event) {
        canvas.width   = canvas.clientWidth;  // set canvas logical size equal to its physical size
        canvas.height  = canvas.clientHeight; // (ditto)
        ucanvas.width  = ucanvas.clientWidth;
        ucanvas.height = ucanvas.clientHeight;
        dx = canvas.width  / nx; // pixel size of a single tetris block
        dy = canvas.height / ny; // (ditto)
        invalidate();
        invalidateNext();
    }

    function keydown(ev) {
        var handled = false;
        if (playing) {
            switch(ev.keyCode) {
                case KEY.LEFT:   actions.push(DIR.LEFT);  handled = true; break;
                case KEY.RIGHT:  actions.push(DIR.RIGHT); handled = true; break;
                case KEY.UP:     actions.push(DIR.UP);    handled = true; break;
                case KEY.DOWN:   actions.push(DIR.DOWN);  handled = true; break;
                case KEY.ESC:    lose();                  handled = true; break;
                case KEY.SPACE:  actions.push(DIR.AI);    handled = true; break;
            }
        }
        else if (ev.keyCode == KEY.SPACE) {
            play();
            handled = true;
        }
        if (handled)
            ev.preventDefault(); // prevent arrow keys from scrolling the page (supported in IE9+ and all other browsers)
    }

    //-------------------------------------------------------------------------
    // GAME LOGIC
    //-------------------------------------------------------------------------

    function play() { hide('start'); reset();          playing = true;  }
    function lose() { show('start'); setVisualScore(); playing = false; }

    function setVisualScore(n)      { vscore = n || score; invalidateScore(); }
    function setScore(n)            { score = n; setVisualScore(n);  }
    function addScore(n)            { score = score + n;   }
    function clearScore()           { setScore(0); }
    function clearRows()            { setRows(0); }
    function setRows(n)             { rows = n; step = Math.max(speed.min, speed.start - (speed.decrement*rows)); invalidateRows(); }
    function addRows(n)             { setRows(rows + n); }
    function getBlock(x,y)          { return (blocks && blocks[x] ? blocks[x][y] : null); }
    function setBlock(x,y,type)     { blocks[x] = blocks[x] || []; blocks[x][y] = type; invalidate(); }
    function clearBlocks()          { blocks = initializeBoard(nx, ny); invalidate(); }
    function clearActions()         { actions = []; }
    function setCurrentPiece(piece) { current = piece || randomPiece(); invalidate();     }
    function setNextPiece(piece)    { next    = piece || randomPiece(); invalidateNext(); }

    function reset() {
        dt = 0;
        clearActions();
        clearBlocks();
        clearRows();
        clearScore();
        setCurrentPiece(getNextPiece());
        setNextPiece(pieceQueue[0]);
    }

    function update(idt) {
        if (playing) {
            if (vscore < score)
                setVisualScore(vscore + 1);
            handle(actions.shift());
            dt = dt + idt;
            if (dt > step) {
                dt = dt - step;
                drop();
            }
        }
    }

    function handle(action) {
        switch(action) {
            case DIR.LEFT:  move(DIR.LEFT);  break;
            case DIR.RIGHT: move(DIR.RIGHT); break;
            case DIR.UP:    rotate();        break;
            case DIR.DOWN:  drop();          break;
            case DIR.AI:    agent();         break;
        }
    }

    function move(dir) {
        var x = current.x, y = current.y;
        switch(dir) {
            case DIR.RIGHT: x = x + 1; break;
            case DIR.LEFT:  x = x - 1; break;
            case DIR.DOWN:  y = y + 1; break;
        }
        if (unoccupied(current.type, x, y, current.dir)) {
            current.x = x;
            current.y = y;
            invalidate();
            return true;
        }
        else {
            return false;
        }
    }

    function rotate() {
        var newdir = (current.dir == DIR.MAX ? DIR.MIN : current.dir + 1);
        if (unoccupied(current.type, current.x, current.y, newdir)) {
            current.dir = newdir;
            invalidate();
        }
    }

    function drop() {
        if (!move(DIR.DOWN)) {
            addScore(10);
            dropPiece();
            removeLines();
            setCurrentPiece(getNextPiece());
            setNextPiece(pieceQueue[0]);
            clearActions();
            if (occupied(current.type, current.x, current.y, current.dir)) {
                lose();
            }
        }
    }

    function dropPiece() {
        eachblock(current.type, current.x, current.y, current.dir, function(x, y) {
            setBlock(x, y, current.type);
        });
    }

    function removeLines() {
        var x, y, complete, n = 0;
        for(y = ny ; y > 0 ; --y) {
            complete = true;
            for(x = 0 ; x < nx ; ++x) {
                if (!getBlock(x, y)) {
                    complete = false;
                    break;
                }
            }
            if (complete) {
                removeLine(y);
                y = y + 1; // recheck same line
                n++;
            }
        }
        if (n > 0) {
            addRows(n);
            addScore(100*Math.pow(2,n-1)); // 1: 100, 2: 200, 3: 400, 4: 800
        }
    }

    function removeLine(n) {
        var x, y;
        for(y = n ; y >= 0 ; --y) {
            for(x = 0 ; x < nx ; ++x)
                setBlock(x, y, (y == 0) ? null : getBlock(x, y-1));
        }
    }

    //-------------------------------------------------------------------------
    // RENDERING
    //-------------------------------------------------------------------------

    var invalid = {};

    function invalidate()         { invalid.court  = true; }
    function invalidateNext()     { invalid.next   = true; }
    function invalidateScore()    { invalid.score  = true; }
    function invalidateRows()     { invalid.rows   = true; }

    function draw() {
        ctx.save();
        ctx.lineWidth = 1;
        ctx.translate(0.5, 0.5); // for crisp 1px black lines
        drawCourt();
        drawNext();
        drawScore();
        drawRows();
        ctx.restore();
    }

    function drawCourt() {
        if (invalid.court) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (playing)
                drawPiece(ctx, current.type, current.x, current.y, current.dir);
            var x, y, block;
            for(y = 0 ; y < ny ; y++) {
                for (x = 0 ; x < nx ; x++) {
                    if (block = getBlock(x, y))
                        drawBlock(ctx, x, y, block.color);
                }
            }
            ctx.strokeRect(0, 0, nx*dx - 1, ny*dy - 1); // court boundary
            invalid.court = false;
        }
    }

    function drawNext() {
        if (invalid.next) {
            var padding = (nu - next.type.size) / 2; // half-arsed attempt at centering next piece display
            uctx.save();
            uctx.translate(0.5, 0.5);
            uctx.clearRect(0, 0, nu*dx, nu*dy);
            drawPiece(uctx, next.type, padding, padding, next.dir);
            uctx.strokeStyle = 'black';
            uctx.strokeRect(0, 0, nu*dx - 1, nu*dy - 1);
            uctx.restore();
            invalid.next = false;
        }
    }

    function drawScore() {
        if (invalid.score) {
            html('score', ("00000" + Math.floor(vscore)).slice(-5));
            invalid.score = false;
        }
    }

    function drawRows() {
        if (invalid.rows) {
            html('rows', rows);
            invalid.rows = false;
        }
    }

    function drawPiece(ctx, type, x, y, dir) {
        eachblock(type, x, y, dir, function(x, y) {
            drawBlock(ctx, x, y, type.color);
        });
    }

    function drawBlock(ctx, x, y, color) {
        ctx.fillStyle = color;
        ctx.fillRect(x*dx, y*dy, dx, dy);
        ctx.strokeRect(x*dx, y*dy, dx, dy)
    }

    function agent() {
        let upcomingPieces = pieceQueue.slice(0, lookaheadDepth);
        let bestMove = beamSearch(current, blocks, upcomingPieces); // beam search agent
        // let bestMove = selectBestMove(current, next); // heuteristic agent
        if (bestMove === null) console.log(`noooooooooooo`);
        if (bestMove) {
            let dropY = getDropPosition(bestMove.piece, bestMove.x);
            current.x = bestMove.x;
            current.y = dropY;
            current.dir = bestMove.piece.dir;
            drop();
        }
    }

// I was writing this report as I was doing the task, in real time. It is a sequencial order of my actions:
// note: also, for the reader not to be lost in the sauce, I let AI agent play the game several times and did some statistics, and presented the results after each change mentioned below (I used 1000 games average for cleared rows and score).

// At the start, without any additions:

// Average score over 1000 games: 211.46
// Average cleared rows over 1000 games: 0.00

// Well, when I started the task, I wanted to find the bugs. I played with the game, but I could't find any obvious bugs in the base game code. I then tinckered with heuteristic agent and watched how it played. While watching it play (and also trying to fix one bug), I discovered the following three bugs:

// bug found #1: sometimes AI agent's move can place a piece on an existing piece at the top (can be easily observed by holding space to see how AI plays), and this doesn't end the game.

// bug found #2: sometimes AI can place a piece that would be impossible to do so normally. If there is a wall in the middle, and the piece spawns on one side of the wall, then AI agent could place it on the other side of the wall. I consiredered this as a bug. If we have a piece, and we decide to press space, then it should try to place the piece in optimal manner form the current position, not from any position (for example the hegiht of the current piece may be low, and if we don't do this, AI agent will start placing it form upper level).

// bug found #3: There seems less variation in rotations between the placed pieces by heuteristic AI agent.

// bug fixes (for both bugs): made the changes to getPossibleMoves(). Added two while loops similar to getDropPosition(), to find the left and right boundaries (on same y-level) and iterate over them. This way we iterate only on reachable x-s and not all of them. This alone is not a massive improvement or anything, but while looking into this code, I found another bug: we inserted the reference of the original piece instead of a copy to moved[]. Therefore, the moves interfered with each other, since they referenced the same object. Now I only fixed this bug, and watched the AI play:

// Average score over 1000 games: 335.09
// Average cleared rows over 1000 games: 0.00

// The number of cleared rows was still 0 most of the time, but the placed pieces were much better: the AI agent was actually trying to fill the rows (before it was a mess and seemed to stack the pieces on each other, not trying to clear rows. This was because the direction of fallen pieces was shared). After this, I added the getLeftmostPosition() and getRightmostPosition() functions and the [lx,rx] boundaries for reachable x-s. After this change, the AI started to clear several rows:

// Average score over 1000 games: 963.94
// Average cleared rows over 1000 games: 5.08
    
// After fixing these bugs, I wondered: there doesn't seem to be any obvious bugs, so maybe its something the is obvious, but maybe harder to notice. I looked at the row counting and score counting code, and it all seemed correct.

// After playing for some time, I thought, what if the logic behind random pieces is incorrect? It should have the bag with 4 pieces of each type, and until the bag is empty, choose from it randomly. But I got the followig configuration <insert picture> (notice no rows cleared, so this is the first bag). We can see that the Hero type (look up the names of the tetris blocks) occurs three times, but we have 8 TeeWee type (also, to have 8 odds for this is really low). So, I fixed the function and used randomChoice():

// Average score over 1000 games: 975.81
// Average cleared rows over 1000 games: 5.19

// Only a slight improvement. Shame.

// Now, I thought to maybe tincker with weights to improve the agent, but I heard from friends that fixing bugs in the code actually makes the agent perform significantly better.


// I looked for bugs in the game.js code, but couldn't find anything wrong. So, I went to heuteristic_agent.js (since on of the major improvements of fixing a bug came from here earlier) and checked th evaluateBoard() code: Found that the height aggreagtion calculation nested loops were in wrong order, so basically the program couldn't take into account the heights. Presumably, this will bring a huge improvement. (Also, another bug in board[x][y] being empty: could be null or undefined)

// Average score over 1000 games: 1330.93
// Average cleared rows over 1000 games: 7.84

// I expected bigger improvements, however, this is still good? No. It turns out, I missed a bug while fixing one thing. Earier, I had written the [lx,rx] bounds for the piece to find the valid range to move it. However, I didn't consider the following: For example, if we have Hero piece horizontally, if we shift it left and right while we can, we would have short x range. However, if we rotate it vertically, and then shift, we have much larger range. Therefore, I fixed this by bringing the lx and rx calculation inside the dir loop (before I had it outside). How did I find such problem? When playing, the resulting state would really often look like this: every row is filled well, with a little amount of holes, but leftmost or rightmost column would almost always be completely empty. This meant that AI agent was having a hard time placing the pieces on the edges. Therefore, the x range for the best possible choice was calculated wrong. 

// Now, the results actually look promising, 10 times better results!:

// Average score over 1000 games: 9445.19
// Average cleared rows over 1000 games: 71.57

// Now, we have fixed all major problems (I think?), so now we have two options. Either I improve the AI agent by tinckering with weights or I add some new features to the calculation.

// I want to first add maybe a new metrics (improve board state evaluation) and then tincker with all weights at the same time.

// What metrics could we add? We already have the aggregated heights, completed lines, holes, and bumpiness.
// I have three ideas: 
// 1. we want to have after every move to have the max heigth as little as possible.
// 2. we have the next piece preview, so we can do 2 moves and after that evaluate the position.
// 3. the more rows we complete at the same time, the better, since the score increases exponentially. So we could add metric "AlmostCompleteLines"

// first, the easiest to add was max height metric: I set the weight -0.1

// Average score over 1000 games: 10072.56
// Average cleared rows over 1000 games: 76.17

// A slight improvement. However, we haven't given thought to the optimal weights, so we will see in the end what will happen.

// second, the 2 move calculation: changed selectBestMove(). However, after doing so, the AI became far worse, so I abandoned this idea. (also, this is going to the beam search teritorry, so I can do it later).

// third, I added the almostComplete metric. This is the maximum number of consecutive almost complete rows (almost complete means one block is missing in row), where the missing block are on same x (so we clear multiple rows with one move and gain lots of points). This metrc didn't improve the score, but I will keep it for beam search, since it will be more useful there (since e look multiple move ahead, we can plan for future/make an optimal setup).

// Now, I am tinkering with the weights (with better weights, it no longer became possible to have 1000 games, it took too long, so I switched to 100 games): 

// The following is the starting weights: return -0.51 * aggregateHeight + 0.76 * completeLines - 0.36 * holes - 0.18 * bumpiness;

// After tinkering a lot (and also after I added an optimization: we change the multiplier for maxColumnHeight metric (if maxColumnHeight > 15, then decrease its weight, since we dont want to increase it any more, and would try to fill other places)) I have this:

// let w1 = -0.7;
//     let w2 = 2;
//     let w3 = -0.2;
//     let w4 = -0.1;
//     let w5 = -0.03;
//     if (maxColumnHeight > 15) w5 = -0.4;
//     let w6 = 0;

//     return w1 * aggregateHeight + 
//            w2 * Math.pow(2, completeLines - 1) + 
//            w3 * holes + 
//            w4 * bumpiness + 
//            w5 * maxColumnHeight + 
//            w6 * almostCompleteLines;

// Average score over 100 games: 57517.00
// Average cleared rows over 100 games: 407.64

// Now, after tinkering with the weights, and also looking at AI agent play, it seemed that a lot of the times, there was gaps on eirtehr left or right walls. Therefore, I added the WallPenalty metric, which takes the difference between max height and wall heights, and then calculates it. The threshold for it is set 3, since if the diff is more than 3, then we promp the AI agent to fill this hole. After adding this metric, the score became:

// Average score over 100 games: 83579.80
// Average cleared rows over 100 games: 634.85

// Wow. Twice the better results. I am now too tired to continue tinkering with weights and adding more metrics, so I guess time to more on Beam search. I think I spend too much time up until now, so after implementing the BEAM search, I will just use the same metrics.

// Well, I started doing the Beam search, but I didn't have enough time. SO, I just have the code (currently not good results, not sure why, couldn't find whats wrong). So I won't include it, but the potential is there: We will look ahead to future moves (have queue with next pieces) and also simulate the row clears (since if we don't it will pile up after several moves). Ideally, I would use all the metrics including the metric almostCompleteLines that I added.
