import { Reel, User } from '../types';

interface ScoredReel {
  reel: Reel;
  score: number;
}

const safeArray = <T,>(v: any): T[] => (Array.isArray(v) ? v : []);
const safeNumber = (v: any, fallback = 0) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const seededRand01 = (seed: number) => {
  let x = seed | 0;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  return ((x >>> 0) % 1_000_000) / 1_000_000;
};

const getReelAuthorId = (reel: any) =>
  safeNumber(reel.userId ?? reel.user_id ?? reel.author_id ?? 0);

const getReelId = (reel: any) =>
  safeNumber(reel.id ?? reel.reel_id ?? 0);

const CONSTANTS = {
  WEIGHT_FRESHNESS: 1.45,
  WEIGHT_ENGAGEMENT: 1.2,
  WEIGHT_AFFINITY: 0.85,
  WEIGHT_INTEREST: 0.35,
  WEIGHT_COMPLETENESS: 0.7,

  VAL_REACTION: 0.5,
  VAL_COMMENT: 2.2,
  VAL_SHARE: 3.5,
  VAL_VIEW: 0.03,

  DECAY_LAMBDA: 0.075,

  NEW_CREATOR_DAYS_THRESHOLD: 30,
  NEW_CREATOR_BOOST: 1.45,

  SMALL_CREATOR_TIER1: 200,
  SMALL_CREATOR_TIER2: 1000,
  SMALL_CREATOR_BOOST_TIER1: 1.9,
  SMALL_CREATOR_BOOST_TIER2: 1.35,

  DISCOVERY_BOOST: 1.22,
  VERY_NEW_CREATOR_EXTRA: 1.08,
  UNSEEN_AUTHOR_DAYS_THRESHOLD: 7,
  MIN_FOLLOWERS_FOR_DISCOVERY: 200,

  VIRAL_THRESHOLD: 30,
  VIRAL_MULTIPLIER: 1.18,

  VELOCITY_HOURS_THRESHOLD: 6,
  VELOCITY_ENGAGEMENT_THRESHOLD: 10,
  VELOCITY_MULTIPLIER: 1.28,

  EXPLORE_RATIO: 0.35,
  TOP_WINDOW: 18,
  MAX_PER_AUTHOR_IN_TOP_WINDOW: 2,
  NO_BACK_TO_BACK_AUTHOR: true,

  MAX_INPUT: 300,
};

const calculateInterestScore = (reel: Reel, viewer: User | null) => {
  const viewerInterests = safeArray<string>((viewer as any)?.interests).map((x) =>
    String(x).toLowerCase()
  );

  const reelTags = [
    ...safeArray<string>((reel as any)?.tags),
    ...(reel.caption ? String(reel.caption).toLowerCase().split(/\s+/).slice(0, 20) : []),
    ...(reel.songName ? [String(reel.songName).toLowerCase()] : []),
  ].map((x) => String(x).toLowerCase());

  if (!viewerInterests.length || !reelTags.length) return 0;

  let matches = 0;
  for (const tag of reelTags) {
    if (viewerInterests.includes(tag)) matches++;
  }

  return Math.min(matches * 0.4, 1.6);
};

const calculateAffinityScore = (viewer: User | null, author: User) => {
  if (!viewer || !safeNumber((viewer as any).id) || !safeNumber((author as any).id)) {
    return 1.0;
  }

  const viewerId = safeNumber((viewer as any).id);
  const authorId = safeNumber((author as any).id);

  if (!viewerId || !authorId || viewerId === authorId) return 1.0;

  const viewerFollowing = new Set<number>(safeArray<number>((viewer as any).following));
  const authorFollowers = new Set<number>(safeArray<number>((author as any).followers));

  const isFollowing = viewerFollowing.has(authorId);
  const isMutual = isFollowing && authorFollowers.has(viewerId);

  if (isMutual) return 1.45;
  if (isFollowing) return 1.18;
  return 1.0;
};

