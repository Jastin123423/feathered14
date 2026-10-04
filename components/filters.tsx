// components/filters.tsx
import React, { useMemo, useState } from "react";

/* ============================================================
   UNERA Filters
   ✅ No AI
   ✅ No face detection
   ✅ No lips / eyes / nose / teeth targeting
   ✅ Works on camera preview, images, and videos using CSS filters
============================================================ */

export type UneraFilterCategory =
  | "all"
  | "trending"
  | "beauty"
  | "cinema"
  | "warm"
  | "cool"
  | "vintage"
  | "mono";

export type UneraFilter = {
  id: string;
  name: string;
  category: Exclude<UneraFilterCategory, "all">;
  cssFilter: string;
  overlay?: string;
  preview: string;
};

const PREVIEW =
  "https://media.unera.social/file_0000000089ac71f6832fa066b0321098.png";

export const UNERA_FILTERS: UneraFilter[] = [
  {
    id: "none",
    name: "Original",
    category: "trending",
    preview: PREVIEW,
    cssFilter: "none",
  },
  {
    id: "soft-glow",
    name: "Soft Glow",
    category: "trending",
    preview: PREVIEW,
    cssFilter: "brightness(1.08) contrast(1.02) saturate(1.12)",
    overlay: "radial-gradient(circle at 50% 35%, rgba(255,255,255,0.14), transparent 52%)",
  },
  {
    id: "clean",
    name: "Clean",
    category: "beauty",
    preview: PREVIEW,
    cssFilter: "brightness(1.07) contrast(0.96) saturate(1.1)",
    overlay: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,210,220,0.06))",
  },
  {
    id: "smooth",
    name: "Smooth",
    category: "beauty",
    preview: PREVIEW,
    cssFilter: "brightness(1.1) contrast(0.93) saturate(1.06)",
    overlay: "rgba(255,255,255,0.055)",
  },
  {
    id: "golden",
    name: "Golden",
    category: "warm",
    preview: PREVIEW,
    cssFilter: "brightness(1.05) contrast(1.06) saturate(1.2) sepia(0.16)",
    overlay: "linear-gradient(180deg, rgba(255,176,70,0.15), rgba(255,90,70,0.08))",
  },
  {
    id: "sunset",
    name: "Sunset",
    category: "warm",
    preview: PREVIEW,
    cssFilter: "brightness(1.02) contrast(1.08) saturate(1.26) sepia(0.2)",
    overlay: "linear-gradient(135deg, rgba(255,122,69,0.18), rgba(255,90,106,0.12))",
  },
  {
    id: "aqua",
    name: "Aqua",
    category: "cool",
    preview: PREVIEW,
    cssFilter: "brightness(1.04) contrast(1.05) saturate(1.12) hue-rotate(8deg)",
    overlay: "linear-gradient(180deg, rgba(50,180,255,0.13), rgba(0,0,0,0.03))",
  },
  {
    id: "ice",
    name: "Ice",
    category: "cool",
    preview: PREVIEW,
    cssFilter: "brightness(1.07) contrast(1.02) saturate(0.94) hue-rotate(14deg)",
    overlay: "rgba(120,200,255,0.11)",
  },
  {
    id: "cinema",
    name: "Cinema",
    category: "cinema",
    preview: PREVIEW,
    cssFilter: "brightness(0.96) contrast(1.18) saturate(1.06)",
    overlay: "linear-gradient(180deg, rgba(0,0,0,0.2), transparent 38%, rgba(0,0,0,0.26))",
  },
  {
    id: "drama",
    name: "Drama",
    category: "cinema",
    preview: PREVIEW,
    cssFilter: "brightness(0.92) contrast(1.27) saturate(1.04)",
    overlay: "radial-gradient(circle at center, transparent 45%, rgba(0,0,0,0.28))",
  },
  {
    id: "retro",
    name: "Retro",
    category: "vintage",
    preview: PREVIEW,
    cssFilter: "brightness(1.02) contrast(1.05) saturate(0.9) sepia(0.28)",
    overlay: "rgba(255,210,140,0.1)",
  },
  {
    id: "film",
    name: "Film",
    category: "vintage",
    preview: PREVIEW,
    cssFilter: "brightness(0.98) contrast(1.15) saturate(0.82) sepia(0.18)",
    overlay: "linear-gradient(90deg, rgba(255,255,255,0.04), transparent, rgba(0,0,0,0.08))",
  },
  {
    id: "mono",
    name: "Mono",
    category: "mono",
    preview: PREVIEW,
    cssFilter: "grayscale(1) contrast(1.12) brightness(1.02)",
  },
  {
    id: "silver",
    name: "Silver",
    category: "mono",
    preview: PREVIEW,
    cssFilter: "grayscale(1) contrast(0.96) brightness(1.14)",
    overlay: "rgba(255,255,255,0.05)",
  },
];

