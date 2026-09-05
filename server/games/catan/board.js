// Hex/vertex/edge graph model for a standard-layout Catan board (19 tiles,
// 3 rings). Everything else (placement validation, longest road, rendering)
// is built on top of the ids and adjacency maps generated here, instead of
// hardcoding coordinates per component.
//
// Hexes use axial coordinates {q, r}. Vertices and edges are derived by
// computing each hex's 6 corner positions in "pixel" space and deduping by
// rounded position -- two hexes that share a corner produce the same
// vertex id, two that share an edge produce the same edge id.

const HEX_SIZE = 1; // arbitrary unit; the client scales this for rendering.
const RING_RADIUS = 2; // 2 rings around the center = 19 hexes.

const RESOURCE_TYPES = ["cattle", "cement", "timber", "grain", "steel"];

// Standard Catan tile counts for a 19-tile board.
const TILE_BAG = [
  "desert",
  ...Array(4).fill("timber"),
  ...Array(4).fill("grain"),
  ...Array(4).fill("cattle"),
  ...Array(3).fill("cement"),
  ...Array(3).fill("steel"),
];

// Standard number token set (18 tokens for the 18 non-desert tiles).
const NUMBER_BAG = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

// 9 standard port slots: 4 generic (3:1) + 5 specific (2:1), one per resource.
const PORT_BAG = [
  "3:1",
  "3:1",
  "3:1",
  "3:1",
  "cattle",
  "cement",
  "timber",
  "grain",
  "steel",
];

