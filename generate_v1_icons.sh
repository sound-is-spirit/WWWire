#!/bin/bash
cd /Users/vesa.metsa-ketela/Code/WWWire/icons

# Ensure master.png is generated from the SVG base64
grep -o 'base64,[^"]*' wwwire-V1.svg | cut -d',' -f2 | base64 --decode > master.png

for SIZE in 16 32 48 128; do
  # 1. Inactive Icon (V2)
  sips -z $SIZE $SIZE master.png --out "bar${SIZE}-V2.png" 2>/dev/null
  
  # 2. Active Icon
  # Get base64 of the resized image
  B64=$(base64 -i "bar${SIZE}-V2.png")
  
  # Calculate circle dimensions relative to size
  CX=$(( SIZE * 28 / 128 ))
  if [ $CX -lt 4 ]; then CX=4; fi
  CY=$(( SIZE * 100 / 128 ))
  R=$(( SIZE * 16 / 128 ))
  if [ $R -lt 2 ]; then R=2; fi

  cat > "temp-active-${SIZE}.svg" << EOF
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <image href="data:image/png;base64,\${B64}" width="${SIZE}" height="${SIZE}" />
  <circle cx="\${CX}" cy="\${CY}" r="\${R}" fill="#4CAF50" />
</svg>
EOF
  
  qlmanage -t -s $SIZE -o . "temp-active-${SIZE}.svg" >/dev/null 2>&1
  mv "temp-active-${SIZE}.svg.png" "bar${SIZE}-active.png" 2>/dev/null || true
done

# Cleanup
rm -f temp-active-*.svg master.png