const calculateCompletenessScore = (reel: Reel) => {
  const hasCaption = !!String((reel as any).caption || '').trim();
  const hasSong = !!String((reel as any).songName || (reel as any).song_name || '').trim();
  const hasThumb = !!String((reel as any).thumbnail_url || (reel as any).thumbnail || '').trim();
  const hasLocation = !!String((reel as any).location || '').trim();

  let score = 0;
  if (hasCaption) score += 0.35;
  if (hasSong) score += 0.25;
  if (hasThumb) score += 0.2;
  if (hasLocation) score += 0.1;

  return score;
};

const calculateReelScore = (
  reel: Reel,
  viewer: User | null,
  author: User,
  seed = 1
) => {
  const now = Date.now();
  const createdAt = (reel as any).created_at || (reel as any).createdAt;
  const reelTime = createdAt ? new Date(createdAt).getTime() : now;
  const hoursSinceCreation = Math.max(0, (now - reelTime) / (1000 * 60 * 60));

  const freshnessScore = Math.exp(-CONSTANTS.DECAY_LAMBDA * hoursSinceCreation);

  const reactionsCount = safeArray((reel as any).reactions).length;
  const commentsCount = safeArray((reel as any).comments).length;
  const sharesCount = safeNumber((reel as any).shares);
  const viewsCount = safeNumber((reel as any).views);

  const rawEngagementValue =
    reactionsCount * CONSTANTS.VAL_REACTION +
    commentsCount * CONSTANTS.VAL_COMMENT +
    sharesCount * CONSTANTS.VAL_SHARE +
    viewsCount * CONSTANTS.VAL_VIEW;

  let viralMultiplier = 1.0;
  if (rawEngagementValue >= CONSTANTS.VIRAL_THRESHOLD) {
    viralMultiplier = CONSTANTS.VIRAL_MULTIPLIER;
  }

  let velocityMultiplier = 1.0;
  if (
    hoursSinceCreation <= CONSTANTS.VELOCITY_HOURS_THRESHOLD &&
    rawEngagementValue >= CONSTANTS.VELOCITY_ENGAGEMENT_THRESHOLD
  ) {
    velocityMultiplier = CONSTANTS.VELOCITY_MULTIPLIER;
  }

  const engagementScore =
    Math.log1p(rawEngagementValue) * viralMultiplier * velocityMultiplier;

  const affinityScore = calculateAffinityScore(viewer, author);
  const interestScore = calculateInterestScore(reel, viewer);
  const completenessScore = calculateCompletenessScore(reel);

  const baseScore =
    freshnessScore * CONSTANTS.WEIGHT_FRESHNESS +
    engagementScore * CONSTANTS.WEIGHT_ENGAGEMENT +
    affinityScore * CONSTANTS.WEIGHT_AFFINITY +
    interestScore * CONSTANTS.WEIGHT_INTEREST +
    completenessScore * CONSTANTS.WEIGHT_COMPLETENESS;

  const authorCreatedAt = (author as any).created_at
    ? new Date((author as any).created_at).getTime()
    : 0;
  const daysOnPlatform = authorCreatedAt
    ? (now - authorCreatedAt) / (1000 * 60 * 60 * 24)
    : 999;

  const followerCount = safeArray<number>((author as any).followers).length;

  const newCreatorBoost =
    daysOnPlatform <= CONSTANTS.NEW_CREATOR_DAYS_THRESHOLD
      ? CONSTANTS.NEW_CREATOR_BOOST
      : 1.0;

  const smallCreatorBoost =
    followerCount < CONSTANTS.SMALL_CREATOR_TIER1
      ? CONSTANTS.SMALL_CREATOR_BOOST_TIER1
      : followerCount < CONSTANTS.SMALL_CREATOR_TIER2
      ? CONSTANTS.SMALL_CREATOR_BOOST_TIER2
      : 1.0;

  let discoveryBoost = 1.0;
  if (viewer) {
    const following = new Set<number>(safeArray<number>((viewer as any).following));
    const viewerId = safeNumber((viewer as any).id);
    const authorId = safeNumber((author as any).id);

    const notFollowing = authorId && !following.has(authorId) && authorId !== viewerId;
    const isSmall = followerCount < CONSTANTS.MIN_FOLLOWERS_FOR_DISCOVERY;

    if (notFollowing && isSmall) {
      discoveryBoost = CONSTANTS.DISCOVERY_BOOST;
      if (daysOnPlatform <= CONSTANTS.UNSEEN_AUTHOR_DAYS_THRESHOLD) {
        discoveryBoost *= CONSTANTS.VERY_NEW_CREATOR_EXTRA;
      }
    }
  }

  const finalBoost = newCreatorBoost * smallCreatorBoost * discoveryBoost;

  const jitterSeed =
    seed +
    getReelId(reel) * 997 +
    safeNumber((author as any).id) * 131;

  const jitter = seededRand01(jitterSeed) * 0.05;

  return baseScore * finalBoost + jitter;
};

