// templates.js 

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Cargamos una sola instancia y la reutilizamos para las cinco plantillas.
export async function createTemplateRenderer(wasmBytes) {
  const { instance } = await WebAssembly.instantiate(wasmBytes, {});
  const { memory, reset_memory, allocate, render_template, result_length } =
    instance.exports;

  // Valida que el binario exponga las funciones requeridas de C++.
  if (
    !(memory instanceof WebAssembly.Memory) ||
    [reset_memory, allocate, render_template, result_length]
      .some((entry) => typeof entry !== "function")
  ) {
    throw new Error("Compila wasm/templates.cpp con wasm/compilar.ps1.");
  }

  // UTF-8 conserva tildes y otros caracteres al intercambiar texto con C++.
  // Asigna memoria en WASM y copia los bytes del texto.
  function write(bytes) {
    const address = allocate(bytes.length);
    if (!address) throw new Error("Memoria WebAssembly insuficiente.");

    new Uint8Array(memory.buffer, address, bytes.length).set(bytes);
    return address;
  }

  return (template, values) => {
    reset_memory();

    // US separa clave/valor y RS separa registros; XML 1.0 no admite esos controles.
    // Serializa los datos usando separadores de control.
    const records = Object.entries(values).map(([key, content]) => {
      if (/[\u001e\u001f]/.test(key + content)) {
        throw new Error("El contenido incluye un separador reservado.");
      }
      return key + "\u001f" + content + "\u001e";
    }).join("");

    // Pasa la plantilla y variables a C++ para su renderizado.
    const source = encoder.encode(template);
    const data = encoder.encode(records);
    const sourceAddress = write(source);
    const valuesAddress = write(data);
    const address = render_template(
      sourceAddress, source.length, valuesAddress, data.length,
    );

    if (address === -1) throw new Error("La plantilla contiene un marcador sin valor.");
    if (address <= 0) throw new Error("Memoria WebAssembly insuficiente.");

    // Recupera y convierte el HTML renderizado.
    return decoder.decode(
      new Uint8Array(memory.buffer, address, result_length()),
    );
  };
}