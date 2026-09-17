# ArcLedger UI design

Light financial infrastructure: #F7F8FA background, white translucent surfaces, thin rgba(0,0,0,.06) borders, restrained shadows, generous whitespace. Primary text #111111; secondary #666A73; muted metadata. Green #16A36A, amber #D99A21, red #D84A4A reserved for status.

Geist typography with Geist Mono identifiers, bundled locally. Main content 1100–1200px, details 900–1000px. Cards 20px radius; buttons 12px; pills fully rounded. Black primary actions. Lucide monochrome icons. Tailwind utilities and a shadcn-style Button primitive.

Framer Motion entrances use opacity and an 8px translation for 320ms. Background blobs use pale blue, violet and cyan, blur 120px, opacity .12, slow 22-second movement. Respect prefers-reduced-motion. No dark theme, neon, charts, or wallet labels.

Pages: landing with large glass search and three capability cards; address balance with lightweight history rows; transaction with raw native/ERC-20 records merging into canonical movement; status with clear indexing metrics and separate validation state. Local sample data is always identified, and unknown/unavailable data is never presented as a real zero balance or successful validation.
