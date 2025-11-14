# TetrisAgent

I was writing this report as I was doing the task, in real time. It is a sequencial order of my actions:
note: also, for the reader not to be lost in the sauce, I let AI agent play the game several times and did some statistics, and presented the results after each change mentioned below (I used 1000 games average for cleared rows and score).

At the start, without any additions:

Average score over 1000 games: 211.46
Average cleared rows over 1000 games: 0.00

Well, when I started the task, I wanted to find the bugs. I played with the game, but I could't find any obvious bugs in the base game code. I then tinckered with heuteristic agent and watched how it played. While watching it play (and also trying to fix one bug), I discovered the following three bugs:

bug found #1: sometimes AI agent's move can place a piece on an existing piece at the top (can be easily observed by holding space to see how AI plays), and this doesn't end the game.

bug found #2: sometimes AI can place a piece that would be impossible to do so normally. If there is a wall in the middle, and the piece spawns on one side of the wall, then AI agent could place it on the other side of the wall. I consiredered this as a bug. If we have a piece, and we decide to press space, then it should try to place the piece in optimal manner form the current position, not from any position (for example the hegiht of the current piece may be low, and if we don't do this, AI agent will start placing it form upper level).

bug found #3: There seems less variation in rotations between the placed pieces by heuteristic AI agent.

bug fixes (for both bugs): made the changes to getPossibleMoves(). Added two while loops similar to getDropPosition(), to find the left and right boundaries (on same y-level) and iterate over them. This way we iterate only on reachable x-s and not all of them. This alone is not a massive improvement or anything, but while looking into this code, I found another bug: we inserted the reference of the original piece instead of a copy to moved[]. Therefore, the moves interfered with each other, since they referenced the same object. Now I only fixed this bug, and watched the AI play:

Average score over 1000 games: 335.09
Average cleared rows over 1000 games: 0.00

The number of cleared rows was still 0 most of the time, but the placed pieces were much better: the AI agent was actually trying to fill the rows (before it was a mess and seemed to stack the pieces on each other, not trying to clear rows. This was because the direction of fallen pieces was shared). After this, I added the getLeftmostPosition() and getRightmostPosition() functions and the [lx,rx] boundaries for reachable x-s. After this change, the AI started to clear several rows:

Average score over 1000 games: 963.94
Average cleared rows over 1000 games: 5.08
    
After fixing these bugs, I wondered: there doesn't seem to be any obvious bugs, so maybe its something the is obvious, but maybe harder to notice. I looked at the row counting and score counting code, and it all seemed correct.

After playing for some time, I thought, what if the logic behind random pieces is incorrect? It should have the bag with 4 pieces of each type, and until the bag is empty, choose from it randomly. But I got the followig configuration: I have added the screenshot to repo.

(notice no rows cleared, so this is the first bag). We can see that the Hero type (look up the names of the tetris blocks) occurs three times, but we have 8 TeeWee type (also, to have 8 odds for this is really low). So, I fixed the function and used randomChoice():

Average score over 1000 games: 975.81
Average cleared rows over 1000 games: 5.19

Only a slight improvement. Shame.

Now, I thought to maybe tincker with weights to improve the agent, but I heard from friends that fixing bugs in the code actually makes the agent perform significantly better.


I looked for bugs in the game.js code, but couldn't find anything wrong. So, I went to heuteristic_agent.js (since on of the major improvements of fixing a bug came from here earlier) and checked th evaluateBoard() code: Found that the height aggreagtion calculation nested loops were in wrong order, so basically the program couldn't take into account the heights. Presumably, this will bring a huge improvement. (Also, another bug in board[x][y] being empty: could be null or undefined)

Average score over 1000 games: 1330.93
Average cleared rows over 1000 games: 7.84

