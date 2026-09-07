// 48-space board, all locations genuinely in Andhra Pradesh. Layout mirrors
// the well-tested classic property-trading board shape (same space-type
// sequence and price scaling curve), just re-themed end to end with AP
// geography and rupee pricing -- no Monopoly names, art, or branding reused.

const BOARD_SIZE = 48;

const GROUPS = [
  {
    id: "north-coastal",
    label: "North Coastal Andhra",
    color: "#8b5a2b",
    price: 6000,
    rent: [550, 1650, 4950, 15400, 19800, 24200],
    houseCost: 5000,
    mortgage: 3000,
    towns: ["Srikakulam", "Vizianagaram"],
  },
  {
    id: "uttarandhra",
    label: "Uttarandhra",
    color: "#6fb3e0",
    price: 10000,
    rent: [880, 2200, 6600, 20900, 25300, 30800],
    houseCost: 5000,
    mortgage: 5000,
    towns: ["Visakhapatnam", "Anakapalli", "Narsipatnam"],
  },
  {
    id: "godavari-coastal",
    label: "Godavari Coastal",
    color: "#c76bb3",
    price: 14000,
    rent: [1320, 3080, 8800, 23100, 28600, 34100],
    houseCost: 10000,
    mortgage: 7000,
    towns: ["Kakinada", "Rajahmundry", "Amalapuram"],
  },
  {
    id: "west-godavari",
    label: "West Godavari",
    color: "#e8934a",
    price: 18000,
    rent: [1540, 3520, 9900, 25300, 31900, 39600],
    houseCost: 10000,
    mortgage: 9000,
    towns: ["Eluru", "Bhimavaram", "Tadepalligudem"],
  },
  {
    id: "krishna",
    label: "Krishna Delta",
    color: "#d9453f",
    price: 22000,
    rent: [1760, 3960, 11000, 27500, 34100, 42900],
    houseCost: 15000,
    mortgage: 11000,
    towns: ["Vijayawada", "Machilipatnam", "Gudivada"],
  },
  {
    id: "guntur-prakasam",
    label: "Guntur-Prakasam",
    color: "#e8c94a",
    price: 26000,
    rent: [1980, 4400, 12100, 29700, 36300, 46200],
    houseCost: 15000,
    mortgage: 13000,
    towns: ["Bapatla", "Guntur", "Tenali", "Ongole"],
  },
  {
    id: "nellore-region",
    label: "Nellore Region",
    color: "#3fb968",
    price: 30000,
    rent: [2200, 4840, 13200, 30800, 37400, 49500],
    houseCost: 20000,
    mortgage: 15000,
    towns: ["Nellore", "Kavali", "Narasaraopet", "Gudur"],
  },
  {
    id: "rayalaseema",
    label: "Rayalaseema",
    color: "#7168d8",
    price: 36000,
    rent: [3300, 7700, 19800, 38500, 44000, 66000],
    houseCost: 20000,
    mortgage: 18000,
    towns: ["Tirupati", "Kadapa", "Srikalahasti", "Madanapalle"],
  },
];

const TRANSPORT_NAMES = ["Kurnool", "Renigunta", "Anantapur", "Chittoor", "Proddatur"];
const UTILITY_NAMES = ["Hindupur", "Rajampet", "Dharmavaram"];

const EVENT_CARDS = [
  { text: "New expressway opens near you. Collect ₹5,000.", type: "collect", amount: 5000 },
  { text: "Road toll audit. Pay ₹2,000.", type: "pay", amount: 2000 },
  { text: "Advance to Andhra Start. Collect ₹20,000.", type: "advance-to", pos: 0 },
  { text: "Go directly to Traffic Halt.", type: "go-to-jail" },
  { text: "Get out of Traffic Halt free -- keep this card until needed.", type: "get-out-of-jail" },
  { text: "Move back 3 spaces.", type: "move-back", amount: 3 },
  { text: "Repairs on all your developments. Pay ₹1,000 per house, ₹3,000 per hotel.", type: "repairs", perHouse: 1000, perHotel: 3000 },
  { text: "Festival bonus! Collect ₹10,000.", type: "collect", amount: 10000 },
  { text: "Jagan became CM -- cabinet reshuffle chaos. Move back 4 spaces.", type: "move-back", amount: 4 },
  { text: "Chandrababu promises a shiny new capital. Advance to Andhra Start and collect ₹20,000.", type: "advance-to", pos: 0 },
  { text: "NTR's classic gets re-released in cinemas. Collect ₹8,000 in nostalgia ticket sales.", type: "collect", amount: 8000 },
  { text: "Pawan Kalyan's fans fill the street on day one. Pay ₹3,000 -- you're stuck in traffic.", type: "pay", amount: 3000 },
  { text: "Election season freebies! Collect ₹6,000.", type: "collect", amount: 6000 },
  { text: "Amaravati construction delayed yet again. Pay ₹4,000 in cost overruns.", type: "pay", amount: 4000 },
  { text: "Cyclone warning off the coast. Pay ₹3,500 for emergency supplies.", type: "pay", amount: 3500 },
  { text: "Tirupati laddu demand hits a record high. Collect ₹5,000 selling extras.", type: "collect", amount: 5000 },
  { text: "Ugadi pachadi reminds everyone life mixes sweet and bitter. Get out of Traffic Halt free.", type: "get-out-of-jail" },
  { text: "Vizag Steel Plant protests shut the highway. Move back 3 spaces.", type: "move-back", amount: 3 },
];

