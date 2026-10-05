export function emptyProductionCounts() {
  return { hygienePairs: 0, finalizationPairs: 0, finalizationFeet: 0, paintingPairs: 0, completedProductions: 0 };
}

export function addProductionCount(counts: ReturnType<typeof emptyProductionCounts>, process: string, unit: string) {
  counts.completedProductions++;
  if (process === "Higienização" && unit === "PAIR") counts.hygienePairs++;
  if (process === "Finalização") {
    if (unit === "PAIR") counts.finalizationPairs++;
    else if (unit === "LEFT_FOOT" || unit === "RIGHT_FOOT") counts.finalizationFeet++;
  }
  if (process === "Pintura" && unit === "PAIR") counts.paintingPairs++;
}