I expected bigger improvements, however, this is still good? No. It turns out, I missed a bug while fixing one thing. Earier, I had written the [lx,rx] bounds for the piece to find the valid range to move it. However, I didn't consider the following: For example, if we have Hero piece horizontally, if we shift it left and right while we can, we would have short x range. However, if we rotate it vertically, and then shift, we have much larger range. Therefore, I fixed this by bringing the lx and rx calculation inside the dir loop (before I had it outside). How did I find such problem? When playing, the resulting state would really often look like this: every row is filled well, with a little amount of holes, but leftmost or rightmost column would almost always be completely empty. This meant that AI agent was having a hard time placing the pieces on the edges. Therefore, the x range for the best possible choice was calculated wrong. 

Now, the results actually look promising, 10 times better results!:

Average score over 1000 games: 9445.19
Average cleared rows over 1000 games: 71.57

Now, we have fixed all major problems (I think?), so now we have two options. Either I improve the AI agent by tinckering with weights or I add some new features to the calculation.

I want to first add maybe a new metrics (improve board state evaluation) and then tincker with all weights at the same time.

What metrics could we add? We already have the aggregated heights, completed lines, holes, and bumpiness.
I have three ideas: 
1. we want to have after every move to have the max heigth as little as possible.
2. we have the next piece preview, so we can do 2 moves and after that evaluate the position.
3. the more rows we complete at the same time, the better, since the score increases exponentially. So we could add metric "AlmostCompleteLines"

first, the easiest to add was max height metric: I set the weight -0.1

Average score over 1000 games: 10072.56
Average cleared rows over 1000 games: 76.17

A slight improvement. However, we haven't given thought to the optimal weights, so we will see in the end what will happen.

second, the 2 move calculation: changed selectBestMove(). However, after doing so, the AI became far worse, so I abandoned this idea. (also, this is going to the beam search teritorry, so I can do it later).

third, I added the almostComplete metric. This is the maximum number of consecutive almost complete rows (almost complete means one block is missing in row), where the missing block are on same x (so we clear multiple rows with one move and gain lots of points). This metrc didn't improve the score, but I will keep it for beam search, since it will be more useful there (since e look multiple move ahead, we can plan for future/make an optimal setup).

Now, I am tinkering with the weights (with better weights, it no longer became possible to have 1000 games, it took too long, so I switched to 100 games): 

The following is the starting weights: return -0.51 * aggregateHeight + 0.76 * completeLines - 0.36 * holes - 0.18 * bumpiness;

After tinkering a lot (and also after I added an optimization: we change the multiplier for maxColumnHeight metric (if maxColumnHeight > 15, then decrease its weight, since we dont want to increase it any more, and would try to fill other places)) I have this:

let w1 = -0.7;
    let w2 = 2;
    let w3 = -0.2;
    let w4 = -0.1;
    let w5 = -0.03;
    if (maxColumnHeight > 15) w5 = -0.4;
    let w6 = 0;

    return w1 * aggregateHeight + 
           w2 * Math.pow(2, completeLines - 1) + 
           w3 * holes + 
           w4 * bumpiness + 
           w5 * maxColumnHeight + 
           w6 * almostCompleteLines;

Average score over 100 games: 57517.00
Average cleared rows over 100 games: 407.64

Now, after tinkering with the weights, and also looking at AI agent play, it seemed that a lot of the times, there was gaps on eirtehr left or right walls. Therefore, I added the WallPenalty metric, which takes the difference between max height and wall heights, and then calculates it. The threshold for it is set 3, since if the diff is more than 3, then we promp the AI agent to fill this hole. After adding this metric, the score became:

Average score over 100 games: 83579.80
Average cleared rows over 100 games: 634.85

Wow. Twice the better results. I am now too tired to continue tinkering with weights and adding more metrics, so I guess time to more on Beam search. I think I spend too much time up until now, so after implementing the BEAM search, I will just use the same metrics.

Well, I started doing the Beam search, but I didn't have enough time. SO, I just have the code (currently not good results, not sure why, couldn't find whats wrong). So I won't include it, but the potential is there: We will look ahead to future moves (have queue with next pieces) and also simulate the row clears (since if we don't it will pile up after several moves). Ideally, I would use all the metrics including the metric almostCompleteLines that I added.
