const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="16" fill="#071f46"/>
  <path d="M15 33c0-10.6 6.6-18 17-18s17 7.4 17 18-6.6 18-17 18-17-7.4-17-18Zm9 0c0 6.2 2.8 10 8 10s8-3.8 8-10-2.8-10-8-10-8 3.8-8 10Z" fill="#fff"/>
  <circle cx="51" cy="13" r="4" fill="#70b7ee"/>
</svg>`;

export function GET() {
  return new Response(favicon, {
    headers: {
      "Cache-Control": "public, max-age=86400, immutable",
      "Content-Type": "image/svg+xml; charset=utf-8",
    },
  });
}
