// 40-space board, all locations genuinely in Andhra Pradesh. Layout mirrors
// the well-tested classic property-trading board shape (same space-type
// sequence and price scaling curve), just re-themed end to end with AP
// geography and rupee pricing -- no Monopoly names, art, or branding reused.

const GROUPS = [
  {
    id: "north-coastal",
    label: "North Coastal Andhra",
    color: "#8b5a2b",
    price: 6000,
    rent: [250, 750, 2250, 7000, 9000, 11000],
    houseCost: 5000,
    mortgage: 3000,
    towns: ["Srikakulam", "Vizianagaram"],
  },
  {
    id: "uttarandhra",
    label: "Uttarandhra",
    color: "#6fb3e0",
    price: 10000,
    rent: [400, 1000, 3000, 9500, 11500, 14000],
    houseCost: 5000,
    mortgage: 5000,
    towns: ["Visakhapatnam", "Anakapalli", "Narsipatnam"],
  },
  {
    id: "godavari-coastal",
    label: "Godavari Coastal",
    color: "#c76bb3",
    price: 14000,
    rent: [600, 1400, 4000, 10500, 13000, 15500],
    houseCost: 10000,
    mortgage: 7000,
    towns: ["Kakinada", "Rajahmundry", "Amalapuram"],
  },
  {
    id: "west-godavari",
    label: "West Godavari",
    color: "#e8934a",
    price: 18000,
    rent: [700, 1600, 4500, 11500, 14500, 18000],
    houseCost: 10000,
    mortgage: 9000,
    towns: ["Eluru", "Bhimavaram", "Tadepalligudem"],
  },
  {
    id: "krishna",
    label: "Krishna Delta",
    color: "#d9453f",
    price: 22000,
    rent: [800, 1800, 5000, 12500, 15500, 19500],
    houseCost: 15000,
    mortgage: 11000,
    towns: ["Vijayawada", "Machilipatnam", "Gudivada"],
  },
  {
    id: "guntur-prakasam",
    label: "Guntur-Prakasam",
    color: "#e8c94a",
    price: 26000,
    rent: [900, 2000, 5500, 13500, 16500, 21000],
    houseCost: 15000,
    mortgage: 13000,
    towns: ["Guntur", "Tenali", "Ongole"],
  },
  {
    id: "nellore-region",
    label: "Nellore Region",
    color: "#3fb968",
    price: 30000,
    rent: [1000, 2200, 6000, 14000, 17000, 22500],
    houseCost: 20000,
    mortgage: 15000,
    towns: ["Nellore", "Kavali", "Narasaraopet"],
  },
  {
    id: "rayalaseema",
    label: "Rayalaseema",
    color: "#7168d8",
    price: 36000,
    rent: [1500, 3500, 9000, 17500, 20000, 30000],
    houseCost: 20000,
    mortgage: 18000,
    towns: ["Tirupati", "Kadapa"],
  },
];

const TRANSPORT_NAMES = ["Kurnool", "Anantapur", "Chittoor", "Proddatur"];
const UTILITY_NAMES = ["Hindupur", "Rajampet"];

const EVENT_CARDS = [
  { text: "New expressway opens near you. Collect ₹5,000.", type: "collect", amount: 5000 },
  { text: "Road toll audit. Pay ₹2,000.", type: "pay", amount: 2000 },
  { text: "Advance to Andhra Start. Collect ₹20,000.", type: "advance-to", pos: 0 },
  { text: "Go directly to Traffic Halt.", type: "go-to-jail" },
  { text: "Get out of Traffic Halt free -- keep this card until needed.", type: "get-out-of-jail" },
  { text: "Move back 3 spaces.", type: "move-back", amount: 3 },
  { text: "Repairs on all your developments. Pay ₹1,000 per house, ₹3,000 per hotel.", type: "repairs", perHouse: 1000, perHotel: 3000 },
  { text: "Festival bonus! Collect ₹10,000.", type: "collect", amount: 10000 },
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

function buildSpaces() {
  const spaces = new Array(40);

  spaces[0] = { pos: 0, type: "go", name: "Andhra Start" };
  spaces[4] = { pos: 4, type: "tax", name: "Road Expansion Tax", amount: 20000 };
  spaces[10] = { pos: 10, type: "jail", name: "Traffic Halt" };
  spaces[20] = { pos: 20, type: "free-parking", name: "Temple Rest Stop" };
  spaces[30] = { pos: 30, type: "go-to-jail", name: "Roadblock! Go to Traffic Halt" };
  spaces[38] = { pos: 38, type: "tax", name: "Festival Levy", amount: 10000 };

  for (const pos of [2, 17, 33]) spaces[pos] = { pos, type: "community", name: "Community" };
  for (const pos of [7, 22, 36]) spaces[pos] = { pos, type: "event", name: "Event" };

  const transportPositions = [5, 15, 25, 35];
  transportPositions.forEach((pos, i) => {
    spaces[pos] = {
      pos,
      type: "transport",
      name: TRANSPORT_NAMES[i],
      price: 10000,
      mortgage: 5000,
    };
  });

  const utilityPositions = [12, 28];
  utilityPositions.forEach((pos, i) => {
    spaces[pos] = {
      pos,
      type: "utility",
      name: UTILITY_NAMES[i],
      price: 8000,
      mortgage: 4000,
    };
  });

  const propertyPositions = [1, 3, 6, 8, 9, 11, 13, 14, 16, 18, 19, 21, 23, 24, 26, 27, 29, 31, 32, 34, 37, 39];
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
  SPACES,
  GROUPS,
  EVENT_CARDS,
  COMMUNITY_CARDS,
  groupPositions,
  STARTING_CASH: 150000,
  GO_SALARY: 20000,
  JAIL_POSITION: 10,
  JAIL_FINE: 10000,
  MAX_JAIL_TURNS: 3,
};
