// site.js

import { child, children, parseXml, validate, value } from "./validator.js";

// Configuración de rutas y plantillas HTML para cada sección del sitio web.
const routes = [
  "index.html",
  "perfil/index.html",
  "proyectos/index.html",
  "intereses-profesionales/index.html",
  "ocio/index.html",
];

const templates = [
  "index",
  "perfil",
  "proyectos",
  "intereses-profesionales",
  "ocio",
];

export const pageKeys = ["home", "profile", "projects", "interests", "leisure"];

// Mapeo de caracteres especiales para prevención de inyecciones XSS.
const entities = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

// Escapamos los datos antes de incluirlos en atributos o contenido HTML.
function escapeHtml(content) {
  return content.replace(/[&<>"']/g, (character) => entities[character]);
}

// Extrae el texto de un elemento y lo convierte a HTML seguro.
function text(element, name) {
  return escapeHtml(value(element, name));
}

// Envuelve un texto en una etiqueta <p> si no está vacío.
function paragraph(content) {
  return content ? `<p>${escapeHtml(content)}</p>` : "";
}

// Obtiene la etiqueta de navegación (usa 'label' o recurre a 'title').
function label(page) {
  return text(page, value(page, "label") ? "label" : "title");
}

// Valida y limpia enlaces externos asegurando protocolo HTTP/HTTPS seguro.
function externalUrl(raw) {
  const parsed = new URL(raw);

  if (
    !["https:", "http:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("Solo se admiten enlaces HTTP(S) sin credenciales.");
  }

  return escapeHtml(parsed.href);
}

// Las imágenes son opcionales; solo se genera su referencia dentro de img/.
function image(element, prefix, width = 180, height = 80) {
  const imageElement = child(element, "image");
  if (!imageElement) return "";

  const filename = value(imageElement, "filename");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.(png|jpg|jpeg|gif|webp|svg|avif)$/i.test(filename)) {
    throw new Error("Nombre de imagen inválido: " + filename);
  }

  const caption = value(imageElement, "caption");

  return `<figure>
    <img src="${prefix}img/${escapeHtml(filename)}"
      alt="${text(imageElement, "alt")}" width="${width}" height="${height}">
    ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}
  </figure>`;
}

// Construye una lista <ul> de enlaces externos a partir del XML.
function links(element) {
  const entries = children(element, "link");
  if (!entries.length) return "";

  const items = entries.map((entry) => `<li>
    <a href="${externalUrl(value(entry, "url"))}"
      target="_blank" rel="noopener noreferrer">${text(entry, "label")}</a>
  </li>`);

  return `<ul>${items.join("\n")}</ul>`;
}

// Cada artículo puede incluir párrafos, listas, enlaces y secciones anidadas.
function item(element, prefix, level, identity, project = false) {
  const heading = Math.min(level, 6);
  const paragraphs = children(element, "paragraph")
    .map((entry) => paragraph(entry.textContent?.trim() ?? ""))
    .join("\n");

  const bullets = children(element, "bullet")
    .map((entry) => `<li>${escapeHtml(entry.textContent?.trim() ?? "")}</li>`)
    .join("\n");

  const subsections = children(element, "section")
    .map((entry) => section(entry, prefix, heading + 1, false, identity))
    .join("\n");

  return `<article>
    <header>
      ${image(element, prefix)}
      <h${heading}>${text(element, "title")}</h${heading}>
      ${paragraph(value(element, "subtitle"))}
    </header>
    ${project ? `<section> <h${Math.min(heading + 1, 6)}>Descripción</h${Math.min(heading + 1, 6)}>` : ""}
    ${paragraphs}
    ${bullets ? `<ul>${bullets}</ul>` : ""}
    ${links(element)}
    ${subsections}
    ${project ? "</section>" : ""}
  </article>`;
}

// Procesa secciones con sus encabezados, items de contenido y subsecciones recursivas.
function section(element, prefix, level, list, identity, project = false) {
  const heading = Math.min(level, 6);
  const entries = children(element, "item").map((entry) => {
    const content = item(entry, prefix, heading + 1, identity, project);
    return list ? `<li>${content}</li>` : content;
  });

  const content = entries.join("\n");
  const nested = children(element, "section")
    .map((entry) => section(entry, prefix, heading + 1, list, identity))
    .join("\n");

  return `<section>
    <header>
      <h${heading}>${text(element, "title")}</h${heading}>
      ${paragraph(value(element, "description"))}
    </header>
    ${["true", "1"].includes(value(element, "identity")) ? identity : ""}
    ${list && entries.length ? `<ul>${content}</ul>` : content}
    ${nested}
  </section>`;
}

// Preparamos los datos y fragmentos. C++ sustituye los marcadores de la plantilla.
export function createPages(xmlText, xsdText) {
  // Parsea y valida el documento XML de entrada contra el esquema XSD.
  const document = parseXml(xmlText);
  validate(document, parseXml(xsdText));

  const root = document.documentElement;
  const person = child(root, "person");
  const site = child(root, "site");
  const pages = child(root, "pages");
  const footer = child(root, "footer");
  const contact = child(root, "contact");

  if (!person || !site || !pages || !footer) {
    throw new Error("Faltan los datos principales del sitio.");
  }

  // Comprueba que existan los nodos de las páginas requeridas.
  const pageNodes = pageKeys.map((key) => {
    const page = child(pages, key);
    if (!page) throw new Error("Falta la página " + key);
    return page;
  });

  // Mapea y genera el contexto de valores para renderizar cada página del sitio.
  return pageKeys.map((key, index) => {
    const prefix = index === 0 ? "./" : "../";
    const page = pageNodes[index];

    // Construye el menú de navegación principal.
    const navigation = routes.map((route, position) => `<li>
      <a href="${prefix}${route}"${position === index ? ' aria-current="page"' : ""}>
        ${label(pageNodes[position])}
      </a>
    </li>`).join("\n");

    // Construye el menú de navegación para el pie de página.
    const footerNavigation = routes.map((route, position) => `<li>
      <a href="${prefix}${route}">${label(pageNodes[position])}</a>
    </li>`).join("\n");

    // Formatea los correos de contacto en lista de enlaces 'mailto:'.
    const emails = contact
      ? children(contact, "email").map((entry) => {
        const address = escapeHtml(entry.textContent?.trim() ?? "");
        return `<li><a href="mailto:${address}">${address}</a></li>`;
      }).join("\n")
      : "";

    const contacts = (emails ? `<ul>${emails}</ul>` : "") +
      (contact ? links(contact) : "");

    // Genera la lista de datos personales (ubicación, nacimiento).
    const details = ["location", "birthYear"].map((name, position) =>
      value(person, name)
        ? `<dt>${["Ubicación", "Año de nacimiento"][position]}</dt>
           <dd>${text(person, name)}</dd>`
        : ""
    ).join("\n");

    const facts = `<dl>
      <dt>Nombre</dt><dd>${text(person, "name")}</dd>
      ${details}
    </dl>`;

    // Bloque de resumen o biografía para inicio y perfil.
    const heading = key === "home" ? 1 : 2;
    const summary = `<section>
      ${key === "profile" ? image(person, prefix, 280, 280) : ""}
      <header>
        <h${heading}>${text(person, "name")}</h${heading}>
        ${paragraph(value(person, "headline"))}
        ${paragraph(value(person, "biography"))}
        ${facts}
        ${contacts}
      </header>
      ${key === "home" ? image(person, prefix, 320, 320) : ""}
    </section>`;

    const identity = `<article>
      <h3>${text(person, "name")}</h3>
      ${paragraph(value(person, "headline"))}
      ${facts}
      ${contacts}
    </article>`;

    // Genera tarjetas de acceso directo para la página principal.
    const cards = pageNodes.slice(1).map((entry, position) => `<li>
      <article>
        <h3><a href="${prefix}${routes[position + 1]}">${text(entry, "title")}</a></h3>
        ${paragraph(value(entry, "description"))}
      </article>
    </li>`).join("\n");

    // Procesa las secciones internas de la página actual.
    const sections = children(page, "section")
      .map((entry) => section(
        entry, prefix, 2, key === "profile" || key === "home", identity,
        key === "projects",
      ))
      .join("\n");

    // Objeto con la ruta destino, plantilla asociada y variables para la sustitución.
    return {
      path: "public/" + routes[index],
      template: templates[index],
      values: {
        language: text(site, "language"),
        siteTitle: text(site, "title"),
        siteDescription: text(site, "description"),
        name: text(person, "name"),
        homeLabel: label(pageNodes[0]),
        pageLabel: label(page),
        pageTitle: text(page, "title"),
        pageDescription: paragraph(value(page, "description")),
        prefix,
        navigation,
        footerNavigation,
        contacts,
        location: paragraph(value(person, "location")),
        footerDescription: text(footer, "description"),
        year: text(footer, "year"),
        summary: ["home", "profile"].includes(key) ? summary : "",
        cards: key === "home"
          ? `<section><header><h2>Apartados principales</h2></header>
              <ul>${cards}</ul></section>`
          : "",
        sections,
      },
    };
  });
}