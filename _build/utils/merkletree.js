//      

const { mimc7 } = require('circomlib')

class MerkleTree {
  /*  Creates an optimized MerkleTree with `treeDepth` depth,
   *  of which are initialized with the initial value `zeroValue`.
   *
   *  i.e. the 0th level is initialized with `zeroValue`,
   *       and the 1st level is initialized with
   *       hashLeftRight(`zeroValue`, `zeroValue`)
   */
  constructor (depth        , zeroValue        ) {
    this.depth = depth
    this.zeroValue = zeroValue
    this.leafs = []
    this.leafNumber = Math.pow(2, depth)

    this.zeros = {
      0: zeroValue
    }
    this.filledSubtrees = {
      0: zeroValue
    }
    this.filledPaths = {
      0: {}
    }

    for (let i = 1; i < depth; i++) {
      this.zeros[i] = this.hashLeftRight(this.zeros[i - 1], this.zeros[i - 1])
      this.filledSubtrees[i] = this.zeros[i]
      this.filledPaths[i] = {}
    }

    this.root = this.hashLeftRight(
      this.zeros[this.depth - 1],
      this.zeros[this.depth - 1]
    )

    this.nextIndex = 0
  }

  /*  Helper function to hash the left and right values
   *  of the leafs
   */
  hashLeftRight (left        , right        )         {
    return mimc7.multiHash([left, right])
  }

  /* Inserts a new value into the merkle tree */
  insert (leaf        ) {
    let curIdx = this.nextIndex
    this.nextIndex += 1

    let currentLevelHash = leaf
    let left
    let right

    for (let i = 0; i < this.depth; i++) {
      if (curIdx % 2 === 0) {
        left = currentLevelHash
        right = this.zeros[i]

        this.filledSubtrees[i] = currentLevelHash

        this.filledPaths[i][curIdx] = left
        this.filledPaths[i][curIdx + 1] = right
      } else {
        left = this.filledSubtrees[i]
        right = currentLevelHash

        this.filledPaths[i][curIdx - 1] = left
        this.filledPaths[i][curIdx] = right
      }

      currentLevelHash = this.hashLeftRight(left, right)
      curIdx = parseInt(curIdx / 2)
    }

    this.root = currentLevelHash
    this.leafs.push(leaf)
  }

  /* Updates merkletree leaf at `leafIndex` with `newLeafValue` */
  update (leafIndex        , newLeafValue        ) {
    if (leafIndex >= this.nextIndex) {
      throw new Error("Can't update leafIndex which hasn't been inserted yet!")
    }

    // eslint-disable-next-line no-unused-vars
    const [path, _] = this.getPath(leafIndex)

    this._update(
      leafIndex,
      newLeafValue,
      path
    )
  }

  /*  _Verbose_ API to update the value of the leaf in the current tree.
   *  The reason why its so verbose is because I wanted to maintain compatibility
   *  with the merkletree smart contract obtained from semaphore.
   *  (https://github.com/kobigurk/semaphore/blob/2933bce0e41c6d4df82b444b66b4e84793c90893/semaphorejs/contracts/MerkleTreeLib.sol)
   *  It is also very expensive to update if we do it naively on the EVM
   */
  _update (
    leafIndex        ,
    leaf        ,
    path               
  ) {
    if (leafIndex >= this.nextIndex) {
      throw new Error("Can't update leafIndex which hasn't been inserted yet!")
    }

    let curIdx = leafIndex
    let currentLevelHash = this.leafs[leafIndex]
    let left
    let right

    for (let i = 0; i < this.depth; i++) {
      if (curIdx % 2 === 0) {
        left = currentLevelHash
        right = path[i]
      } else {
        left = path[i]
        right = currentLevelHash
      }

      currentLevelHash = this.hashLeftRight(left, right)
      curIdx = parseInt(curIdx / 2)
    }

    if (this.root !== currentLevelHash) {
      throw new Error('MerkleTree: tree root / current level has mismatch')
    }

    curIdx = leafIndex
    currentLevelHash = leaf

    for (let i = 0; i < this.depth; i++) {
      if (curIdx % 2 === 0) {
        left = currentLevelHash
        right = path[i]

        this.filledPaths[i][curIdx] = left
        this.filledPaths[i][curIdx + 1] = right
      } else {
        left = path[i]
        right = currentLevelHash

        this.filledPaths[i][curIdx - 1] = left
        this.filledPaths[i][curIdx] = right
      }

      currentLevelHash = this.hashLeftRight(left, right)
      curIdx = parseInt(curIdx / 2)
    }

    this.root = currentLevelHash
    this.leafs[leafIndex] = leaf
  }

  /*  Gets the path needed to construct a the tree root
   *  Used for quick verification on updates.
   *  Runs in O(log(N)), where N is the number of leafs
   */
  getPath (leafIndex        )                                 {
    if (leafIndex >= this.nextIndex) {
      throw new Error('Path not constructed yet, leafIndex >= nextIndex')
    }

    let curIdx = leafIndex
    const path = []
    const pathPos = []

    for (let i = 0; i < this.depth; i++) {
      if (curIdx % 2 === 0) {
        path.push(this.filledPaths[i][curIdx + 1])
        pathPos.push(0)
      } else {
        path.push(this.filledPaths[i][curIdx - 1])
        pathPos.push(1)
      }
      curIdx = parseInt(curIdx / 2)
    }

    return [path, pathPos]
  }
}

// Helper function to abstract away `new` keyword for API
const createMerkleTree = (
  treeDepth        ,
  zeroValue        
)             => new MerkleTree(treeDepth, zeroValue)

module.exports = {
  createMerkleTree
}
