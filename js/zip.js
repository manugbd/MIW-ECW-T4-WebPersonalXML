// zip.js

import "./jszip.min.js";

// JSZip construye el archivo binario y calcula sus comprobaciones de integridad.
export async function createZip(files) {
  const zip = new globalThis.JSZip();

  for (const file of files) {
    // Evita rutas absolutas o saltos de directorio ('..') por seguridad.
    if (file.path.startsWith("/") || file.path.split("/").includes("..")) {
      throw new Error("Ruta ZIP no permitida.");
    }

    // Crea carpeta si la ruta acaba en '/', o añade el archivo.
    if (file.path.endsWith("/")) {
      zip.folder(file.path.slice(0, -1));
    } else {
      zip.file(file.path, file.content);
    }
  }

  // Comprime todo y lo devuelve como un Uint8Array.
  return zip.generateAsync({ type: "uint8array" });
}