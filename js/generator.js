// generator.js
import { createPages } from "./site.js";
import { createTemplateRenderer } from "./templates.js";
import { createZip } from "./zip.js";

// Referencias a los elementos del DOM de la interfaz de usuario.
const input = document.getElementById("xmlFile");
const button = document.getElementById("generateButton");
const status = document.getElementById("status");
let busy = false; // Flag para evitar ejecuciones concurrentes mientras se procesa un archivo.

// Leemos el esquema, las plantillas y los recursos desde el servidor estático.
// Soporta la descarga de archivos como texto o como arrays de bytes (binary = true).
async function resource(path, binary = false) {
  const response = await fetch(path);

  // Manejo de errores HTTP en la carga de recursos estáticos.
  if (!response.ok) {
    if (path === "wasm/templates.wasm" && response.status === 404) {
      throw new Error("Falta compilar wasm/templates.cpp con wasm/compilar.ps1.");
    }
    throw new Error("No se puede cargar " + path + " (" + response.status + ").");
  }

  // Retorna Uint8Array para archivos binarios (ej. .wasm) o texto para el resto.
  return binary
    ? new Uint8Array(await response.arrayBuffer())
    : response.text();
}

// TypeScript prepara los datos, C++ renderiza el HTML y JSZip empaqueta la web.
// Construye el archivo ZIP final a partir de la entrada de texto del XML.
export async function buildArchive(xmlText) {
  // Carga simultánea del esquema XSD de validación y el manifiesto de assets estáticos.
  const [schema, manifest] = await Promise.all([
    resource("schema/personalWeb.xsd"),
    resource("assets/manifest.json"),
  ]);

  // Prepara la estructura de las páginas parseando el XML contra el esquema.
  const preparedPages = createPages(xmlText, schema);
  // Inicializa el renderizador WebAssembly cargando el módulo binario compilado.
  const render = await createTemplateRenderer(
    await resource("wasm/templates.wasm", true),
  );

  // Genera en paralelo el contenido HTML de cada página aplicando su plantilla correspondiente.
  const pages = await Promise.all(preparedPages.map(async (page) => {
    const template = await resource(
      "assets/templates/" + page.template + ".html",
    );

    return {
      path: page.path,
      content: render(template, page.values),
    };
  }));

  // Carga binaria en paralelo de todos los recursos listados en el manifest.json.
  const assets = await Promise.all(JSON.parse(manifest).map(async (path) => ({
    path: "public/" + path,
    content: await resource("assets/" + path, true),
  })));

  // Empaqueta las páginas renderizadas, los assets y la carpeta de imágenes en un archivo ZIP.
  return createZip([
    ...pages,
    ...assets,
    { path: "public/img/", content: "" },
  ]);
}

// Escucha cambios en el input de tipo archivo para actualizar el estado del botón y el texto informativo.
input.addEventListener("change", () => {
  button.disabled = busy || !input.files.length;
  status.textContent = input.files.length
    ? "Seleccionado: " + input.files[0].name
    : "Selecciona un XML para comenzar.";
});

// Maneja el envío del formulario para procesar el XML y descargar el sitio generado.
input.form.addEventListener("submit", async (event) => {
  event.preventDefault(); // Evita el refresco de la página al enviar el formulario.
  if (busy || !input.files.length) return;

  const file = input.files[0];
  // Bloquea la interfaz mientras dura el proceso de generación.
  busy = true;
  button.disabled = true;
  input.disabled = true;
  status.textContent = "Validando XML y generando las cinco páginas…";

  try {
    // Validaciones previas en el cliente: límite de 2 MB de tamaño.
    if (file.size > 2 * 1024 * 1024) {
      throw new Error("El XML supera el máximo de 2 MB.");
    }
    // Validación previa en el cliente: comprobación de extensión de archivo.
    if (!file.name.toLowerCase().endsWith(".xml")) {
      throw new Error("Selecciona un archivo .xml.");
    }

    // Lee el archivo XML y genera los bytes del paquete ZIP final.
    const zip = await buildArchive(await file.text());
    // Crea un objeto URL temporal en memoria para permitir la descarga del Blob ZIP.
    const url = URL.createObjectURL(
      new Blob([zip], { type: "application/zip" }),
    );

    // La descarga usa un enlace temporal; liberamos el archivo después.
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name.replace(/\.xml$/i, "") + "-web.zip";
    document.body.append(link);
    link.click(); // Dispara la descarga automáticamente en el navegador.
    link.remove();
    // Revoca la URL temporal a los 30 segundos para liberar memoria.
    setTimeout(() => URL.revokeObjectURL(url), 30000);

    status.textContent =
      "ZIP generado. Extrae el archivo y añade tus imágenes a public/img/.";
  } catch (error) {
    // Captura y muestra los errores de validación, red o ejecución WASM.
    status.textContent = "No se ha generado el ZIP. " + error.message;
  } finally {
    // Restablece el estado de los controles de la interfaz tras finalizar el proceso.
    busy = false;
    input.disabled = false;
    button.disabled = !input.files.length;
  }
});