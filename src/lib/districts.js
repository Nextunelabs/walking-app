/** Approximate district headquarters, used only to suggest a reference route. */
export const KERALA_DISTRICTS = [
  { name: "Thiruvananthapuram", latitude: 8.5241, longitude: 76.9366 },
  { name: "Kollam", latitude: 8.8932, longitude: 76.6141 },
  { name: "Pathanamthitta", latitude: 9.2648, longitude: 76.787 },
  { name: "Alappuzha", latitude: 9.4981, longitude: 76.3388 },
  { name: "Kottayam", latitude: 9.5916, longitude: 76.5222 },
  { name: "Idukki", latitude: 9.8494, longitude: 76.9703 },
  { name: "Ernakulam", latitude: 9.9312, longitude: 76.2673 },
  { name: "Thrissur", latitude: 10.5276, longitude: 76.2144 },
  { name: "Palakkad", latitude: 10.7867, longitude: 76.6548 },
  { name: "Malappuram", latitude: 11.051, longitude: 76.0711 },
  { name: "Kozhikode", latitude: 11.2588, longitude: 75.7804 },
  { name: "Wayanad", latitude: 11.6854, longitude: 76.132 },
  { name: "Kannur", latitude: 11.8745, longitude: 75.3704 },
  { name: "Kasaragod", latitude: 12.4996, longitude: 74.9869 },
];

const byName = new Map(KERALA_DISTRICTS.map((district) => [district.name, district]));

export function districtNames() {
  return KERALA_DISTRICTS.map((district) => district.name);
}

export function findDistrict(name) {
  return byName.get(String(name || "")) || null;
}

export function isDistrict(name) {
  return byName.has(String(name || ""));
}
