const MID_MAP = {
  // North America
  '366': { name: 'United States (USA)', flag: '🇺🇸' },
  '367': { name: 'United States (USA)', flag: '🇺🇸' },
  '368': { name: 'United States (USA)', flag: '🇺🇸' },
  '369': { name: 'United States (USA)', flag: '🇺🇸' },
  '316': { name: 'Canada (CAN)', flag: '🇨🇦' },
  '308': { name: 'Bermuda (BMU)', flag: '🇧🇲' },
  '309': { name: 'Bermuda (BMU)', flag: '🇧🇲' },
  '319': { name: 'Cayman Islands (CYM)', flag: '🇰🇾' },
  // Europe
  '232': { name: 'United Kingdom (GBR)', flag: '🇬🇧' },
  '233': { name: 'United Kingdom (GBR)', flag: '🇬🇧' },
  '234': { name: 'United Kingdom (GBR)', flag: '🇬🇧' },
  '235': { name: 'United Kingdom (GBR)', flag: '🇬🇧' },
  '211': { name: 'Germany (DEU)', flag: '🇩🇪' },
  '227': { name: 'France (FRA)', flag: '🇫🇷' },
  '228': { name: 'France (FRA)', flag: '🇫🇷' },
  '244': { name: 'Netherlands (NLD)', flag: '🇳🇱' },
  '245': { name: 'Netherlands (NLD)', flag: '🇳🇱' },
  '246': { name: 'Netherlands (NLD)', flag: '🇳🇱' },
  '257': { name: 'Norway (NOR)', flag: '🇳🇴' },
  '258': { name: 'Norway (NOR)', flag: '🇳🇴' },
  '259': { name: 'Norway (NOR)', flag: '🇳🇴' },
  '205': { name: 'Belgium (BEL)', flag: '🇧🇪' },
  '215': { name: 'Malta (MLT)', flag: '🇲🇹' },
  '219': { name: 'Denmark (DNK)', flag: '🇩🇰' },
  '224': { name: 'Spain (ESP)', flag: '🇪🇸' },
  '247': { name: 'Italy (ITA)', flag: '🇮🇹' },
  '273': { name: 'Russia (RUS)', flag: '🇷🇺' },
  '329': { name: 'Gibraltar (GIB)', flag: '🇬🇮' },
  // Asia
  '412': { name: 'China (CHN)', flag: '🇨🇳' },
  '413': { name: 'China (CHN)', flag: '🇨🇳' },
  '414': { name: 'China (CHN)', flag: '🇨🇳' },
  '419': { name: 'India (IND)', flag: '🇮🇳' },
  '563': { name: 'Singapore (SGP)', flag: '🇸🇬' },
  '564': { name: 'Singapore (SGP)', flag: '🇸🇬' },
  '565': { name: 'Singapore (SGP)', flag: '🇸🇬' },
  '566': { name: 'Singapore (SGP)', flag: '🇸🇬' },
  '431': { name: 'Japan (JPN)', flag: '🇯🇵' },
  '432': { name: 'Japan (JPN)', flag: '🇯🇵' },
  '440': { name: 'South Korea (KOR)', flag: '🇰🇷' },
  '441': { name: 'South Korea (KOR)', flag: '🇰🇷' },
  // Oceania
  '503': { name: 'Australia (AUS)', flag: '🇦🇺' },
  // Open Registries / Flag of Convenience
  '311': { name: 'Bahamas (BHS)', flag: '🇧🇸' },
  '351': { name: 'Panama (PAN)', flag: '🇵🇦' },
  '352': { name: 'Panama (PAN)', flag: '🇵🇦' },
  '353': { name: 'Panama (PAN)', flag: '🇵🇦' },
  '354': { name: 'Panama (PAN)', flag: '🇵🇦' },
  '355': { name: 'Panama (PAN)', flag: '🇵🇦' },
  '356': { name: 'Panama (PAN)', flag: '🇵🇦' },
  '357': { name: 'Panama (PAN)', flag: '🇵🇦' },
  '370': { name: 'Panama (PAN)', flag: '🇵🇦' },
  '371': { name: 'Panama (PAN)', flag: '🇵🇦' },
  '372': { name: 'Panama (PAN)', flag: '🇵🇦' },
  '373': { name: 'Panama (PAN)', flag: '🇵🇦' },
  '374': { name: 'Panama (PAN)', flag: '🇵🇦' },
  '538': { name: 'Marshall Islands (MHL)', flag: '🇲🇭' },
  '636': { name: 'Liberia (LBR)', flag: '🇱🇷' },
};

export function getVesselCountry(mmsi) {
  const mmsiStr = String(mmsi || '');
  if (mmsiStr.startsWith('99')) {
    // Simulated vessels: assign a deterministic country so they look diverse and real
    const simulatedCountries = [
      { name: 'United States (USA)', flag: '🇺🇸' },
      { name: 'United Kingdom (GBR)', flag: '🇬🇧' },
      { name: 'Singapore (SGP)', flag: '🇸🇬' },
      { name: 'Netherlands (NLD)', flag: '🇳🇱' },
      { name: 'Panama (PAN)', flag: '🇵🇦' },
      { name: 'Norway (NOR)', flag: '🇳🇴' },
      { name: 'Japan (JPN)', flag: '🇯🇵' },
      { name: 'Canada (CAN)', flag: '🇨🇦' },
      { name: 'Liberia (LBR)', flag: '🇱🇷' },
      { name: 'Marshall Islands (MHL)', flag: '🇲🇭' },
    ];
    const index = Number(mmsiStr.slice(-2)) || 0;
    return simulatedCountries[index % simulatedCountries.length];
  }

  const mid = mmsiStr.slice(0, 3);
  return MID_MAP[mid] || { name: 'Unknown Flag', flag: '🏳️' };
}
