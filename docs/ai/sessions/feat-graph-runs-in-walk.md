## The project's node graph runs while you walk (ledger N1462 / N1469, slice G)
- useWalkGraph runs the same graph runtime RawViewport uses (document clock, createNodeGraphContext, frame memory); one owner at a time, rAF cancelled on leaving the walk.
- WalkGraphLayer (lazy) mounts beside LiveProjectScene only when the project has nodes, and shows each Text node's content so a Timer is seen counting.
- A project with no nodes mounts nothing new: it walks as before.
- Tests: useWalkGraph.test.jsx (timer ticks, rAF cancelled on leave, second surface stays quiet).
- Not tested: a phone (owed); the walk with a graph that draws spatial nodes (hasGraph path still shows RawViewport, not the walk).
