import React from 'react';

interface FeatheredLogoProps {
  className?: string;
  color?: string;
  size?: number | string;
  glow?: boolean;
}

export const FeatheredLogo: React.FC<FeatheredLogoProps> = ({
  className = 'w-6 h-6',
  color = 'currentColor',
  size,
  glow = false,
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <defs>
        {glow && (
          <filter id="featheredGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="16" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      <g filter={glow ? 'url(#featheredGlow)' : undefined}>
        {/* Central Rachis / Shaft */}
        <path
          d="M 226,350 L 226,240 C 226,200 230,150 240,88 C 236,92 232,140 229,198 C 227,248 225,302 222,350 Z"
          fill={color}
        />
        {/* Bottom Quill Tip */}
        <path d="M 222,350 L 226,350 L 224,402 Z" fill={color} />

        {/* 1. Top Plume (F upper sweep) */}
        <path
          d="M 240,88 C 265,85 315,90 368,110 C 388,118 396,128 392,132 C 375,142 315,152 248,150 C 242,149 238,138 240,88 Z"
          fill={color}
        />

        {/* 2. Second Plume (Upper leaf under top sweep) */}
        <path
          d="M 246,160 C 282,160 330,174 364,198 C 370,203 366,210 354,213 C 312,224 265,224 242,212 C 240,211 242,168 246,160 Z"
          fill={color}
        />

        {/* 3. Third Plume (F crossbar) */}
        <path
          d="M 238,228 C 270,228 316,238 342,260 C 347,264 343,270 332,272 C 292,280 252,278 234,268 C 232,267 235,232 238,228 Z"
          fill={color}
        />

        {/* 4. Fourth Plume (Lower leaf under crossbar) */}
        <path
          d="M 232,284 C 255,286 288,300 306,322 C 310,327 305,331 294,332 C 265,334 242,326 230,318 C 228,316 230,288 232,284 Z"
          fill={color}
        />

        {/* 5. Left Upper Barb */}
        <path
          d="M 227,172 C 198,182 172,216 166,258 C 165,263 171,266 176,262 C 196,248 214,222 226,196 Z"
          fill={color}
        />

        {/* 6. Left Lower Barb */}
        <path
          d="M 224,266 C 202,280 182,310 178,342 C 177,347 183,349 189,345 C 205,332 218,308 223,286 Z"
          fill={color}
        />
      </g>
    </svg>
  );
};

export default FeatheredLogo;
