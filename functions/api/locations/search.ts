// functions/api/locations/search.ts
export const onRequestGet: PagesFunction = async ({ request }) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim();
    const limit = Math.min(Number(url.searchParams.get("limit") || 5), 10);

    if (q.length < 3) {
      return Response.json({ success: true, results: [] }, { headers: cors });
    }

    // Proxy to Nominatim (keep your frontend clean + avoid CORS/rate issues)
    const upstream = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=${limit}&q=${encodeURIComponent(
      q
    )}`;

    const res = await fetch(upstream, {
      headers: {
        // Nominatim policy: identify your app
        "User-Agent": "unera.social/1.0 (Marketplace Location Search)",
        "Accept": "application/json",
      },
    });

    const data = await res.json().catch(() => []);
    const results = Array.isArray(data) ? data : [];

    // Return only what UI needs
    return Response.json(
      {
        success: true,
        results: results.map((r: any) => ({
          display_name: r.display_name,
          lat: r.lat,
          lon: r.lon,
          address: r.address,
        })),
      },
      { headers: cors }
    );
  } catch (e: any) {
    return Response.json(
      { success: false, error: e?.message || "Location search failed" },
      { status: 500, headers: cors }
    );
  }
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