function shuffle(array, rng) {
  const copy = [...array];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function hexKey(q, r) {
  return `${q},${r}`;
}

function round(n) {
  // Collapses float noise so two hexes' shared corners land on the exact
  // same key.
  return Math.round(n * 1000) / 1000;
}

function hexCenter(q, r) {
  const x = HEX_SIZE * ((3 / 2) * q);
  const y = HEX_SIZE * ((Math.sqrt(3) / 2) * q + Math.sqrt(3) * r);
  return { x, y };
}

// Flat-top hexagon: corners at 0, 60, 120, 180, 240, 300 degrees.
function hexCorner(center, index) {
  const angleDeg = 60 * index;
  const angleRad = (Math.PI / 180) * angleDeg;
  return {
    x: round(center.x + HEX_SIZE * Math.cos(angleRad)),
    y: round(center.y + HEX_SIZE * Math.sin(angleRad)),
  };
}

function vertexKey(point) {
  return `${point.x},${point.y}`;
}

function generateHexCoords() {
  const coords = [];

  for (let q = -RING_RADIUS; q <= RING_RADIUS; q++) {
    for (let r = -RING_RADIUS; r <= RING_RADIUS; r++) {
      const s = -q - r;
      if (Math.abs(q) <= RING_RADIUS && Math.abs(r) <= RING_RADIUS && Math.abs(s) <= RING_RADIUS) {
        coords.push({ q, r });
      }
    }
  }

  return coords;
}

/**
 * Builds the static graph: hexes, vertices, edges, and every adjacency map
 * placement/production/longest-road logic needs. This shape never changes
 * between games -- only which resource/number/port goes where does.
 */
function buildGraph() {
  const hexCoords = generateHexCoords();

  const hexes = {}; // hexId -> { id, q, r, center, cornerVertexIds: [6] }
  const vertices = {}; // vertexId -> { id, x, y, hexIds: Set, edgeIds: Set, adjacentVertexIds: Set }
  const edges = {}; // edgeId -> { id, vertexIds: [2], hexIds: Set }

  const ensureVertex = (point) => {
    const id = vertexKey(point);
    if (!vertices[id]) {
      vertices[id] = {
        id,
        x: point.x,
        y: point.y,
        hexIds: new Set(),
        edgeIds: new Set(),
        adjacentVertexIds: new Set(),
      };
    }
    return vertices[id];
  };

  const ensureEdge = (vA, vB) => {
    const [first, second] = [vA.id, vB.id].sort();
    const id = `${first}|${second}`;
    if (!edges[id]) {
      edges[id] = { id, vertexIds: [first, second], hexIds: new Set() };
    }
    return edges[id];
  };

  for (const { q, r } of hexCoords) {
    const hexId = hexKey(q, r);
    const center = hexCenter(q, r);
    const corners = Array.from({ length: 6 }, (_, i) => hexCorner(center, i));
    const cornerVertexIds = corners.map((corner) => {
      const vertex = ensureVertex(corner);
      vertex.hexIds.add(hexId);
      return vertex.id;
    });

    for (let i = 0; i < 6; i++) {
      const a = vertices[cornerVertexIds[i]];
      const b = vertices[cornerVertexIds[(i + 1) % 6]];
      const edge = ensureEdge(a, b);
      edge.hexIds.add(hexId);
      a.edgeIds.add(edge.id);
      b.edgeIds.add(edge.id);
      a.adjacentVertexIds.add(b.id);
      b.adjacentVertexIds.add(a.id);
    }

    hexes[hexId] = { id: hexId, q, r, center, cornerVertexIds };
  }

  // Coastal edges (belong to only one hex) are candidates for ports. Pick a
  // deterministic, evenly-spaced subset of 9 of them in walk order around
  // the perimeter so ports don't cluster together.
  const coastalEdgeIds = Object.values(edges)
    .filter((edge) => edge.hexIds.size === 1)
    .map((edge) => edge.id);

  return {
    hexes,
    vertices,
    edges,
    coastalEdgeIds,
  };
}

// The graph shape is identical for every game -- compute it once.
const GRAPH = buildGraph();

function pickPortEdges(graph, rng) {
  // Walk the coastal edges in a consistent perimeter order (by angle around
  // the board center) and take every Nth one so ports are spread out.
  const withAngle = graph.coastalEdgeIds.map((edgeId) => {
    const edge = graph.edges[edgeId];
    const [aId, bId] = edge.vertexIds;
    const a = graph.vertices[aId];
    const b = graph.vertices[bId];
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    return { edgeId, angle: Math.atan2(midY, midX) };
  });

  withAngle.sort((a, b) => a.angle - b.angle);

  const step = withAngle.length / PORT_BAG.length;
  const chosen = [];

  for (let i = 0; i < PORT_BAG.length; i++) {
    const index = Math.floor(i * step);
    chosen.push(withAngle[index].edgeId);
  }

  const portTypes = shuffle(PORT_BAG, rng);

  const ports = {}; // edgeId -> portType

  chosen.forEach((edgeId, i) => {
    ports[edgeId] = portTypes[i];
  });

  return ports;
}

/**
 * Generates a fresh randomized board: which resource/number goes on each
 * hex, and which port sits on which coastal edge. Uses the caller-supplied
 * rng (server-side Math.random by default) so this can never be influenced
 * by a client.
 */
function generateBoard(rng = Math.random) {
  const hexIds = Object.keys(GRAPH.hexes);

  const tiles = shuffle(TILE_BAG, rng);
  const numbers = shuffle(NUMBER_BAG, rng);

  const hexState = {};
  let numberCursor = 0;
  let robberHexId = null;

  // Avoid two 6/8 tiles touching each other (standard Catan setup rule) by
  // retrying the assignment a bounded number of times.
  for (let attempt = 0; attempt < 200; attempt++) {
    const shuffledTiles = attempt === 0 ? tiles : shuffle(TILE_BAG, rng);
    const shuffledNumbers = attempt === 0 ? numbers : shuffle(NUMBER_BAG, rng);

    const candidate = {};
    numberCursor = 0;
    let ok = true;

    for (const hexId of hexIds) {
      const resource = shuffledTiles[hexIds.indexOf(hexId)];
      const number = resource === "desert" ? null : shuffledNumbers[numberCursor++];
      candidate[hexId] = { resource, number };
    }

    for (const hexId of hexIds) {
      const { number } = candidate[hexId];
      if (number !== 6 && number !== 8) continue;

      const hex = GRAPH.hexes[hexId];
      const neighborOffsets = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, -1],
        [-1, 1],
      ];

      for (const [dq, dr] of neighborOffsets) {
        const neighborId = hexKey(hex.q + dq, hex.r + dr);
        const neighbor = candidate[neighborId];
        if (neighbor && (neighbor.number === 6 || neighbor.number === 8)) {
          ok = false;
          break;
        }
      }

      if (!ok) break;
    }

    if (ok) {
      Object.assign(hexState, candidate);
      break;
    }

    if (attempt === 199) {
      // Give up avoiding adjacency after enough tries; still a valid board.
      Object.assign(hexState, candidate);
    }
  }

  for (const hexId of hexIds) {
    if (hexState[hexId].resource === "desert") {
      robberHexId = hexId;
      break;
    }
  }

  const ports = pickPortEdges(GRAPH, rng);

  return { hexes: hexState, robberHexId, ports };
}

function verticesTouchingHex(hexId) {
  return GRAPH.hexes[hexId].cornerVertexIds;
}

function hexesTouchingVertex(vertexId) {
  return [...GRAPH.vertices[vertexId].hexIds];
}

function edgesAtVertex(vertexId) {
  return [...GRAPH.vertices[vertexId].edgeIds];
}

function adjacentVertices(vertexId) {
  return [...GRAPH.vertices[vertexId].adjacentVertexIds];
}

function edgeVertices(edgeId) {
  return GRAPH.edges[edgeId].vertexIds;
}

module.exports = {
  RESOURCE_TYPES,
  GRAPH,
  generateBoard,
  verticesTouchingHex,
  hexesTouchingVertex,
  edgesAtVertex,
  adjacentVertices,
  edgeVertices,
  hexKey,
};
