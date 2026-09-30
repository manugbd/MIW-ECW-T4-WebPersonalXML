# PersonalWebML

Aplicación estática para generar un sitio web personal completo desde XML.

## Uso

1. Abre `index.html` con Live Server o sirve esta carpeta con cualquier servidor estático.

2. Descarga el XSD, edita uno de los XML, selecciónalo y pulsa **Generar y descargar ZIP**. La generación ocurre en el navegador. Es necesario servir la aplicación por HTTP para cargar los módulos JavaScript, las plantillas y WebAssembly.

3. El ZIP contiene `public/index.html`, las carpetas `perfil`, `proyectos`, `intereses-profesionales` y `ocio` con sus `index.html`, todos los CSS y JS originales de T2, el favicon y `public/img/` vacía. **Los enlaces son relativos**.

4. Copia tus imágenes a `public/img/` usando exactamente los nombres del XML. No se incluyen imágenes, documentos PDF, audio ni vídeo.

## Archivos

- `index.html` y `css/styles.css`: interfaz; HTML semántico y CSS por cascada, sin clases ni estilos inline.
- `schema/personalWeb.xsd`: definición oficial del lenguaje.
- `data/manuel.xml`: contenido de la web original de T2, adaptado al modelo; se omiten los artículos de audio/vídeo y el enlace a PDF.
- `data/ana.xml`: ejemplo medio con dos imágenes: `foto-perfil.png` y `logo-uniovi.png`.
- `data/carlos.xml`: ejemplo sencillo sin imágenes.
- `assets/templates/`: cinco plantillas HTML con marcadores.
- `assets/css/`, `assets/js/` y `assets/favicon.ico`: recursos originales de `public` de T2, copiados sin modificaciones.
- `assets/manifest.json`: lista de recursos que se añaden al ZIP.
- `src/validator.ts` y `src/site.ts`: TypeScript original.
- `js/validator.js` y `js/site.js`: versiones JavaScript sincronizadas con el TypeScript; el navegador ejecuta estos archivos.
- `js/generator.js`: selección de archivo, carga de recursos, coordinación y descarga.
- `js/templates.js`: intercambio de texto UTF-8 con WebAssembly.
- `js/zip.js` y `js/jszip.min.js`: generación del ZIP con JSZip 3.10.1, guardado localmente (aproximadamente 98 KB). Se conserva su aviso de licencia.
- `wasm/templates.cpp`: procesamiento de los marcadores `{{nombre}}`; devuelve el HTML final.
- `wasm/compilar.ps1`: genera `wasm/templates.wasm` con un compilador Zig disponible.
- `examples/manuel/` y `examples/ana/`: salidas de una generación anterior; no se han actualizado en este cambio.

## Lenguaje XML

El orden de los elementos es el definido en el XSD: `site`, `person`, `contact` opcional, `pages` y `footer`.

* `person` concentra nombre, titular, biografía, ubicación, año e imagen opcionales. El generador reutiliza la identidad y el contacto en la portada, el perfil y todas las cabeceras y pies. `site` contiene el título del sitio, la descripción y el idioma.

* `pages` contiene siempre `home`, `profile`, `projects`, `interests` y `leisure`. Cada página tiene un `title`, un `label` opcional para una navegación más corta, una `description` opcional y tantas `section` como necesites. La portada añade automáticamente enlaces a los otros cuatro apartados.

* Cada `section` admite `title`, `description` opcional, `identity` opcional, tantos `item` como necesites y otras secciones anidadas. `identity` con valor `true` reutiliza los datos personales y de contacto, por ejemplo en el CV.

* Dentro de un `item`, respeta este orden: `title`, `subtitle` opcional, `image` opcional, `paragraph` repetible, `bullet` repetible, `link` repetible y `section` repetible. Así puedes expresar estudios, experiencia, proyectos, intereses y aficiones con o sin imagen y subtítulo.

```xml
<section>
  <title>Experiencia profesional</title>
  <item>
    <title>Empresa de ejemplo</title>
    <subtitle>Desarrolladora · 2024–2026</subtitle>
    <image>
      <filename>empresa.png</filename>
      <alt>Logotipo de la empresa</alt>
    </image>
    <paragraph>Desarrollo de aplicaciones web.</paragraph>
    <bullet>Java y SQL</bullet>
    <link>
      <label>Web de la empresa</label>
      <url>https://example.com</url>
    </link>
  </item>
  <item>
    <title>Proyecto independiente</title>
    <paragraph>Este artículo no tiene imagen ni subtítulo.</paragraph>
  </item>
</section>
```

* Las imágenes usan un nombre de archivo, sin carpetas, con extensión `png`, `jpg`, `jpeg`, `gif`, `webp`, `svg` o `avif`, y texto alternativo obligatorio. `caption` es opcional. Los enlaces admiten HTTP y HTTPS. Los textos se escapan antes de insertarlos en HTML.

El validador lee el XSD y comprueba las construcciones que utiliza este lenguaje: secuencias, tipos, restricciones y cardinalidades. Es un validador específico de PersonalWebML, no un motor para cualquier XSD. Rechaza XML mal formado, elementos desconocidos, atributos no admitidos y DTD. Tamaño máximo: 2 MB.

## Compilación pendiente de WebAssembly

Con Zig disponible, ejecuta desde la carpeta del proyecto:

```powershell
.\wasm\compilar.ps1 -Zig "C:\ruta\a\zig.exe"
```

El script compila `templates.cpp` y coloca `templates.wasm` en la carpeta que carga JavaScript. Hasta hacerlo, el generador mostrará que falta compilar WebAssembly.

Los archivos JavaScript están sincronizados con TypeScript para utilizarlos sin Node. Si posteriormente modificas los `.ts`, actualiza su JavaScript o usa un compilador TypeScript disponible con `tsc -p tsconfig.json`.

C++ realiza la sustitución en dos pasadas: calcula el tamaño necesario y escribe el HTML. Detecta marcadores sin valor y dispone de 8 MB de memoria de trabajo reutilizable. Los textos ya llegan escapados desde TypeScript; los fragmentos HTML preparados se insertan directamente.

JSZip es una biblioteca local, no un framework ni un servidor. La aplicación se sirve como archivos estáticos.
