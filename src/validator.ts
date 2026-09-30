// Validador de las construcciones XSD utilizadas por PersonalWebML.
const XS = "http://www.w3.org/2001/XMLSchema";
const XSI = "http://www.w3.org/2001/XMLSchema-instance";

export function children(element: Element, name?: string): Element[] {
  return Array.from(element.children)
    .filter((entry) => !name || entry.localName === name);
}

export function child(element: Element, name: string): Element | undefined {
  return children(element, name)[0];
}

export function value(element: Element, name: string): string {
  return child(element, name)?.textContent?.trim() ?? "";
}

// El navegador analiza la sintaxis XML; no se permiten DTD ni entidades externas.
export function parseXml(text: string): XMLDocument {
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
  if (document.getElementsByTagName("*").length > 10000) {
    throw new Error("El XML supera los 10 000 elementos.");
  }

  return document;
}

export function validate(xml: XMLDocument, schema: XMLDocument): void {
  const definitions = children(schema.documentElement);

  function named(kind: string, name: string): Element | undefined {
    return definitions.find((entry) =>
      entry.localName === kind && entry.getAttribute("name") === name
    );
  }

  function fail(path: string, message: string): never {
    throw new Error(path + ": " + message);
  }

  // Comprueba tipos simples y restricciones: patrones, longitudes y enumeraciones.
  function simple(type: string, text: string, path: string): void {
    if (type.startsWith("xs:")) {
      const name = type.slice(3);
      const patterns: Record<string, RegExp> = {
        language: /^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/,
        gYear: /^\d{4}$/,
        boolean: /^(true|false|1|0)$/,
        positiveInteger: /^\+?[0-9]+$/,
      };

      if (["string", "token", "anyURI"].includes(name)) return;
      if (!patterns[name]) fail(path, "Tipo XSD no soportado: " + type);

      if (
        !patterns[name].test(text) ||
        (name === "gYear" && text === "0000") ||
        (name === "positiveInteger" && Number(text) <= 0)
      ) {
        fail(path, "Valor inválido para " + type);
      }
      return;
    }

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

    if (options.length && !options.includes(text)) {
      fail(path, "Valor fuera de la enumeración.");
    }

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

  // Recorre las secuencias respetando el orden y el número de repeticiones.
  function element(
    node: Element,
    declaration: Element,
    path: string,
    depth: number,
  ): void {
    if (depth > 32) fail(path, "Máximo 32 niveles de anidamiento.");
    if (node.namespaceURI) fail(path, "Los elementos no tienen namespace.");
    if (node.localName !== declaration.getAttribute("name")) {
      fail(path, "Elemento inesperado.");
    }

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

    if (!complex) {
      if (children(node).length) fail(path, "Se esperaba texto, no elementos.");
      simple(type || "xs:string", node.textContent?.trim() ?? "", path);
      return;
    }

    const unexpectedText = Array.from(node.childNodes)
      .some((entry) => entry.nodeType === 3 && entry.textContent?.trim());
    if (unexpectedText) fail(path, "Texto fuera de los elementos.");

    const sequence = child(complex, "sequence");
    if (!sequence || children(complex).length !== 1) {
      return fail(path, "Construcción XSD no soportada.");
    }

    const actual = children(node);
    let position = 0;

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

    if (position < actual.length) {
      fail(path, "Elemento inesperado, repetido o fuera de orden: <" +
        actual[position].localName + ">");
    }
  }

  if (schema.documentElement.namespaceURI !== XS) {
    throw new Error("El esquema no es XML Schema.");
  }

  const root = named("element", xml.documentElement.localName);
  if (!root) throw new Error("El elemento raíz debe ser <personalWeb>.");
  element(xml.documentElement, root, "/personalWeb", 0);
}
