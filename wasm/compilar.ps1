param([string]$Zig = "zig")

$ErrorActionPreference = "Stop"

# Usa un compilador Zig disponible; este script no descarga ni instala herramientas.
& $Zig c++ -target wasm32-freestanding -O2 -nostdlib -ffreestanding -fno-builtin `
  '-Wl,--no-entry' '-Wl,--export-memory' `
  '-Wl,--export=reset_memory' '-Wl,--export=allocate' `
  '-Wl,--export=render_template' '-Wl,--export=result_length' `
  "$PSScriptRoot/templates.cpp" -o "$PSScriptRoot/templates.wasm"

if ($LASTEXITCODE -ne 0) {
    throw "No se pudo compilar templates.cpp a templates.wasm."
}
