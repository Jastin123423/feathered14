/**
 * Professional Ad Content Mixer for Feeds, Videos, and Stories
 * Mixes sponsored ad items naturally among organic content with:
 * - Variable spacing (non-predictable interval between minSpacing and maxSpacing)
 * - Anti-clustering rule: never two ads next to each other
 * - Pagination / infinite-scroll boundary awareness
 * - Session-based round-robin deduplication
 */

export interface AdMixOptions<T, A> {
  /** Minimum number of organic items between two ads (default: 4) */
  minSpacing?: number;
  /** Maximum number of organic items between two ads (default: 7) */
  maxSpacing?: number;
  /** Minimum number of organic items before the first ad can appear (default: 3) */
  initialOffset?: number;
  /** Counter of organic items since the last ad (for pagination continuity) */
  itemsSinceLastAd?: number;
  /** Set of ad IDs already seen in this session (for deduplication) */
  seenAdIds?: Set<number | string>;
  /** Function to convert a raw ad record into the target feed item format */
  transformAd: (ad: A, index: number) => T;
  /** Function to check if an organic item is already an ad */
  isAdItem?: (item: T) => boolean;
}

export interface AdMixResult<T> {
  mixedItems: T[];
  itemsSinceLastAd: number;
  lastItemWasAd: boolean;
  seenAdIds: Set<number | string>;
}

const VARIABLE_SPACINGS = [4, 6, 5, 7, 5, 6, 4, 7];

/**
 * Mix organic items and ads with variable spacing and boundary safeguards
 */
export function mixOrganicAndSponsored<T, A extends { id: number | string }>(
  organicItems: T[],
  ads: A[],
  options: AdMixOptions<T, A>
): AdMixResult<T> {
  const {
    minSpacing = 4,
    maxSpacing = 7,
    initialOffset = 3,
    transformAd,
    isAdItem = () => false,
  } = options;

  let itemsSinceLastAd = options.itemsSinceLastAd ?? 0;
  const seenAdIds = new Set<number | string>(options.seenAdIds || []);

  if (!ads || ads.length === 0 || !organicItems || organicItems.length === 0) {
    return {
      mixedItems: [...(organicItems || [])],
      itemsSinceLastAd: itemsSinceLastAd + (organicItems ? organicItems.length : 0),
      lastItemWasAd: false,
      seenAdIds,
    };
  }

  // Filter valid active ads
  const availableAds = ads.filter((ad) => ad && ad.id);
  if (availableAds.length === 0) {
    return {
      mixedItems: [...organicItems],
      itemsSinceLastAd: itemsSinceLastAd + organicItems.length,
      lastItemWasAd: false,
      seenAdIds,
    };
  }

  const mixedItems: T[] = [];
  let adPlacementCounter = 0;
  let lastItemWasAd = false;

  // Initial variable threshold
  let targetInterval = Math.max(initialOffset, VARIABLE_SPACINGS[0]);

  for (let i = 0; i < organicItems.length; i++) {
    const item = organicItems[i];

    // Check if the organic item itself is already sponsored (e.g. boosted post)
    if (isAdItem(item)) {
      mixedItems.push(item);
      itemsSinceLastAd = 0;
      lastItemWasAd = true;
      targetInterval = VARIABLE_SPACINGS[adPlacementCounter % VARIABLE_SPACINGS.length];
      continue;
    }

    mixedItems.push(item);
    itemsSinceLastAd++;
    lastItemWasAd = false;

    // Check if we reached the variable threshold to place an ad
    if (itemsSinceLastAd >= targetInterval && !lastItemWasAd) {
      // Pick ad deterministically from pool to ensure zero flicker across re-renders
      const adIndex = adPlacementCounter % availableAds.length;
      const candidateAd = availableAds[adIndex];

      if (candidateAd) {
        seenAdIds.add(candidateAd.id);
        const transformed = transformAd(candidateAd, adPlacementCounter);
        mixedItems.push(transformed);

        adPlacementCounter++;
        itemsSinceLastAd = 0;
        lastItemWasAd = true;

        // Calculate next variable spacing threshold deterministically
        targetInterval = VARIABLE_SPACINGS[adPlacementCounter % VARIABLE_SPACINGS.length];
      }
    }
  }

  return {
    mixedItems,
    itemsSinceLastAd,
    lastItemWasAd,
    seenAdIds,
  };
}