const FILTER_CATEGORIES: { id: UneraFilterCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "trending", label: "Trending" },
  { id: "beauty", label: "Beauty" },
  { id: "cinema", label: "Cinema" },
  { id: "warm", label: "Warm" },
  { id: "cool", label: "Cool" },
  { id: "vintage", label: "Vintage" },
  { id: "mono", label: "B&W" },
];

export const getUneraFilterById = (id?: string): UneraFilter => {
  return UNERA_FILTERS.find((f) => f.id === id) || UNERA_FILTERS[0];
};

export const buildUneraFilterStyle = (filterId?: string): React.CSSProperties => {
  const filter = getUneraFilterById(filterId);
  return {
    filter: filter.cssFilter,
  };
};

export const UneraFilterOverlay: React.FC<{ filterId?: string }> = ({ filterId }) => {
  const filter = getUneraFilterById(filterId);

  if (!filter.overlay) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background: filter.overlay,
        mixBlendMode: "screen",
        zIndex: 5,
      }}
    />
  );
};

type FiltersProps = {
  selectedFilterId?: string;
  onSelectFilter?: (filter: UneraFilter) => void;
  onClose?: () => void;
};

const Filters: React.FC<FiltersProps> = ({
  selectedFilterId = "none",
  onSelectFilter,
  onClose,
}) => {
  const [activeCategory, setActiveCategory] = useState<UneraFilterCategory>("all");

  const selectedFilter = getUneraFilterById(selectedFilterId);

  const filtered = useMemo(() => {
    if (activeCategory === "all") return UNERA_FILTERS;
    return UNERA_FILTERS.filter((f) => f.category === activeCategory);
  }, [activeCategory]);

  return (
    <div className="fixed inset-x-0 bottom-0 z-[99999] h-[44vh] min-h-[330px] max-h-[430px] bg-[#111]/95 backdrop-blur-2xl rounded-t-[28px] border-t border-white/10 shadow-[0_-18px_45px_rgba(0,0,0,0.55)] overflow-hidden text-white">
      <div className="h-14 px-4 flex items-center justify-between">
        <div>
          <div className="text-[16px] font-black leading-tight">Effects</div>
          <div className="text-[12px] text-white/55 font-semibold">{selectedFilter.name}</div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/15 flex items-center justify-center active:scale-95"
          aria-label="Close filters"
        >
          <i className="fas fa-times text-white text-[16px]" />
        </button>
      </div>

      <div className="flex gap-5 overflow-x-auto px-4 pb-3 scrollbar-hide border-b border-white/5">
        {FILTER_CATEGORIES.map((cat) => {
          const active = activeCategory === cat.id;

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`relative pb-2 text-[14px] font-black whitespace-nowrap ${
                active ? "text-white" : "text-white/50"
              }`}
            >
              {cat.label}
              {active && (
                <span className="absolute left-0 right-0 bottom-0 h-[3px] rounded-full bg-white" />
              )}
            </button>
          );
        })}
      </div>

      <div className="h-[calc(100%-106px)] overflow-y-auto px-4 py-4">
        <div className="grid grid-cols-4 gap-x-3 gap-y-5">
          {filtered.map((filter) => {
            const selected = filter.id === selectedFilterId;

            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => onSelectFilter?.(filter)}
                className="flex flex-col items-center gap-2 active:scale-95 transition-transform"
              >
                <div
                  className={`relative w-[72px] h-[72px] rounded-[20px] overflow-hidden bg-[#0F172A] border-2 ${
                    selected ? "border-white shadow-[0_0_0_3px_rgba(255,255,255,0.18)]" : "border-white/5"
                  }`}
                >
                  <img
                    src={filter.preview}
                    alt={filter.name}
                    className="w-full h-full object-cover"
                    style={{ filter: filter.cssFilter }}
                  />

                  {filter.overlay && (
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background: filter.overlay,
                        mixBlendMode: "screen",
                      }}
                    />
                  )}

                  {selected && (
                    <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white text-black flex items-center justify-center text-[13px] font-black">
                      ✓
                    </div>
                  )}
                </div>

                <span className="text-[12px] font-bold text-white/85 max-w-[82px] truncate">
                  {filter.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Filters;
