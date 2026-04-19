const BASE = 'http://localhost:3001/api';

export const fetchVessels = (bounds) => {
  const params = bounds
    ? `?minLat=${bounds.minLat}&maxLat=${bounds.maxLat}&minLng=${bounds.minLng}&maxLng=${bounds.maxLng}`
    : '';
  return fetch(`${BASE}/vessels${params}`).then((r) => r.json());
};

export const fetchVessel = (mmsi) =>
  fetch(`${BASE}/vessels/${mmsi}`).then((r) => r.json());

export const fetchStats = () =>
  fetch(`${BASE}/stats`).then((r) => r.json());