const mixExploreSlots = (
  scored: { reel: Reel; score: number }[],
  viewer: User | null,
  exploreRatio: number
) => {
  if (!viewer) return scored;

  const following = new Set<number>(safeArray<number>((viewer as any).following));
  const meId = safeNumber((viewer as any).id);

  const isFollowedOrSelf = (r: Reel) => {
    const authorId = getReelAuthorId(r);
    return authorId === meId || following.has(authorId);
  };

  const home = scored.filter((x) => isFollowedOrSelf(x.reel));
  const explore = scored.filter((x) => !isFollowedOrSelf(x.reel));

  if (!home.length || !explore.length) return scored;

  const targetExplore = Math.max(1, Math.round(scored.length * exploreRatio));
  const interval = Math.max(2, Math.floor(scored.length / targetExplore));

  const out: { reel: Reel; score: number }[] = [];
  let hi = 0;
  let ei = 0;

  while (out.length < scored.length && (hi < home.length || ei < explore.length)) {
    const shouldExplore = out.length > 0 && out.length % interval === 0 && ei < explore.length;

    if (shouldExplore) out.push(explore[ei++]);
    else if (hi < home.length) out.push(home[hi++]);
    else if (ei < explore.length) out.push(explore[ei++]);
    else break;
  }

  return out;
};

const applyDiversityConstraints = (
  scored: { reel: Reel; score: number }[],
  topWindow: number,
  maxPerAuthor: number,
  noBackToBack: boolean
) => {
  const result: { reel: Reel; score: number }[] = [];
  const authorCount = new Map<number, number>();

  for (const item of scored) {
    const authorId = getReelAuthorId(item.reel);
    const lastAuthorId = result.length ? getReelAuthorId(result[result.length - 1].reel) : -1;

    const inTopWindow = result.length < topWindow;
    const seen = authorCount.get(authorId) || 0;

    if (inTopWindow) {
      if (seen >= maxPerAuthor) continue;
      if (noBackToBack && authorId === lastAuthorId) continue;
    } else {
      if (noBackToBack && authorId === lastAuthorId) continue;
    }

    result.push(item);
    authorCount.set(authorId, seen + 1);
  }

  return result;
};

export const rankReels = (
  reels: Reel[],
  viewer: User | null,
  users: User[],
  seed = 1
): Reel[] => {
  if (!Array.isArray(reels) || reels.length === 0) return [];

  const input = reels.slice(0, CONSTANTS.MAX_INPUT);

  const userMap = new Map<number, User>();
  safeArray(users).forEach((u: any) => {
    const id = safeNumber(u?.id ?? u?.user_id ?? u?.userId);
    if (id) userMap.set(id, u);
  });

  const scored: ScoredReel[] = input.map((reel) => {
    const authorId = getReelAuthorId(reel);

    const author =
      userMap.get(authorId) ||
      ({
        id: authorId,
        name: 'User',
        username: 'user',
        followers: [],
        following: [],
        created_at: null,
      } as any);

    const score = calculateReelScore(reel, viewer, author, seed);
    return { reel, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const mixed = mixExploreSlots(
    scored.map((x) => ({ reel: x.reel, score: x.score })),
    viewer,
    CONSTANTS.EXPLORE_RATIO
  );

  const constrained = applyDiversityConstraints(
    mixed,
    CONSTANTS.TOP_WINDOW,
    CONSTANTS.MAX_PER_AUTHOR_IN_TOP_WINDOW,
    CONSTANTS.NO_BACK_TO_BACK_AUTHOR
  );

  return constrained.map((x) => x.reel);
};
