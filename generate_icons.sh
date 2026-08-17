#!/bin/bash
mkdir -p icons

for SIZE in 16 32 48 128; do
  # Regular icon
  cat > "icons/icon-${SIZE}.svg" << EOF
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 128 128">
  <!-- Dashed border -->
  <path d="M 84 12 L 12 12 L 12 116 L 68 116" fill="none" stroke="#111" stroke-width="10" stroke-dasharray="14 14" stroke-linecap="square" />
  
  <!-- Right edge dash -->
  <path d="M 116 53 L 116 61" fill="none" stroke="#111" stroke-width="10" stroke-linecap="square" />
  
  <!-- Top Right Box (Delete) -->
  <rect x="80" y="12" width="36" height="36" fill="#111" />
  <!-- White X -->
  <path d="M 90 22 L 106 38 M 106 22 L 90 38" stroke="#fff" stroke-width="6" stroke-linecap="round" />
  
  <!-- Bottom Right Box (Resize Grip) -->
  <rect x="64" y="64" width="52" height="52" fill="#111" />
</svg>
EOF

  qlmanage -t -s $SIZE -o icons "icons/icon-${SIZE}.svg" 2>/dev/null
  mv "icons/icon-${SIZE}.svg.png" "icons/bar${SIZE}-V2.png" 2>/dev/null || true
  
  # Active icon
  cat > "icons/icon-${SIZE}-active.svg" << EOF
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 128 128">
  <path d="M 84 12 L 12 12 L 12 116 L 68 116" fill="none" stroke="#111" stroke-width="10" stroke-dasharray="14 14" stroke-linecap="square" />
  <path d="M 116 53 L 116 61" fill="none" stroke="#111" stroke-width="10" stroke-linecap="square" />
  
  <rect x="80" y="12" width="36" height="36" fill="#111" />
  <path d="M 90 22 L 106 38 M 106 22 L 90 38" stroke="#fff" stroke-width="6" stroke-linecap="round" />
  
  <rect x="64" y="64" width="52" height="52" fill="#111" />
  
  <!-- Active indicator: green circle in bottom left -->
  <circle cx="36" cy="92" r="16" fill="#4CAF50" />
</svg>
EOF

  qlmanage -t -s $SIZE -o icons "icons/icon-${SIZE}-active.svg" 2>/dev/null
  mv "icons/icon-${SIZE}-active.svg.png" "icons/bar${SIZE}-active.png" 2>/dev/null || true
done

# Cleanup SVGs
rm icons/*.svg