const COMMUNITY_CARDS = [
  { text: "Harvest season. Collect ₹8,000.", type: "collect", amount: 8000 },
  { text: "Medical bill. Pay ₹3,000.", type: "pay", amount: 3000 },
  { text: "Rains arrive early. Collect ₹2,000.", type: "collect", amount: 2000 },
  { text: "Road expansion project. Pay ₹1,500.", type: "pay", amount: 1500 },
  { text: "Go directly to Traffic Halt.", type: "go-to-jail" },
  { text: "Get out of Traffic Halt free -- keep this card until needed.", type: "get-out-of-jail" },
  { text: "Local award. Collect ₹15,000.", type: "collect", amount: 15000 },
  { text: "School fees due. Pay ₹4,000 per player.", type: "pay-each", amount: 4000 },
];

// 4 corners (GO, Jail, Free Parking, Go-to-Jail) + 11 positions per side.
function buildSpaces() {
  const spaces = new Array(BOARD_SIZE);

  spaces[0] = { pos: 0, type: "go", name: "Andhra Start" };
  spaces[4] = { pos: 4, type: "tax", name: "Road Expansion Tax", amount: 40000 };
  spaces[12] = { pos: 12, type: "jail", name: "Traffic Halt" };
  spaces[24] = { pos: 24, type: "free-parking", name: "Temple Rest Stop" };
  spaces[36] = { pos: 36, type: "go-to-jail", name: "Roadblock! Go to Traffic Halt" };
  spaces[46] = { pos: 46, type: "tax", name: "Festival Levy", amount: 20000 };

  for (const pos of [2, 11, 39, 45]) spaces[pos] = { pos, type: "community", name: "Community" };
  for (const pos of [7, 18, 30, 47]) spaces[pos] = { pos, type: "event", name: "Event" };

  const transportPositions = [5, 10, 21, 33, 43];
  transportPositions.forEach((pos, i) => {
    spaces[pos] = {
      pos,
      type: "transport",
      name: TRANSPORT_NAMES[i],
      price: 10000,
      mortgage: 5000,
    };
  });

  const utilityPositions = [15, 27, 41];
  utilityPositions.forEach((pos, i) => {
    spaces[pos] = {
      pos,
      type: "utility",
      name: UTILITY_NAMES[i],
      price: 8000,
      mortgage: 4000,
    };
  });

  const propertyPositions = [
    1, 3, 6, 8, 9, 13, 14, 16, 17, 19, 20, 22, 23, 25, 26, 28, 29, 31, 32, 34, 35, 37, 38, 40, 42, 44,
  ];
  let cursor = 0;

  GROUPS.forEach((group) => {
    group.towns.forEach((town) => {
      const pos = propertyPositions[cursor++];
      spaces[pos] = {
        pos,
        type: "property",
        name: town,
        group: group.id,
        price: group.price,
        rent: group.rent,
        houseCost: group.houseCost,
        mortgage: group.mortgage,
      };
    });
  });

  return spaces;
}

const SPACES = buildSpaces();

function groupPositions(groupId) {
  return SPACES.filter((s) => s.type === "property" && s.group === groupId).map((s) => s.pos);
}

module.exports = {
  BOARD_SIZE,
  SPACES,
  GROUPS,
  EVENT_CARDS,
  COMMUNITY_CARDS,
  groupPositions,
  // Tuned so games actually converge to a winner: the old
  // 150k-starting-cash / 20k-GO-salary combo let cash accumulate far
  // faster than rent could ever drain it -- simulated games routinely ran
  // 15,000+ turns without a single bankruptcy. This combo (verified by
  // simulation) reliably finishes in the low hundreds of turns for both
  // 4-player and 7-player games.
  STARTING_CASH: 100000,
  GO_SALARY: 8000,
  JAIL_POSITION: 12,
  JAIL_FINE: 10000,
  MAX_JAIL_TURNS: 3,
};
