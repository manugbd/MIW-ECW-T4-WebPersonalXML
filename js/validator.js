// validator.js

// Namespaces estándar de XML Schema usados para validar los elementos.
const XS = "http://www.w3.org/2001/XMLSchema";
const XSI = "http://www.w3.org/2001/XMLSchema-instance";

// Filtra los hijos directos de un nodo por su nombre local.
export function children(element, name) {
  return Array.from(element.children)
    .filter((entry) => !name || entry.localName === name);
}

// Devuelve el primer elemento hijo que coincida.
export function child(element, name) {
  return children(element, name)[0];
}

// Obtiene el texto limpio de un elemento hijo.
export function value(element, name) {
  return child(element, name)?.textContent?.trim() ?? "";
}

// Parsea un string XML y aplica restricciones básicas de seguridad.
export function parseXml(text) {
  // Evita ataques XXE bloqueando DTDs y entidades externas.
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) {
    throw new Error("No se permiten DTD ni entidades externas.");
  }

  const document = new DOMParser().parseFromString(text, "application/xml");
  const error = document.querySelector("parsererror");

  if (error) {
    throw new Error("XML mal formado: " + error.textContent?.slice(0, 300));
  }
  if (!document.documentElement) {
    throw new Error("El documento XML está vacío.");
  }
  // Evita XMLs demasiado grandes.
  if (document.getElementsByTagName("*").length > 10000) {
    throw new Error("El XML supera los 10 000 elementos.");
  }

  return document;
}

// Valida un documento XML contra un esquema XSD dado.
export function validate(xml, schema) {
  const definitions = children(schema.documentElement);

  // Busca una definición global en el esquema por tipo y nombre.
  function named(kind, name) {
    return definitions.find((entry) =>
      entry.localName === kind && entry.getAttribute("name") === name
    );
  }

  // Lanza un error incluyendo la ruta del nodo fallido.
  function fail(path, message) {
    throw new Error(path + ": " + message);
  }

  // Valida el valor de los tipos simples y sus facetas/restricciones.
  function simple(type, text, path) {
    if (type.startsWith("xs:")) {
      const name = type.slice(3);
      const patterns = {
        language: /^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/,
        gYear: /^\d{4}$/,
        boolean: /^(true|false|1|0)$/,
        positiveInteger: /^\+?[0-9]+$/,
      };

      if (["string", "token", "anyURI"].includes(name)) return;
      if (!patterns[name]) fail(path, "Tipo XSD no soportado: " + type);

      // Valida el formato y reglas específicas del tipo nativo.
      if (
        !patterns[name].test(text) ||
        (name === "gYear" && text === "0000") ||
        (name === "positiveInteger" && Number(text) <= 0)
      ) {
        fail(path, "Valor inválido para " + type);
      }
      return;
    }

    // Procesa restricciones de tipos personalizados (simpleType).
    const definition = named("simpleType", type);
    if (!definition) return fail(path, "Tipo desconocido: " + type);

    const restriction = child(definition, "restriction");
    if (!restriction) return fail(path, "Restricción XSD no soportada.");

    const base = restriction.getAttribute("base");
    if (!base) return fail(path, "Falta el tipo base de la restricción.");
    if (base === "xs:token") text = text.replace(/\s+/g, " ").trim();
    simple(base, text, path);

    const facets = children(restriction);
    const options = facets
      .filter((entry) => entry.localName === "enumeration")
      .map((entry) => entry.getAttribute("value"));

    // Comprueba enumeraciones.
    if (options.length && !options.includes(text)) {
      fail(path, "Valor fuera de la enumeración.");
    }

    // Comprueba patrones y límites de longitud.
    for (const facet of facets) {
      const rule = facet.localName;
      const raw = facet.getAttribute("value") ?? "";

      if (rule === "pattern" && !new RegExp("^(?:" + raw + ")$", "u").test(text)) {
        fail(path, "El valor no cumple el patrón del esquema.");
      } else if (rule === "minLength" && Array.from(text).length < Number(raw)) {
        fail(path, "Texto demasiado corto.");
      } else if (rule === "maxLength" && Array.from(text).length > Number(raw)) {
        fail(path, "Texto demasiado largo.");
      } else if (!["pattern", "enumeration", "minLength", "maxLength"].includes(rule)) {
        fail(path, "Faceta XSD no soportada: " + rule);
      }
    }
  }

  // Valida un nodo de forma recursiva (atributos, secuencias y cardinalidad).
  function element(node, declaration, path, depth) {
    if (depth > 32) fail(path, "Máximo 32 niveles de anidamiento.");
    if (node.namespaceURI) fail(path, "Los elementos no tienen namespace.");
    if (node.localName !== declaration.getAttribute("name")) {
      fail(path, "Elemento inesperado.");
    }

    // Comprueba que no haya atributos no permitidos.
    for (const attribute of Array.from(node.attributes)) {
      if (attribute.namespaceURI === "http://www.w3.org/2000/xmlns/") continue;
      if (
        depth === 0 && attribute.namespaceURI === XSI &&
        attribute.localName === "noNamespaceSchemaLocation"
      ) {
        continue;
      }
      fail(path, "Atributo no permitido: " + attribute.name);
    }

    const type = declaration.getAttribute("type");
    const complex = child(declaration, "complexType") ||
      (type ? named("complexType", type) : undefined);

    // Si no es un tipo complejo, valida su valor de texto simple.
    if (!complex) {
      if (children(node).length) fail(path, "Se esperaba texto, no elementos.");
      simple(type || "xs:string", node.textContent?.trim() ?? "", path);
      return;
    }

    // Rechaza texto suelto entre elementos de un tipo complejo.
    const unexpectedText = Array.from(node.childNodes)
      .some((entry) => entry.nodeType === 3 && entry.textContent?.trim());
    if (unexpectedText) fail(path, "Texto fuera de los elementos.");

    const sequence = child(complex, "sequence");
    if (!sequence || children(complex).length !== 1) {
      return fail(path, "Construcción XSD no soportada.");
    }

    const actual = children(node);
    let position = 0;

    // Recorre los elementos esperados de la secuencia verificando min/maxOccurs.
    for (const expected of children(sequence)) {
      if (expected.namespaceURI !== XS || expected.localName !== "element") {
        fail(path, "Solo se admite xs:element dentro de sequence.");
      }

      const name = expected.getAttribute("name") ?? "";
      const minimum = Number(expected.getAttribute("minOccurs") ?? 1);
      const maximum = expected.getAttribute("maxOccurs") === "unbounded"
        ? Infinity
        : Number(expected.getAttribute("maxOccurs") ?? 1);
      let count = 0;

      // Consume los nodos que coinciden consecutivamente.
      while (
        position < actual.length && actual[position].localName === name &&
        count < maximum
      ) {
        count += 1;
        element(
          actual[position], expected, path + "/" + name + "[" + count + "]",
          depth + 1,
        );
        position += 1;
      }

      if (count < minimum) {
        fail(path, "Falta <" + name + "> o los elementos están fuera de orden.");
      }
    }

    // Falla si quedan elementos sin consumir en la secuencia.
    if (position < actual.length) {
      fail(path, "Elemento inesperado, repetido o fuera de orden: <" +
        actual[position].localName + ">");
    }
  }

  // Verifica que el esquema sea XSD e inicia la validación desde la raíz.
  if (schema.documentElement.namespaceURI !== XS) {
    throw new Error("El esquema no es XML Schema.");
  }

  const root = named("element", xml.documentElement.localName);
  if (!root) throw new Error("El elemento raíz debe ser <personalWeb>.");
  element(xml.documentElement, root, "/personalWeb", 0);
}